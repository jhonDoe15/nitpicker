//! Which field writes SpotBugs takes for a non-atomic operation. It reads a method's instructions in order and keeps
//! the fields read since the last instruction that is not a load of a local, a constant from `iconst_0` to `iconst_5`,
//! `lconst`, `fconst`, `dconst` or `ldc`, a field read, a call (`invokedynamic` aside), a load from an `int`, `long`,
//! `float` or `double` array, or an arithmetic instruction. An arithmetic instruction marks the fields read so far; a
//! write of a marked field is the operation. Anything else (a store, `pop`, `dup`, a conversion, a jump, `new`,
//! `checkcast`, `bipush`, `sipush`, `iconst_m1`) forgets them, and so does every write. This module writes javac's
//! instruction order for a method body as those three kinds of step.
use super::super::Context;
use super::super::fields::field_key;
use crate::engine::source::{children, named_children};
use crate::java::helpers::declarators;
use crate::java::types::expr::Binding;
use crate::java::types::model::Type;
use crate::java::types::scope::TYPE_DECLARATIONS;
use std::collections::HashSet;
use tree_sitter::Node;

type Key = (String, String);

#[derive(Clone)]
enum Op {
    Keep,
    Read(Key),
    Arith,
    Forget,
    Write(usize, Key),
}

struct Code<'c, 'a> {
    context: &'c Context<'a>,
    ops: Vec<Op>,
}

fn primitive(kind: &Option<Type>) -> Option<&'static str> {
    match kind {
        Some(Type::Primitive(name)) => Some(name),
        _ => None,
    }
}

/// The type an arithmetic operator works in after javac widens both sides.
fn promoted(left: Option<&str>, right: Option<&str>) -> &'static str {
    let rank = |name: Option<&str>| match name {
        Some("double") => 3,
        Some("float") => 2,
        Some("long") => 1,
        _ => 0,
    };
    ["int", "long", "float", "double"][rank(left).max(rank(right))]
}

fn stack_kind(name: &str) -> &'static str {
    match name {
        "long" => "long",
        "float" => "float",
        "double" => "double",
        _ => "int",
    }
}

fn character(text: &str) -> Option<i64> {
    let inner = text.strip_prefix('\'')?.strip_suffix('\'')?;
    let mut chars = inner.chars();
    match (chars.next()?, chars.next()) {
        ('\\', Some(escaped)) => Some(match escaped {
            'n' => 10,
            't' => 9,
            'r' => 13,
            'b' => 8,
            'f' => 12,
            '0' => 0,
            's' => 32,
            'u' => i64::from_str_radix(inner.trim_start_matches("\\u").trim_start_matches('u'), 16).ok()?,
            other => other as i64,
        }),
        (single, None) => Some(single as i64),
        _ => None,
    }
}

impl<'c, 'a> Code<'c, 'a> {
    fn push(&mut self, op: Op) {
        self.ops.push(op);
    }

    fn kind(&self, node: Node) -> Option<Type> {
        self.context.resolver.type_of(node)
    }

    /// Whether javac folds the expression into one constant.
    fn constant(&self, node: Node) -> bool {
        let node = crate::java::types::expr::unwrap(node);
        match node.kind() {
            "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" | "decimal_floating_point_literal"
            | "hex_floating_point_literal" | "character_literal" | "string_literal" | "true" | "false" => true,
            "identifier" | "field_access" => self.context.resolver.constant_field(node),
            "unary_expression" => node.child_by_field_name("operand").is_some_and(|operand| self.constant(operand)),
            "binary_expression" => {
                let both = node.child_by_field_name("left").is_some_and(|left| self.constant(left)) && node.child_by_field_name("right").is_some_and(|right| self.constant(right));
                both && !matches!(node.child_by_field_name("operator").map(|operator| self.context.text(operator)), Some("&&" | "||"))
            }
            "cast_expression" => primitive(&node.child_by_field_name("type").and_then(|kind| self.context.resolver.type_node(kind))).is_some() && node.child_by_field_name("value").is_some_and(|value| self.constant(value)),
            "ternary_expression" => ["condition", "consequence", "alternative"].iter().all(|part| node.child_by_field_name(part).is_some_and(|part| self.constant(part))),
            _ => false,
        }
    }

    /// The instruction a constant becomes when javac loads it as a value of `kind`.
    fn load_constant(&mut self, node: Node<'a>, kind: &str) {
        let node = crate::java::types::expr::unwrap(node);
        if !matches!(stack_kind(kind), "int") || primitive(&self.kind(node)).is_none() {
            return self.push(Op::Keep);
        }
        let value = super::super::folds::number(self.context, node).or_else(|| match node.kind() {
            "character_literal" => character(self.context.text(node)),
            "true" => Some(1),
            "false" => Some(0),
            _ => None,
        });
        let value = value.or_else(|| self.field_number(node));
        self.push(match value {
            Some(0..=5) | None => Op::Keep,
            Some(-32768..=32767) => Op::Forget,
            Some(_) => Op::Keep,
        });
    }

    fn field_number(&self, node: Node) -> Option<i64> {
        let key = field_key(self.context, node)?;
        let (_, field) = self.context.resolver.index.field(&key.0, &key.1)?;
        match field.constant.as_deref() {
            Some("true") => Some(1),
            Some("false") => Some(0),
            _ => field.number,
        }
    }

    /// A value of type `from` turned into one of type `to`: a conversion instruction between primitives, a call for
    /// boxing and unboxing.
    fn convert(&mut self, from: &Option<Type>, to: &str) {
        match primitive(from) {
            Some(from) if stack_kind(from) != stack_kind(to) => self.push(Op::Forget),
            Some(from) if matches!(to, "byte" | "short" | "char") && from != to => self.push(Op::Forget),
            Some(_) => {}
            None => {
                self.push(Op::Keep);
                let unboxed = match from {
                    Some(Type::Class(name, _)) => match name.as_str() {
                        "java.lang.Long" => "long",
                        "java.lang.Float" => "float",
                        "java.lang.Double" => "double",
                        _ => "int",
                    },
                    _ => "int",
                };
                if stack_kind(unboxed) != stack_kind(to) {
                    self.push(Op::Forget);
                }
            }
        }
    }

    /// An operand of an arithmetic instruction working in `kind`.
    fn operand(&mut self, node: Node<'a>, kind: &str) {
        if self.constant(node) {
            return self.load_constant(node, kind);
        }
        self.value(node);
        let from = self.kind(node);
        self.convert(&from, kind);
    }

    fn statement(&mut self, node: Node<'a>) {
        let field = |name: &str| node.child_by_field_name(name);
        match node.kind() {
            "block" => named_children(node).into_iter().for_each(|part| self.statement(part)),
            "local_variable_declaration" => {
                for value in declarators(node).into_iter().filter_map(|declarator| declarator.child_by_field_name("value")) {
                    self.value(value);
                    self.push(Op::Forget);
                }
            }
            "expression_statement" => {
                if let Some(expression) = node.named_child(0) {
                    self.effect(expression);
                }
            }
            "if_statement" => {
                self.value_of(field("condition"));
                self.push(Op::Forget);
                self.statement_of(field("consequence"));
                if let Some(otherwise) = field("alternative") {
                    self.push(Op::Forget);
                    self.statement(otherwise);
                }
            }
            "while_statement" | "do_statement" | "for_statement" | "enhanced_for_statement" => {
                let mut cursor = node.walk();
                let init: Vec<Node> = node.children_by_field_name("init", &mut cursor).collect();
                for part in init {
                    if part.kind() == "local_variable_declaration" { self.statement(part) } else { self.effect(part) }
                }
                self.value_of(field("value"));
                self.push(Op::Forget);
                if node.kind() != "do_statement" {
                    self.value_of(field("condition"));
                    self.push(Op::Forget);
                }
                self.statement_of(field("body"));
                let mut cursor = node.walk();
                let update: Vec<Node> = node.children_by_field_name("update", &mut cursor).collect();
                update.into_iter().for_each(|part| self.effect(part));
                if node.kind() == "do_statement" {
                    self.value_of(field("condition"));
                }
                self.push(Op::Forget);
            }
            "return_statement" | "throw_statement" | "yield_statement" => {
                self.value_of(node.named_child(0).filter(|part| !part.kind().ends_with("comment")));
                self.push(Op::Forget);
            }
            "synchronized_statement" => {
                self.value_of(node.named_child(0));
                self.push(Op::Forget);
                self.statement_of(field("body"));
                self.push(Op::Forget);
            }
            "switch_expression" => {
                self.switch(node);
                self.push(Op::Forget);
            }
            ";" | "empty_statement" | "line_comment" | "block_comment" => {}
            kind if TYPE_DECLARATIONS.contains(&kind) => {}
            _ => {
                self.push(Op::Forget);
                for part in named_children(node) {
                    if part.kind().ends_with("statement") || part.kind() == "block" {
                        self.statement(part);
                    } else if matches!(part.kind(), "catch_clause" | "finally_clause" | "resource_specification" | "switch_block") {
                        self.nested(part);
                    } else if !part.kind().ends_with("comment") && part.kind() != "identifier" {
                        self.value(part);
                    }
                    self.push(Op::Forget);
                }
            }
        }
    }

    /// The statements of a clause, each part on its own.
    fn nested(&mut self, node: Node<'a>) {
        for part in named_children(node) {
            match part.kind() {
                "block" => self.statement(part),
                "switch_block_statement_group" | "switch_rule" => {
                    for inner in named_children(part).into_iter().filter(|inner| inner.kind() != "switch_label") {
                        if inner.kind().ends_with("statement") || inner.kind() == "block" { self.statement(inner) } else { self.effect(inner) }
                    }
                    if part.kind() == "switch_rule" {
                        self.push(Op::Forget);
                    }
                }
                "resource" => {
                    if let Some(value) = part.child_by_field_name("value") {
                        self.value(value);
                    }
                    self.push(Op::Forget);
                }
                _ => self.push(Op::Forget),
            }
        }
    }

    fn switch(&mut self, node: Node<'a>) {
        self.value_of(node.child_by_field_name("condition"));
        self.push(Op::Forget);
        if let Some(body) = node.child_by_field_name("body") {
            self.nested(body);
        }
    }

    fn statement_of(&mut self, node: Option<Node<'a>>) {
        if let Some(node) = node {
            self.statement(node);
        }
    }

    fn value_of(&mut self, node: Option<Node<'a>>) {
        if let Some(node) = node {
            self.value(node);
        }
    }

    /// An expression whose value is thrown away: javac pops what a call or a `new` leaves.
    fn effect(&mut self, node: Node<'a>) {
        let node = crate::java::types::expr::unwrap(node);
        match node.kind() {
            "assignment_expression" => self.assign(node, false),
            "update_expression" => self.update(node, false),
            _ => {
                self.value(node);
                if !matches!(self.kind(node), Some(Type::Primitive("void"))) {
                    self.push(Op::Forget);
                }
            }
        }
    }

    /// The field a target names, and whether the object holding it is loaded first.
    fn target(&self, node: Node) -> Option<(Key, bool)> {
        let node = crate::java::types::expr::unwrap(node);
        let key = match node.kind() {
            "identifier" => match self.context.resolver.binding(node, self.context.text(node))? {
                Binding::Field(..) => field_key(self.context, node)?,
                Binding::Local(_) => return None,
            },
            "field_access" => field_key(self.context, node)?,
            _ => return None,
        };
        let is_static = self.context.resolver.index.field(&key.0, &key.1).is_some_and(|(_, field)| field.flags & crate::java::types::model::flag::STATIC != 0);
        Some((key, !is_static))
    }

    fn holder(&mut self, node: Node<'a>) {
        let node = crate::java::types::expr::unwrap(node);
        match node.kind().eq("field_access").then(|| node.child_by_field_name("object")).flatten() {
            Some(object) => self.value(object),
            None => self.push(Op::Keep),
        }
    }

    fn field_type(&self, key: &Key) -> Option<&'static str> {
        let (_, field) = self.context.resolver.index.field(&key.0, &key.1)?;
        primitive(&Some(field.kind.clone()))
    }

    fn assign(&mut self, node: Node<'a>, used: bool) {
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return self.push(Op::Forget) };
        let operator = node.child_by_field_name("operator").map(|operator| self.context.text(operator)).unwrap_or("=");
        let Some((key, instance)) = self.target(left) else {
            self.value(left);
            self.value(right);
            return self.push(Op::Forget);
        };
        let kind = self.field_type(&key).unwrap_or("int");
        if instance {
            self.holder(left);
        }
        if operator == "=" {
            if self.constant(right) {
                self.load_constant(right, kind);
            } else {
                self.value(right);
                let from = self.kind(right);
                if primitive(&from).is_some() {
                    self.convert(&from, kind);
                }
            }
        } else {
            if instance {
                self.push(Op::Forget);
            }
            self.push(Op::Read(key.clone()));
            let symbol = operator.trim_end_matches('=');
            let shift = matches!(symbol, "<<" | ">>" | ">>>");
            let work = if shift { stack_kind(kind) } else { promoted(Some(kind), primitive(&self.kind(right))) };
            self.convert(&Some(Type::Primitive(kind)), work);
            self.operand(right, if shift { "int" } else { work });
            self.push(Op::Arith);
            self.convert(&Some(Type::Primitive(work)), kind);
        }
        if used {
            self.push(Op::Forget);
        }
        self.push(Op::Write(node.id(), key));
    }

    fn update(&mut self, node: Node<'a>, used: bool) {
        let Some(operand) = node.named_child(0) else { return self.push(Op::Forget) };
        let Some((key, instance)) = self.target(operand) else { return self.push(Op::Forget) };
        let kind = self.field_type(&key).unwrap_or("int");
        let prefix = children(node).first().is_some_and(|first| matches!(first.kind(), "++" | "--"));
        if instance {
            self.holder(operand);
            self.push(Op::Forget);
        }
        self.push(Op::Read(key.clone()));
        if used && !prefix {
            self.push(Op::Forget);
        }
        self.push(Op::Keep);
        self.push(Op::Arith);
        if matches!(kind, "byte" | "short" | "char") {
            self.push(Op::Forget);
        }
        if used && prefix {
            self.push(Op::Forget);
        }
        self.push(Op::Write(node.id(), key));
    }

    fn arguments(&mut self, call: Node<'a>) {
        let parameters = match call.kind() {
            "method_invocation" => self.context.resolver.resolve_call(call).map(|call| (call.method.parameters, call.method.varargs)),
            _ => None,
        };
        let arguments: Vec<Node> = call.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
        for (at, argument) in arguments.iter().enumerate() {
            let wanted = parameters.as_ref().and_then(|(parameters, varargs)| {
                let spread = *varargs && at + 1 >= parameters.len();
                if spread { None } else { parameters.get(at).cloned() }
            });
            if parameters.as_ref().is_some_and(|(parameters, varargs)| *varargs && at + 1 == parameters.len() && arguments.len() != parameters.len()) {
                self.push(Op::Forget);
            }
            match wanted {
                Some(Type::Primitive(kind)) if self.constant(*argument) => self.load_constant(*argument, kind),
                Some(Type::Primitive(kind)) => {
                    self.value(*argument);
                    let from = self.kind(*argument);
                    self.convert(&from, kind);
                }
                _ => {
                    self.value(*argument);
                    if primitive(&self.kind(*argument)).is_some() {
                        self.push(Op::Keep);
                    }
                }
            }
            if parameters.as_ref().is_some_and(|(parameters, varargs)| *varargs && at + 1 >= parameters.len() && arguments.len() != parameters.len()) {
                self.push(Op::Forget);
            }
        }
    }

    fn value(&mut self, node: Node<'a>) {
        if self.constant(node) {
            let kind = primitive(&self.kind(node)).unwrap_or("int");
            return self.load_constant(node, kind);
        }
        match node.kind() {
            "parenthesized_expression" => named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).for_each(|part| self.value(part)),
            "identifier" => match self.context.resolver.binding(node, self.context.text(node)) {
                Some(Binding::Field(..)) => {
                    match field_key(self.context, node) {
                        Some(key) => {
                            if self.target(node).is_some_and(|(_, instance)| instance) {
                                self.push(Op::Keep);
                            }
                            self.push(Op::Read(key));
                        }
                        None => self.push(Op::Keep),
                    }
                }
                _ => self.push(Op::Keep),
            },
            "this" | "super" | "class_literal" => self.push(Op::Keep),
            "null_literal" => self.push(Op::Forget),
            "field_access" => {
                let key = field_key(self.context, node);
                if let Some(object) = node.child_by_field_name("object") {
                    let is_static = self.target(node).is_some_and(|(_, instance)| !instance);
                    let names_class = matches!(self.context.resolver.receiver(object), Some(crate::java::types::expr::Receiver::Static(_)));
                    if !(is_static && names_class) {
                        self.value(object);
                    }
                    if is_static && !names_class {
                        self.push(Op::Forget);
                    }
                }
                match key {
                    Some(key) => self.push(Op::Read(key)),
                    None => self.push(if node.child_by_field_name("field").is_some_and(|field| self.context.text(field) == "length") { Op::Forget } else { Op::Keep }),
                }
            }
            "method_invocation" => {
                match node.child_by_field_name("object") {
                    Some(object) => {
                        let names_class = matches!(self.context.resolver.receiver(object), Some(crate::java::types::expr::Receiver::Static(_)));
                        if !names_class {
                            self.value(object);
                        }
                    }
                    None => {
                        if !self.context.resolver.resolve_call(node).is_some_and(|call| call.method.is_static) {
                            self.push(Op::Keep);
                        }
                    }
                }
                self.arguments(node);
                self.push(Op::Keep);
            }
            "object_creation_expression" => {
                self.push(Op::Forget);
                self.push(Op::Forget);
                self.arguments(node);
                self.push(Op::Keep);
            }
            "array_access" => {
                self.value_of(node.child_by_field_name("array"));
                self.value_of(node.child_by_field_name("index"));
                let element = primitive(&self.kind(node));
                self.push(if matches!(element, Some("int" | "long" | "float" | "double")) { Op::Keep } else { Op::Forget });
            }
            "binary_expression" => self.binary(node),
            "unary_expression" => {
                let operator = node.child(0).map(|operator| self.context.text(operator)).unwrap_or("");
                let Some(operand) = node.child_by_field_name("operand") else { return self.push(Op::Forget) };
                let kind = stack_kind(primitive(&self.kind(node)).unwrap_or("int"));
                match operator {
                    "+" => self.operand(operand, kind),
                    "-" => {
                        self.operand(operand, kind);
                        self.push(Op::Arith);
                    }
                    "~" => {
                        self.operand(operand, kind);
                        self.push(if kind == "int" { Op::Forget } else { Op::Keep });
                        self.push(Op::Arith);
                    }
                    _ => {
                        self.value(operand);
                        self.push(Op::Forget);
                    }
                }
            }
            "cast_expression" => {
                let Some(value) = node.child_by_field_name("value") else { return self.push(Op::Forget) };
                let target = node.child_by_field_name("type").and_then(|kind| self.context.resolver.type_node(kind));
                self.value(value);
                let from = self.kind(value);
                match (primitive(&target), primitive(&from)) {
                    (Some(to), Some(_)) => self.convert(&from, to),
                    (Some(to), None) => {
                        self.push(Op::Forget);
                        self.convert(&from, to);
                    }
                    (None, Some(_)) => self.push(Op::Keep),
                    (None, None) => {
                        let upcast = matches!((&target, &from), (Some(Type::Class(to, _)), Some(Type::Class(from, _))) if self.context.resolver.index.is_subtype(from, to));
                        if !upcast {
                            self.push(Op::Forget);
                        }
                    }
                }
            }
            "ternary_expression" => {
                match super::super::folds::fixed(self.context, node.child_by_field_name("condition")) {
                    Some(true) => self.value_of(node.child_by_field_name("consequence")),
                    Some(false) => self.value_of(node.child_by_field_name("alternative")),
                    None => {
                        self.value_of(node.child_by_field_name("condition"));
                        self.push(Op::Forget);
                        self.value_of(node.child_by_field_name("consequence"));
                        self.push(Op::Forget);
                        self.value_of(node.child_by_field_name("alternative"));
                    }
                }
            }
            "assignment_expression" => self.assign(node, true),
            "update_expression" => self.update(node, true),
            "switch_expression" => self.switch(node),
            _ => {
                for part in named_children(node) {
                    if part.kind() == "class_body" || part.kind().ends_with("comment") {
                        continue;
                    }
                    if part.kind() == "block" { self.statement(part) } else if !matches!(part.kind(), "lambda_expression" | "method_reference") { self.value(part) }
                }
                self.push(Op::Forget);
            }
        }
    }

    fn binary(&mut self, node: Node<'a>) {
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return self.push(Op::Forget) };
        let operator = node.child_by_field_name("operator").map(|operator| self.context.text(operator)).unwrap_or("");
        let result = primitive(&self.kind(node));
        let arithmetic = matches!(operator, "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | ">>>" | "&" | "|" | "^") && result.is_some_and(|result| result != "boolean");
        let bits = matches!(operator, "&" | "|" | "^") && result == Some("boolean");
        if arithmetic || bits {
            let shift = matches!(operator, "<<" | ">>" | ">>>");
            let work = if bits { "int" } else { stack_kind(result.unwrap_or("int")) };
            self.operand(left, work);
            self.operand(right, if shift { "int" } else { work });
            return self.push(Op::Arith);
        }
        if operator == "+" {
            self.value(left);
            self.value(right);
            return self.push(Op::Forget);
        }
        self.value(left);
        if !matches!(operator, "&&" | "||") {
            let kind = promoted(primitive(&self.kind(left)), primitive(&self.kind(right)));
            let numbers = primitive(&self.kind(left)).is_some() && primitive(&self.kind(right)).is_some() && !matches!(operator, "==" | "!=" if primitive(&self.kind(left)) == Some("boolean"));
            if numbers {
                let from = self.kind(left);
                self.convert(&from, kind);
                self.operand(right, kind);
                return self.push(Op::Forget);
            }
        }
        self.push(Op::Forget);
        self.value(right);
        self.push(Op::Forget);
    }
}

/// The writes of a body that SpotBugs reports as non-atomic operations, by node id.
pub fn operations<'a>(context: &Context<'a>, body: Node<'a>) -> HashSet<usize> {
    let mut code = Code { context, ops: Vec::new() };
    code.statement(body);
    let mut read: HashSet<Key> = HashSet::new();
    let mut marked: HashSet<Key> = HashSet::new();
    let mut found = HashSet::new();
    for op in code.ops {
        match op {
            Op::Keep => {}
            Op::Read(key) => {
                read.insert(key);
            }
            Op::Arith => marked.extend(read.iter().cloned()),
            Op::Forget => {
                read.clear();
                marked.clear();
            }
            Op::Write(node, key) => {
                if marked.contains(&key) {
                    found.insert(node);
                }
                read.clear();
                marked.clear();
            }
        }
    }
    found
}
