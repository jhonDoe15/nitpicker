//! Static types of expressions, as far as declarations, the index and erased signatures give them.
use std::rc::Rc;
use super::model::{ClassInfo, Field, Method, OBJECT, Type};
use std::collections::HashMap;
use super::scope::{Resolver, class_at, enclosing_type, enclosing_types};
use crate::engine::source::children;
use tree_sitter::Node;

const STRING: &str = "java.lang.String";

pub fn unwrap(mut node: Node) -> Node {
    while node.kind() == "parenthesized_expression" {
        match crate::engine::source::named_children(node).into_iter().find(|inner| !inner.kind().ends_with("comment")) {
            Some(inner) => node = inner,
            None => break,
        }
    }
    node
}

fn boxed(name: &str) -> Option<&'static str> {
    Some(match name {
        "java.lang.Integer" => "int",
        "java.lang.Long" => "long",
        "java.lang.Short" => "short",
        "java.lang.Byte" => "byte",
        "java.lang.Character" => "char",
        "java.lang.Double" => "double",
        "java.lang.Float" => "float",
        "java.lang.Boolean" => "boolean",
        _ => return None,
    })
}

fn numeric_rank(kind: &Type) -> Option<u8> {
    let name = match kind {
        Type::Primitive(name) => *name,
        Type::Class(name, _) => boxed(name)?,
        _ => return None,
    };
    Some(match name {
        "byte" | "short" | "char" | "int" => 0,
        "long" => 1,
        "float" => 2,
        "double" => 3,
        _ => return None,
    })
}

/// The value of a string literal with its escapes decoded. Text blocks are left out.
pub fn literal_text(file: &crate::engine::source::SourceFile, literal: Node) -> Option<String> {
    let literal = unwrap(literal);
    let text = file.text_of(literal);
    if literal.kind() != "string_literal" || text.len() < 2 {
        return None;
    }
    let block = text.starts_with("\"\"\"");
    let stripped = if block { text_block(text)? } else { text[1..text.len() - 1].to_string() };
    let mut value = String::new();
    let mut chars = stripped.chars().peekable();
    while let Some(c) = chars.next() {
        if c != '\\' {
            value.push(c);
            continue;
        }
        match chars.next()? {
            'n' => value.push('\n'),
            't' => value.push('\t'),
            'r' => value.push('\r'),
            'b' => value.push('\u{8}'),
            'f' => value.push('\u{c}'),
            's' => value.push(' '),
            '\n' if block => {}
            'u' => {
                while chars.peek() == Some(&'u') {
                    chars.next();
                }
                let code: String = chars.by_ref().take(4).collect();
                value.push(char::from_u32(u32::from_str_radix(&code, 16).ok()?)?);
            }
            digit @ '0'..='7' => {
                let mut code = digit.to_digit(8)?;
                while code < 32 && chars.peek().is_some_and(|next| next.is_digit(8)) {
                    code = code * 8 + chars.next()?.to_digit(8)?;
                }
                value.push(char::from_u32(code)?);
            }
            other => value.push(other),
        }
    }
    Some(value)
}

/// The content of a text block before escapes: the shared indentation and the trailing blanks of each line are dropped.
fn text_block(text: &str) -> Option<String> {
    let inner = text.strip_prefix("\"\"\"")?.strip_suffix("\"\"\"")?;
    let inner = inner.replace("\r\n", "\n");
    let (_, content) = inner.split_once('\n')?;
    let lines: Vec<&str> = content.split('\n').collect();
    let last = lines.len() - 1;
    let blank = |line: &str| line.trim().is_empty();
    let indent = lines
        .iter()
        .enumerate()
        .filter(|(at, line)| *at == last || !blank(line))
        .map(|(_, line)| line.len() - line.trim_start().len())
        .min()
        .unwrap_or(0);
    let cut: Vec<&str> = lines.iter().map(|line| if blank(line) { "" } else { line[indent.min(line.len())..].trim_end() }).collect();
    Some(cut.join("\n"))
}

fn widens(from: &str, to: &str) -> bool {
    const ORDER: &[&str] = &["byte", "short", "int", "long", "float", "double"];
    let place = |name: &str| ORDER.iter().position(|known| *known == name);
    match (if from == "char" { Some(1) } else { place(from) }, place(to)) {
        (Some(a), Some(b)) => a < b && !(from == "char" && to == "short"),
        _ => false,
    }
}

pub enum Binding<'a> {
    Local(Option<Type>),
    Field(Type, &'a ClassInfo, &'a Field),
}

pub enum Receiver {
    Value(Type),
    Static(String),
}

enum Shape {
    Typed(Type),
    /// A lambda or method reference, with the parameter counts it can take (empty when not known),
    /// and whether it can stand for a function without a result, and for one with a result.
    /// The last flag: the body is known to give a primitive value, which PMD does not box in the first phase.
    Function(Vec<usize>, bool, bool, bool),
    Unknown,
}

pub struct Call {
    /// Called on a value of a raw type: member types are erased.
    pub raw: bool,
    pub receiver: Type,
    pub declaring: String,
    pub method: Method,
}

/// How many types one question may work out before it is given up: nested generic calls can ask for each other
/// over and over.
const WORK_LIMIT: u32 = 20_000;
/// Questions given up, over the whole run.
pub static GIVEN_UP: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

const FUNCTIONS: &[&str] = &["lambda_expression", "method_reference"];

/// Whether a lambda can stand for a function without a result, and for one with a result.
fn lambda_results(lambda: Node) -> (bool, bool) {
    let Some(body) = lambda.child_by_field_name("body") else { return (true, true) };
    if body.kind() != "block" {
        let statement = matches!(body.kind(), "method_invocation" | "assignment_expression" | "update_expression" | "object_creation_expression");
        return (statement, true);
    }
    let (mut bare, mut valued) = (false, false);
    let mut stack = vec![body];
    while let Some(node) = stack.pop() {
        for kid in children(node) {
            match kid.kind() {
                "lambda_expression" | "class_body" => {}
                "return_statement" => {
                    if kid.named_child_count() > 0 {
                        valued = true;
                    } else {
                        bare = true;
                    }
                }
                _ => stack.push(kid),
            }
        }
    }
    let last = crate::engine::source::named_children(body).into_iter().filter(|kid| !kid.kind().ends_with("comment")).last();
    let ends = last.is_some_and(|last| matches!(last.kind(), "throw_statement" | "while_statement" | "for_statement" | "do_statement"));
    (!valued, !bare && (valued || ends))
}

fn mentions(kind: &Type, variable: &str) -> bool {
    match kind {
        Type::Variable(name) => name == variable,
        Type::Class(_, arguments) => arguments.iter().any(|argument| mentions(argument, variable)),
        Type::Array(element) => mentions(element, variable),
        _ => false,
    }
}

fn call_arguments<'t>(call: Node<'t>) -> Vec<Node<'t>> {
    let Some(list) = call.child_by_field_name("arguments") else { return Vec::new() };
    let mut cursor = list.walk();
    list.named_children(&mut cursor).filter(|node| !node.kind().ends_with("comment")).collect()
}

impl<'a> Resolver<'a> {
    /// The class seen from inside itself: its type parameters stand for their bounds.
    fn own_type(&self, name: &str) -> Type {
        let bounds = self.index.get(name).map(|info| info.type_parameters.iter().map(|(_, bound)| bound.clone()).collect());
        Type::Class(name.to_string(), bounds.unwrap_or_default())
    }

    fn field_type(&self, owner: &Type, declaring: &ClassInfo, field: &Field) -> Type {
        let kind = field.generic.substitute(&self.index.member_map(owner, &declaring.name));
        if kind.open() { field.kind.clone() } else { kind }
    }

    fn raw(&self, kind: &Type) -> bool {
        matches!(kind, Type::Class(name, given) if given.is_empty() && self.index.generic(name))
    }

    fn field_of(&self, owner: &Type, name: &str) -> Option<Type> {
        let (declaring, field) = self.index.field(&owner.name(), name)?;
        if self.raw(owner) && declaring.type_parameters.iter().any(|(name, _)| mentions(&field.generic, name)) {
            return Some(field.kind.clone());
        }
        Some(self.field_type(owner, declaring, field))
    }

    fn element(&self, iterated: Type) -> Option<Type> {
        match iterated {
            Type::Array(element) => Some(*element),
            other => self.index.arguments_as(&other, "java.lang.Iterable")?.into_iter().next().filter(|kind| !kind.open()),
        }
    }

    /// The local variables a block declares directly: name, where the statement starts, and the places of the
    /// statement in the block and of the declarator in the statement. Kept per block, first declaration first.
    fn locals_of(&self, block: Node) -> Rc<Vec<(String, usize, u32, u32)>> {
        if let Some(known) = self.locals.borrow().get(&block.id()) {
            return known.clone();
        }
        let mut declared = Vec::new();
        let mut cursor = block.walk();
        for (place, statement) in block.children(&mut cursor).enumerate() {
            if statement.kind() != "local_variable_declaration" {
                continue;
            }
            let mut inner = statement.walk();
            for (at, declarator) in statement.children(&mut inner).enumerate() {
                if declarator.kind() != "variable_declarator" {
                    continue;
                }
                if let Some(name) = declarator.child_by_field_name("name") {
                    declared.push((self.file.text_of(name).to_string(), statement.start_byte(), place as u32, at as u32));
                }
            }
        }
        let declared = Rc::new(declared);
        self.locals.borrow_mut().insert(block.id(), declared.clone());
        declared
    }

    pub fn binding(&self, usage: Node, name: &str) -> Option<Binding<'a>> {
        let mut inner = usage;
        let mut scope = crate::engine::source::parent(usage);
        while let Some(node) = scope {
            let typed = |declaration: Node, declarator: Option<Node>| -> Option<Type> {
                let written = declaration.child_by_field_name("type")?;
                if self.file.text_of(written) == "var" {
                    let value = declarator.unwrap_or(declaration).child_by_field_name("value")?;
                    return self.type_of(value);
                }
                self.declared_type(declaration, declarator)
            };
            let named = |holder: Node| holder.child_by_field_name("name").is_some_and(|n| self.file.text_of(n) == name);
            match node.kind() {
                "block" | "constructor_body" | "switch_block_statement_group" | "program" => {
                    let declared = self.locals_of(node);
                    let found = declared.iter().find(|local| local.0 == name).filter(|local| local.1 < inner.start_byte());
                    if let Some((_, _, statement, declarator)) = found {
                        let statement = node.child(*statement)?;
                        let declarator = statement.child(*declarator)?;
                        return Some(Binding::Local(typed(statement, Some(declarator))));
                    }
                }
                "for_statement" => {
                    for part in children(node).into_iter().filter(|part| part.kind() == "local_variable_declaration") {
                        for declarator in super::super::helpers::declarators(part) {
                            if named(declarator) {
                                return Some(Binding::Local(typed(part, Some(declarator))));
                            }
                        }
                    }
                }
                "enhanced_for_statement" => {
                    if named(node) && node.child_by_field_name("value") != Some(inner) {
                        let inferred = node.child_by_field_name("type").is_none_or(|kind| self.file.text_of(kind) == "var");
                        let kind = if inferred {
                            node.child_by_field_name("value").and_then(|value| self.type_of(value)).and_then(|kind| self.element(kind))
                        } else {
                            self.declared_type(node, None)
                        };
                        return Some(Binding::Local(kind));
                    }
                }
                "try_with_resources_statement" => {
                    let resources = node.child_by_field_name("resources")?;
                    for resource in children(resources).into_iter().filter(|r| r.kind() == "resource") {
                        if named(resource) && resource.start_byte() < usage.start_byte() {
                            return Some(Binding::Local(typed(resource, None)));
                        }
                    }
                }
                "catch_clause" => {
                    let parameter = children(node).into_iter().find(|c| c.kind() == "catch_formal_parameter")?;
                    if named(parameter) {
                        let kinds = children(parameter).into_iter().find(|c| c.kind() == "catch_type")?;
                        let mut cursor = kinds.walk();
                        let listed: Vec<Node> = kinds.named_children(&mut cursor).collect();
                        let kinds: Vec<Type> = listed.iter().filter_map(|kind| self.type_node(*kind)).collect();
                        let caught = match kinds.as_slice() {
                            [one] if listed.len() == 1 => Some(one.clone()),
                            [first, ..] if kinds.len() == listed.len() => {
                                let shared = self.index.superclasses(&first.name()).into_iter().find(|ancestor| {
                                    kinds.iter().all(|kind| self.index.is_subtype(&kind.name(), ancestor))
                                });
                                Some(Type::class(shared.as_deref().unwrap_or("java.lang.Throwable")))
                            }
                            _ => Some(Type::class("java.lang.Throwable")),
                        };
                        return Some(Binding::Local(caught));
                    }
                }
                "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "lambda_expression"
                | "record_declaration" => {
                    if let Some(parameters) = node.child_by_field_name("parameters") {
                        if parameters.kind() == "identifier" && self.file.text_of(parameters) == name {
                            return Some(Binding::Local(self.lambda_parameter(node, 0)));
                        }
                        let mut position = 0;
                        for parameter in children(parameters) {
                            match parameter.kind() {
                                "identifier" if self.file.text_of(parameter) == name => {
                                    return Some(Binding::Local(self.lambda_parameter(node, position)));
                                }
                                "formal_parameter" if named(parameter) => {
                                    let inferred = parameter.child_by_field_name("type").is_some_and(|k| self.file.text_of(k) == "var");
                                    let kind = if inferred { self.lambda_parameter(node, position) } else { self.declared_type(parameter, None) };
                                    return Some(Binding::Local(kind));
                                }
                                "spread_parameter" => {
                                    let declarator = children(parameter).into_iter().find(|c| c.kind() == "variable_declarator");
                                    if declarator.is_some_and(named) {
                                        let mut cursor = parameter.walk();
                                        let element = parameter.named_children(&mut cursor).find_map(|c| self.type_node(c));
                                        return Some(Binding::Local(element.map(|element| Type::Array(Box::new(element)))));
                                    }
                                }
                                _ => {}
                            }
                            position += usize::from(parameter.is_named() && !parameter.kind().ends_with("comment"));
                        }
                    }
                }
                _ => {}
            }
            if let Some(owner) = class_at(self.scope, node, inner) {
                if let Some((declaring, field)) = self.index.field(&owner, name) {
                    return Some(Binding::Field(self.own_type(&owner), declaring, field));
                }
            }
            inner = node;
            scope = crate::engine::source::parent(node);
        }
        let single = self.scope.static_single.get(name).into_iter().flatten();
        single.chain(&self.scope.static_on_demand).find_map(|owner| {
            let owner = if self.index.has(owner) { owner.clone() } else { self.class_name(usage, owner)? };
            self.index.field(&owner, name).map(|(declaring, field)| Binding::Field(Type::class(&owner), declaring, field))
        })
    }

    /// Why an expression has no static type here; for measuring what the index cannot answer yet.
    pub fn untyped_cause(&self, expression: Node) -> &'static str {
        let expression = unwrap(expression);
        match expression.kind() {
            "identifier" => match self.binding(expression, self.file.text_of(expression)) {
                Some(Binding::Local(None)) => "inferred local or lambda parameter",
                Some(_) => "typed",
                None => "name not found",
            },
            "method_invocation" => match self.resolve_call(expression) {
                Some(_) => "call returning an uninferred type variable",
                None => match expression.child_by_field_name("object") {
                    Some(object) if self.receiver(object).is_none() => self.untyped_cause(object),
                    _ => "call not resolved",
                },
            },
            "field_access" => match expression.child_by_field_name("object") {
                Some(object) if self.receiver(object).is_none() => self.untyped_cause(object),
                _ => "field not found",
            },
            "array_access" => expression.child_by_field_name("array").map_or("other", |array| self.untyped_cause(array)),
            "ternary_expression" | "switch_expression" => "conditional expression",
            _ => "other",
        }
    }

    pub fn is_variable(&self, usage: Node, name: &str) -> bool {
        self.binding(usage, name).is_some()
    }

    fn variable(&self, usage: Node, name: &str) -> Option<Type> {
        match self.binding(usage, name)? {
            Binding::Local(kind) => kind,
            Binding::Field(owner, declaring, field) => Some(self.field_type(&owner, declaring, field)),
        }
    }

    /// Whether a name or field access reads a compile-time constant field.
    pub fn constant_field(&self, expression: Node) -> bool {
        let near = |class: &str| self.scope.names.values().any(|known| known == class);
        match expression.kind() {
            "identifier" => match self.binding(expression, self.file.text_of(expression)) {
                Some(Binding::Field(_, info, field)) => self.index.constant_field(&info.name, &field.name, &near, false, 0),
                _ => false,
            },
            "field_access" | "scoped_identifier" => {
                let (Some(object), Some(field)) = (
                    expression.child_by_field_name("object").or_else(|| expression.child_by_field_name("scope")),
                    expression.child_by_field_name("field").or_else(|| expression.child_by_field_name("name")),
                ) else {
                    return false;
                };
                match self.receiver(object) {
                    Some(Receiver::Static(owner)) | Some(Receiver::Value(Type::Class(owner, _))) => {
                        self.index.constant_field(&owner, self.file.text_of(field), &near, false, 0)
                    }
                    _ => false,
                }
            }
            _ => false,
        }
    }

    /// The value of a compile-time constant string expression.
    pub fn constant_string(&self, expression: Node) -> Option<String> {
        let expression = unwrap(expression);
        match expression.kind() {
            "string_literal" => literal_text(self.file, expression),
            "binary_expression" if self.file.text_of(expression.child_by_field_name("operator")?) == "+" => {
                let left = self.constant_string(expression.child_by_field_name("left")?)?;
                Some(left + &self.constant_string(expression.child_by_field_name("right")?)?)
            }
            "identifier" => match self.binding(expression, self.file.text_of(expression))? {
                Binding::Field(_, _, field) => field.constant.clone(),
                Binding::Local(_) => None,
            },
            "field_access" => {
                let field = self.file.text_of(expression.child_by_field_name("field")?);
                match self.receiver(expression.child_by_field_name("object")?)? {
                    Receiver::Static(owner) | Receiver::Value(Type::Class(owner, _)) => self.index.field(&owner, field)?.1.constant.clone(),
                    _ => None,
                }
            }
            _ => None,
        }
    }

    pub fn pattern_variable(&self, usage: Node, name: &str) -> Option<Type> {
        let mut scope = crate::engine::source::parent(usage);
        while let Some(node) = scope {
            if matches!(node.kind(), "method_declaration" | "constructor_declaration" | "lambda_expression" | "class_body") {
                let mut found = None;
                crate::engine::source::walk(node, |candidate| {
                    if found.is_none()
                        && matches!(candidate.kind(), "instanceof_expression" | "type_pattern")
                        && candidate.start_byte() < usage.start_byte()
                        && candidate.child_by_field_name("name").is_some_and(|n| self.file.text_of(n) == name)
                    {
                        let written = candidate
                            .child_by_field_name("right")
                            .or_else(|| candidate.named_child(0).filter(|_| candidate.kind() == "type_pattern"));
                        found = written.and_then(|kind| self.type_node(kind));
                    }
                });
                return found;
            }
            scope = crate::engine::source::parent(node);
        }
        None
    }

    pub fn receiver(&self, object: Node) -> Option<Receiver> {
        let object = unwrap(object);
        if matches!(object.kind(), "identifier" | "field_access" | "scoped_identifier") {
            if let Some(kind) = self.type_of(object) {
                return Some(Receiver::Value(kind));
            }
            let text: String = self.file.text_of(object).split_whitespace().collect();
            let first = text.split('.').next().unwrap_or_default();
            let like_type = text.rsplit('.').next().is_some_and(|last| last.starts_with(char::is_uppercase));
            if like_type && self.binding(object, first).is_none() {
                return self.class_name(object, &text).filter(|name| self.index.has(name)).map(Receiver::Static);
            }
            return None;
        }
        self.type_of(object).map(Receiver::Value)
    }

    fn fits(&self, shape: &Shape, formal: &Type, strict: bool) -> bool {
        match (shape, formal) {
            (Shape::Unknown, _) => true,
            (Shape::Typed(kind), _) => self.assignable(kind, formal, strict),
            (Shape::Function(..), Type::Class(name, _)) if name == "?" || name == OBJECT || !self.index.has(name) => true,
            (Shape::Function(arity, plain, valued, primitive), Type::Class(name, _)) => self.index.functional_method(name).is_some_and(|(_, method)| {
                let unboxed = strict && *primitive && !matches!(method.returns, Type::Primitive(_));
                let fitting = if method.returns == Type::Primitive("void") { *plain } else { *valued && !unboxed };
                fitting && (arity.is_empty() || arity.contains(&method.parameters.len()))
            }),
            (Shape::Function(..), _) => false,
        }
    }

    /// The three phases of overload resolution: without boxing, with boxing, with variable arity.
    fn applicable(&self, method: &Method, formals: &[Type], shapes: &[Shape], phase: u8) -> bool {
        if phase < 2 {
            return shapes.len() == formals.len() && shapes.iter().zip(formals).all(|(shape, formal)| self.fits(shape, formal, phase == 0));
        }
        let Some((Type::Array(element), fixed)) = formals.split_last().filter(|_| method.varargs) else { return false };
        shapes.len() >= fixed.len()
            && shapes.iter().enumerate().all(|(position, shape)| self.fits(shape, fixed.get(position).unwrap_or(element), false))
    }

    pub fn assignable(&self, from: &Type, to: &Type, strict: bool) -> bool {
        match (from, to) {
            (_, Type::Class(name, _)) if name == "?" => true,
            (Type::Class(name, _), _) if name == "?" => true,
            (Type::Variable(_) | Type::Wildcard, _) | (_, Type::Variable(_) | Type::Wildcard) => true,
            (Type::Null, Type::Primitive(_)) => false,
            (Type::Null, _) => true,
            (Type::Primitive(a), Type::Primitive(b)) => a == b || widens(a, b),
            (Type::Primitive(_), Type::Class(..)) | (Type::Class(..), Type::Primitive(_)) if strict => false,
            (Type::Primitive(a), Type::Class(name, _)) => {
                boxed(name) == Some(*a) || matches!(name.as_str(), OBJECT | "java.lang.Number" | "java.io.Serializable" | "java.lang.Comparable")
            }
            (Type::Class(name, _), Type::Primitive(b)) => boxed(name).is_some_and(|a| a == *b || self.assignable(&Type::Primitive(a), to, false)),
            (Type::Class(a, _), Type::Class(b, _)) => self.index.is_subtype(a, b) || !self.index.complete(a),
            (Type::Array(a), Type::Array(b)) => a == b || (!matches!(**a, Type::Primitive(_)) && !matches!(**b, Type::Primitive(_)) && self.assignable(a, b, true)),
            (Type::Array(_), Type::Class(name, _)) => matches!(name.as_str(), OBJECT | "java.lang.Cloneable" | "java.io.Serializable"),
            _ => false,
        }
    }

    /// The type of the body of a lambda without parameters whose body is one expression.
    fn plain_body(&self, lambda: Node) -> Option<Type> {
        let empty = lambda.child_by_field_name("parameters").is_some_and(|list| list.kind() != "identifier" && list.named_child_count() == 0);
        let body = lambda.child_by_field_name("body").filter(|body| empty && body.kind() != "block")?;
        if !self.busy.borrow_mut().insert(lambda.id()) {
            return None;
        }
        let kind = if body.kind() == "method_invocation" {
            self.resolve_call(body).map(|call| call.method.returns.clone()).filter(|kind| matches!(kind, Type::Primitive(_)))
        } else {
            self.type_of(body).filter(|kind| matches!(kind, Type::Primitive(_)))
        };
        self.busy.borrow_mut().remove(&lambda.id());
        kind
    }

    fn shapes(&self, call: Node) -> Vec<Shape> {
        let nested = self.resolving.borrow().get(&call.id()).is_some_and(|turns| *turns >= 2);
        call_arguments(call)
            .into_iter()
            .map(|argument| {
                let argument = unwrap(argument);
                match argument.kind() {
                    "method_reference" => {
                        let arities = self.reference_arities(argument);
                        let primitive = arities == [0] && matches!(self.reference_result(argument, &[]), Some(Type::Primitive(_)));
                        Shape::Function(arities, true, true, primitive)
                    }
                    "lambda_expression" => {
                        let (plain, valued) = lambda_results(argument);
                        let body = if plain && valued { self.plain_body(argument) } else { None };
                        let valued = valued && body != Some(Type::Primitive("void"));
                        Shape::Function(
                            argument
                                .child_by_field_name("parameters")
                                .map(|list| {
                                    if list.kind() == "identifier" {
                                        1
                                    } else {
                                        crate::engine::source::named_children(list).iter().filter(|part| !part.kind().ends_with("comment")).count()
                                    }
                                })
                                .into_iter()
                                .collect(),
                            plain,
                            valued,
                            plain && matches!(body, Some(Type::Primitive(_))),
                        )
                    }
                    "ternary_expression" if ["consequence", "alternative"].iter().any(|branch| {
                        argument.child_by_field_name(branch).is_some_and(|part| FUNCTIONS.contains(&unwrap(part).kind()))
                    }) => Shape::Function(Vec::new(), true, true, false),
                    _ if self.is_busy(argument) => Shape::Unknown,
                    _ if nested => self.settled(argument).map_or(Shape::Unknown, Shape::Typed),
                    _ => self.type_of(argument).map_or(Shape::Unknown, Shape::Typed),
                }
            })
            .collect()
    }

    /// Counts one step of work and tells whether the question in progress has used up its share.
    fn spent(&self) -> bool {
        self.work.set(self.work.get() + 1);
        self.work.get() > WORK_LIMIT
    }

    /// The method a call resolves to, when name, receiver and argument types leave one candidate.
    pub fn resolve_call(&self, call: Node) -> Option<Call> {
        if self.spent() {
            return None;
        }
        let turns = *self.resolving.borrow().get(&call.id()).unwrap_or(&0u8);
        if turns >= 2 {
            self.skipped.set(self.skipped.get() + 1);
            return None;
        }
        self.resolving.borrow_mut().insert(call.id(), turns + 1);
        let found = self.pick_call(call);
        if turns == 0 {
            self.resolving.borrow_mut().remove(&call.id());
        } else {
            self.resolving.borrow_mut().insert(call.id(), turns);
        }
        found
    }

    fn pick_call(&self, call: Node) -> Option<Call> {
        let name = self.file.text_of(call.child_by_field_name("name")?);
        let shapes = self.shapes(call);
        let mut raw = false;
        let owners: Vec<Type> = match call.child_by_field_name("object") {
            Some(object) => match self.receiver(object)? {
                Receiver::Value(owner @ Type::Class(..)) => {
                    raw = self.raw(&owner);
                    vec![owner]
                }
                Receiver::Static(owner) => vec![Type::class(&owner)],
                Receiver::Value(Type::Array(_)) => vec![Type::class(OBJECT)],
                Receiver::Value(_) => return None,
            },
            None => {
                let mut owners: Vec<Type> = enclosing_types(self.scope, call).iter().map(|owner| self.own_type(owner)).collect();
                for owner in self.scope.static_single.get(name).into_iter().flatten() {
                    owners.push(Type::class(&self.class_name(call, owner).unwrap_or(owner.clone())));
                }
                owners.extend(self.scope.static_on_demand.iter().map(|owner| Type::class(owner)));
                owners
            }
        };
        // Several static imports can bring the same name from different classes: the first that fits wins.
        let imported = call.child_by_field_name("object").is_none() && self.scope.static_single.get(name).is_some_and(|from| from.len() > 1);
        for owner in owners {
            let mut candidates = self.index.methods(&owner.name(), name);
            if candidates.is_empty() {
                continue;
            }
            if imported && self.scope.static_single[name].contains(&owner.name()) {
                candidates = self.scope.static_single[name].iter().flat_map(|from| self.index.methods(from, name)).collect();
                let chosen = self.select(owner, &candidates, &shapes)?;
                return Some(Call { receiver: Type::class(&chosen.declaring), ..chosen });
            }
            return self.select(owner, &candidates, &shapes).map(|call| Call { raw, ..call });
        }
        None
    }

    /// The method or constructor behind a call, with the formal parameter types as they stand at this call:
    /// type variables replaced by what the receiver and the arguments make of them, then erased.
    pub fn call_formals(&self, call: Node) -> Option<(Call, Vec<Type>)> {
        if self.depth.get() == 0 {
            self.work.set(0);
        }
        let resolved = match call.kind() {
            "method_invocation" => self.resolve_call(call)?,
            "object_creation_expression" => {
                let mut resolved = self.resolve_constructor(call)?;
                if let Some(created) = self.created_type(call) {
                    resolved.receiver = created;
                }
                resolved
            }
            "explicit_constructor_invocation" => self.resolve_delegation(call)?,
            "enum_constant" => {
                let owner = self.own_type(&enclosing_type(self.file, self.scope, call)?);
                let info = self.index.get(&owner.name())?;
                let candidates: Vec<(&ClassInfo, &Method)> =
                    info.methods.iter().filter(|method| method.name == "<init>").map(|method| (info, method)).collect();
                self.select(owner, &candidates, &self.shapes(call))?
            }
            _ => return None,
        };
        let method = &resolved.method;
        if resolved.raw {
            let formals = method.parameters.clone();
            return Some((resolved, formals));
        }
        let mut map = self.call_map(&resolved, call, true);
        // A type the context asks for decides a type variable ahead of the arguments: `Map<String, Object> m = Map.of("a", 1)`.
        if call.kind() == "method_invocation" && !method.type_parameters.is_empty() && call.child_by_field_name("type_arguments").is_none() {
            if let Some(wanted) = self.target(call, true).filter(|wanted| !wanted.open()) {
                let mut wider = HashMap::new();
                let mut own = self.index.member_map(&resolved.receiver, &resolved.declaring);
                own.retain(|name, _| !method.type_parameters.contains(name));
                let made = method.generic_returns.substitute(&own);
                self.unify(&made, &wanted, &method.type_parameters, &mut wider);
                for (name, kind) in wider {
                    let narrower = map.get(&name).is_none_or(|known| self.assignable(known, &kind, true));
                    if narrower && !kind.mentions_variable() && !matches!(kind, Type::Wildcard) {
                        map.insert(name, kind);
                    }
                }
            }
        }
        let formals = method
            .generic_parameters
            .iter()
            .zip(&method.parameters)
            .map(|(generic, erased)| {
                let fitted = generic.substitute(&map);
                if fitted.open() { erased.clone() } else { fitted.erased() }
            })
            .collect();
        Some((resolved, formals))
    }

    fn select(&self, owner: Type, candidates: &[(&ClassInfo, &Method)], shapes: &[Shape]) -> Option<Call> {
        let visible: Vec<(&ClassInfo, &Method)> = candidates
            .iter()
            .filter(|(class, method)| !method.package_private || class.package == self.scope.package)
            .copied()
            .collect();
        let candidates = visible.as_slice();
        let typed: Option<Vec<Type>> = shapes
            .iter()
            .map(|shape| match shape {
                Shape::Typed(kind) => Some(kind.erased()),
                _ => None,
            })
            .collect();
        // For a lambda, the function type with a result is the more specific one, then the one with the narrower result.
        let narrower_function = |a: &Type, b: &Type| {
            let (Some((_, first)), Some((_, second))) = (self.index.functional_method(&a.name()), self.index.functional_method(&b.name())) else {
                return false;
            };
            let void = Type::Primitive("void");
            first.parameters.len() == second.parameters.len()
                && (second.returns == void && first.returns != void || (first.returns != void && self.assignable(&first.returns, &second.returns, true)))
        };
        let narrower = |method: &Method, other: &Method| {
            method.parameters.len() == other.parameters.len()
                && method.parameters.iter().zip(&other.parameters).enumerate().all(|(at, (a, b))| {
                    self.assignable(a, b, true) || (matches!(shapes.get(at), Some(Shape::Function(..))) && narrower_function(a, b))
                })
        };
        let formals: Vec<Vec<Type>> = candidates
            .iter()
            .map(|(class, method)| {
                let map = self.index.member_map(&owner, &class.name);
                let fitted = method.generic_parameters.iter().zip(&method.parameters).map(|(generic, erased)| {
                    let kind = generic.substitute(&map);
                    if method.type_parameters.is_empty() { kind } else { erased.clone() }
                });
                fitted.collect()
            })
            .collect();
        for phase in 0..3 {
            let applicable: Vec<_> = candidates
                .iter()
                .zip(&formals)
                .filter(|((_, method), formals)| self.applicable(method, formals, shapes, phase))
                .map(|(candidate, _)| candidate)
                .collect();
            let chosen = match applicable.as_slice() {
                [] => continue,
                [one] => Some(*one),
                several if shapes.iter().any(|shape| matches!(shape, Shape::Unknown)) => {
                    let _ = several;
                    None
                }
                several => {
                    let exact = typed.as_ref().and_then(|actual| several.iter().find(|(_, method)| method.parameters == *actual));
                    exact.or_else(|| several.iter().find(|(_, method)| several.iter().all(|(_, other)| narrower(method, other)))).copied()
                }
            };
            return chosen.map(|(class, method)| Call { raw: false, receiver: owner, declaring: class.name.clone(), method: (*method).clone() });
        }
        None
    }

    /// The constructor a `new` expression calls. With a diamond, the class's type parameters are inferred like a method's.
    fn resolve_constructor(&self, creation: Node) -> Option<Call> {
        if self.spent() {
            return None;
        }
        let owner = self.type_node(creation.child_by_field_name("type")?)?;
        let info = self.index.get(&owner.name())?;
        if info.is_interface && children(creation).iter().any(|part| part.kind() == "class_body") {
            let void = Type::Primitive("void");
            let method = Method {
                name: "<init>".to_string(),
                parameters: Vec::new(),
                returns: void.clone(),
                generic_parameters: Vec::new(),
                generic_returns: void,
                type_parameters: Vec::new(),
                type_bounds: Vec::new(),
                package_private: false,
                is_abstract: false,
                is_static: false,
                is_private: false,
                varargs: false,
                throws: Vec::new(),
                nullable_parameters: 0,
                flags: 0,
            };
            return Some(Call { raw: false, receiver: owner, declaring: info.name.clone(), method });
        }
        let candidates: Vec<(&ClassInfo, &Method)> =
            info.methods.iter().filter(|method| method.name == "<init>").map(|method| (info, method)).collect();
        let mut call = self.select(owner, &candidates, &self.shapes(creation))?;
        if matches!(&call.receiver, Type::Class(_, given) if given.is_empty()) {
            call.method.type_parameters.extend(info.type_parameters.iter().map(|(name, _)| name.clone()));
            call.method.type_bounds.extend(info.type_parameters.iter().map(|(_, bound)| bound.clone()));
        }
        Some(call)
    }

    fn created_type(&self, creation: Node) -> Option<Type> {
        let written = self.type_node(creation.child_by_field_name("type")?)?;
        let Some(info) = self.index.get(&written.name()).filter(|info| !info.type_parameters.is_empty()) else { return Some(written) };
        if !matches!(&written, Type::Class(_, given) if given.is_empty()) {
            return Some(written);
        }
        let Some(call) = self.resolve_constructor(creation) else { return Some(written) };
        let map = self.call_map(&call, creation, true);
        let inferred: Vec<Type> = info.type_parameters.iter().map(|(name, _)| Type::Variable(name.clone()).substitute(&map)).collect();
        if inferred.iter().any(Type::open) { Some(written) } else { Some(Type::Class(written.name(), inferred)) }
    }

    fn unify(&self, pattern: &Type, actual: &Type, variables: &[String], map: &mut HashMap<String, Type>) {
        match (pattern, actual) {
            (_, Type::Null | Type::Wildcard) => {}
            (Type::Variable(name), _) if variables.contains(name) => {
                if actual.open() {
                    return;
                }
                let actual = actual.clone().boxed();
                let joined = match map.get(name) {
                    Some(known @ Type::Class(..)) if matches!(actual, Type::Class(..)) && known.erased() != actual.erased() => {
                        self.shared(known, &actual)
                    }
                    Some(known) => known.clone(),
                    None => actual,
                };
                map.insert(name.clone(), joined);
            }
            (Type::Class(wanted, parts), Type::Class(given, arguments)) if !parts.is_empty() => {
                if arguments.is_empty() && self.index.generic(given) {
                    return;
                }
                for (part, argument) in parts.iter().zip(self.index.arguments_as(actual, wanted).unwrap_or_default()) {
                    self.unify(part, &argument, variables, map);
                }
            }
            (Type::Array(part), Type::Array(element)) => self.unify(part, element, variables, map),
            _ => {}
        }
    }

    /// The function type of a functional interface type: parameter types and return type.
    fn function_type(&self, target: &Type) -> Option<(Vec<Type>, Type)> {
        let (declaring, method) = self.index.functional_method(&target.name())?;
        let map = self.index.member_map(target, &declaring.name);
        Some((method.generic_parameters.iter().map(|kind| kind.substitute(&map)).collect(), method.generic_returns.substitute(&map)))
    }

    fn lambda_result(&self, lambda: Node) -> Option<Type> {
        let body = lambda.child_by_field_name("body")?;
        if body.kind() != "block" {
            return self.type_of(body);
        }
        let mut found = None;
        crate::engine::source::walk(body, |node| {
            if found.is_none() && node.kind() == "return_statement" {
                let nested = crate::engine::source::ancestor(node, &["lambda_expression", "class_body"]);
                if nested.is_some_and(|scope| scope == lambda) {
                    found = node.named_child(0).and_then(|value| self.type_of(value));
                }
            }
        });
        found
    }

    /// The result type of a method reference used as a function taking `taken`.
    fn reference_result(&self, reference: Node, taken: &[Type]) -> Option<Type> {
        let parts = children(reference);
        let qualifier = *parts.first()?;
        let name = self.file.text_of(*parts.last()?);
        let (owner, value) = match self.receiver(qualifier) {
            Some(Receiver::Value(kind)) => (kind, true),
            Some(Receiver::Static(owner)) => (Type::class(&owner), false),
            None => (self.type_node(qualifier)?, false),
        };
        if name == "new" {
            return Some(owner);
        }
        let methods = self.index.methods(&owner.name(), name);
        let offset = |method: &Method| usize::from(!value && method.parameters.len() + 1 == taken.len());
        let fits = |method: &Method| {
            let given = &taken[offset(method).min(taken.len())..];
            given.len() == method.parameters.len()
                && given.iter().zip(&method.parameters).all(|(actual, formal)| actual.open() || self.assignable(actual, formal, false))
        };
        let fitting: Vec<&(&ClassInfo, &Method)> = methods.iter().filter(|(_, method)| fits(method)).collect();
        let narrower = |method: &Method, other: &Method| {
            method.parameters.len() == other.parameters.len()
                && method.parameters.iter().zip(&other.parameters).all(|(a, b)| self.assignable(a, b, true))
        };
        let (declaring, method) = match fitting.as_slice() {
            [] => {
                let (declaring, first) = methods.first()?;
                if methods.iter().any(|(_, other)| other.returns != first.returns) || !first.type_parameters.is_empty() {
                    return None;
                }
                (*declaring, *first)
            }
            [one] => **one,
            several => **several.iter().find(|(_, method)| several.iter().all(|(_, other)| narrower(method, other)))?,
        };
        let receiver = match taken.first() {
            Some(first @ Type::Class(given, _)) if offset(method) == 1 && self.index.is_subtype(given, &owner.name()) => first.clone(),
            _ => owner,
        };
        let mut map = self.index.member_map(&receiver, &declaring.name);
        if !method.type_parameters.is_empty() {
            for name in &method.type_parameters {
                map.remove(name);
            }
            let mut inferred = HashMap::new();
            for (pattern, actual) in method.generic_parameters.iter().zip(taken.iter().skip(offset(method))) {
                self.unify(&pattern.substitute(&map), actual, &method.type_parameters, &mut inferred);
            }
            for (name, bound) in method.type_parameters.iter().zip(&method.type_bounds) {
                inferred.entry(name.clone()).or_insert_with(|| bound.clone());
            }
            map.extend(inferred);
        }
        let kind = method.generic_returns.substitute(&map);
        (!kind.open() && kind != Type::Primitive("void")).then_some(kind)
    }

    /// The parameter counts a method reference can stand for: a method named through a type may also take its receiver.
    fn reference_arities(&self, reference: Node) -> Vec<usize> {
        if self.file.text_of(reference).replace(' ', "").ends_with("[]::new") {
            return vec![1];
        }
        let parts = children(reference);
        let (Some(qualifier), Some(name)) = (parts.first(), parts.last().map(|name| self.file.text_of(*name))) else { return Vec::new() };
        if name == "new" || matches!(qualifier.kind(), "super" | "this") {
            return Vec::new();
        }
        let (owner, value) = match self.receiver(*qualifier) {
            Some(Receiver::Value(kind)) => (kind, true),
            Some(Receiver::Static(owner)) => (Type::class(&owner), false),
            None => match self.type_node(*qualifier) {
                Some(kind) => (kind, false),
                None => return Vec::new(),
            },
        };
        let mut counts = Vec::new();
        for (_, method) in self.index.methods(&owner.name(), name) {
            if method.varargs {
                return Vec::new();
            }
            counts.push(method.parameters.len());
            if !value {
                counts.push(method.parameters.len() + 1);
            }
        }
        counts
    }

    /// The parameter types of the one method that `value::name` can mean.
    fn reference_parameters(&self, reference: Node) -> Option<Vec<Type>> {
        let parts = children(reference);
        let name = self.file.text_of(*parts.last()?);
        let Receiver::Value(owner) = self.receiver(*parts.first()?)? else { return None };
        let methods = self.index.methods(&owner.name(), name);
        let [(declaring, method)] = methods.as_slice() else { return None };
        if !method.type_parameters.is_empty() {
            return None;
        }
        let map = self.index.member_map(&owner, &declaring.name);
        Some(method.generic_parameters.iter().map(|kind| kind.substitute(&map)).filter(|kind| !kind.open()).collect())
    }

    fn is_busy(&self, node: Node) -> bool {
        let busy = self.busy.borrow().contains(&node.id());
        if busy {
            self.skipped.set(self.skipped.get() + 1);
        }
        busy
    }

    /// What the type variables of the called method and of its class stand for at this call.
    fn call_map(&self, resolved: &Call, call: Node, functions: bool) -> HashMap<String, Type> {
        let turns = *self.mapping.borrow().get(&call.id()).unwrap_or(&0u8);
        self.mapping.borrow_mut().insert(call.id(), turns + 1);
        let map = self.fill_map(resolved, call, functions, turns > 0);
        if turns == 0 {
            self.mapping.borrow_mut().remove(&call.id());
        } else {
            self.mapping.borrow_mut().insert(call.id(), turns);
        }
        map
    }

    /// The type of an argument as first worked out while its call was already being looked at.
    fn settled(&self, argument: Node) -> Option<Type> {
        self.skipped.set(self.skipped.get() + 1);
        if let Some(known) = self.loose.borrow().get(&argument.id()) {
            return known.clone();
        }
        let kind = self.type_of(argument);
        self.loose.borrow_mut().insert(argument.id(), kind.clone());
        kind
    }

    fn fill_map(&self, resolved: &Call, call: Node, functions: bool, nested: bool) -> HashMap<String, Type> {
        let mut map = self.index.member_map(&resolved.receiver, &resolved.declaring);
        let method = &resolved.method;
        if method.type_parameters.is_empty() {
            return map;
        }
        for name in &method.type_parameters {
            map.remove(name);
        }
        let arguments = call_arguments(call);
        let formal = |position: usize| -> Option<&Type> {
            let last = method.generic_parameters.len().checked_sub(1)?;
            match method.generic_parameters.get(position.min(last))? {
                Type::Array(element) if method.varargs && position >= last && arguments.len() != last + 1 => Some(element),
                other => Some(other),
            }
        };
        let mut inferred = HashMap::new();
        if let Some(list) = call.child_by_field_name("type_arguments") {
            let given = crate::engine::source::named_children(list);
            for (name, written) in method.type_parameters.iter().zip(given) {
                if let Some(kind) = self.type_node(written) {
                    inferred.insert(name.clone(), kind);
                }
            }
        }
        // Variables that an argument not understood here could still decide: these never fall back to their bound.
        let mut pending: Vec<String> = Vec::new();
        let wait = |kind: &Type, pending: &mut Vec<String>| {
            pending.extend(method.type_parameters.iter().filter(|name| mentions(kind, name)).cloned());
        };
        for (position, argument) in arguments.iter().enumerate() {
            let argument = unwrap(*argument);
            let Some(pattern) = formal(position) else { continue };
            if FUNCTIONS.contains(&argument.kind()) {
                continue;
            }
            let actual = if self.is_busy(argument) {
                None
            } else if nested {
                self.settled(argument)
            } else {
                self.type_of(argument)
            };
            let Some(actual) = actual else {
                wait(pattern, &mut pending);
                continue;
            };
            let pattern = match (pattern, &actual) {
                (Type::Array(element), kind) if method.varargs && position + 1 == arguments.len() && !matches!(kind, Type::Array(_)) => element,
                (other, _) => other,
            };
            self.unify(&pattern.substitute(&map), &actual, &method.type_parameters, &mut inferred);
        }
        for (position, argument) in arguments.iter().enumerate() {
            let argument = unwrap(*argument);
            let Some(pattern) = formal(position).filter(|_| FUNCTIONS.contains(&argument.kind())) else { continue };
            let Some((taken, returned)) = self.function_type(&pattern.substitute(&map)) else {
                wait(pattern, &mut pending);
                continue;
            };
            if argument.kind() == "lambda_expression" {
                let written = argument.child_by_field_name("parameters").map(children).unwrap_or_default();
                let written = written.into_iter().filter(|part| part.kind() == "formal_parameter");
                for (wanted, parameter) in taken.iter().zip(written) {
                    let declared = parameter.child_by_field_name("type").filter(|kind| self.file.text_of(*kind) != "var");
                    if let Some(declared) = declared.and_then(|_| self.declared_type(parameter, None)) {
                        self.unify(wanted, &declared, &method.type_parameters, &mut inferred);
                    }
                }
            }
            if argument.kind() == "method_reference" {
                for (wanted, declared) in taken.iter().zip(self.reference_parameters(argument).unwrap_or_default()) {
                    self.unify(wanted, &declared, &method.type_parameters, &mut inferred);
                }
            }
            if !method.type_parameters.iter().any(|name| mentions(&returned, name)) {
                continue;
            }
            let result = if !functions || self.is_busy(argument) {
                None
            } else if argument.kind() == "lambda_expression" {
                self.busy.borrow_mut().insert(argument.id());
                let result = self.lambda_result(argument);
                self.busy.borrow_mut().remove(&argument.id());
                result
            } else {
                let taken: Vec<Type> = taken.iter().map(|kind| kind.substitute(&inferred)).collect();
                self.reference_result(argument, &taken)
            };
            match result {
                Some(result) => self.unify(&returned, &result, &method.type_parameters, &mut inferred),
                None => wait(&returned, &mut pending),
            }
        }
        if inferred.len() < method.type_parameters.len() && self.busy.borrow_mut().insert(call.id()) {
            if let Some(wanted) = self.target(call, true) {
                let mut wider = HashMap::new();
                let made = match self.index.get(&resolved.declaring) {
                    Some(info) if method.name == "<init>" => {
                        Type::Class(info.name.clone(), info.type_parameters.iter().map(|(name, _)| Type::Variable(name.clone())).collect())
                    }
                    _ => method.generic_returns.substitute(&map),
                };
                let made = match (&made, &wanted) {
                    (Type::Class(from, _), Type::Class(to, _)) if from != to => {
                        self.index.arguments_as(&made, to).map(|parts| Type::Class(to.clone(), parts)).unwrap_or(made)
                    }
                    _ => made,
                };
                self.unify(&made, &wanted, &method.type_parameters, &mut wider);
                for (name, kind) in wider {
                    let bound = method.type_parameters.iter().position(|known| *known == name).and_then(|at| method.type_bounds.get(at));
                    if bound.is_none_or(|bound| self.assignable(&kind, bound, true)) {
                        inferred.entry(name).or_insert(kind);
                    }
                }
            }
            self.busy.borrow_mut().remove(&call.id());
        }
        for (name, bound) in method.type_parameters.iter().zip(&method.type_bounds) {
            if !pending.contains(name) {
                inferred.entry(name.clone()).or_insert_with(|| bound.clone());
            }
        }
        map.extend(inferred);
        map
    }

    /// A case label of a switch over an enum names a constant of that enum.
    fn case_constant(&self, usage: Node, name: &str) -> Option<Type> {
        crate::engine::source::parent(usage).filter(|label| label.kind() == "switch_label")?;
        let switch = crate::engine::source::ancestor(usage, &["switch_expression", "switch_statement"])?;
        let selector = self.type_of(switch.child_by_field_name("condition")?)?;
        self.index.field(&selector.name(), name).is_some().then_some(selector)
    }

    fn call_type(&self, call: Node) -> Option<Type> {
        if self.file.text_of(call.child_by_field_name("name")?) == "clone" && call_arguments(call).is_empty() {
            if let Some(Receiver::Value(array @ Type::Array(_))) = call.child_by_field_name("object").and_then(|object| self.receiver(object)) {
                return Some(array);
            }
        }
        let resolved = self.resolve_call(call)?;
        if resolved.method.returns == Type::class("?") {
            return None;
        }
        if resolved.method.name == "getClass" && resolved.method.parameters.is_empty() {
            return Some(Type::Class("java.lang.Class".to_string(), vec![resolved.receiver.erased()]));
        }
        let own = |kind: &Type| self.index.get(&resolved.declaring).is_some_and(|info| info.type_parameters.iter().any(|(name, _)| mentions(kind, name)));
        if resolved.raw && own(&resolved.method.generic_returns) {
            return Some(resolved.method.returns.clone());
        }
        let kind = resolved.method.generic_returns.substitute(&self.call_map(&resolved, call, true));
        if matches!(&kind, Type::Variable(name) if !resolved.method.type_parameters.contains(name)) {
            // A type variable of a method or class around the declaration: it stands for its bound.
            return Some(resolved.method.returns.clone());
        }
        if matches!(kind, Type::Variable(_)) {
            return self.target(call, false).filter(|target| !target.open()).map(Type::boxed);
        }
        (!kind.open()).then_some(kind)
    }

    /// The functional interface type a lambda is checked against.
    fn lambda_target(&self, lambda: Node) -> Option<Type> {
        self.target(lambda, true)
    }

    fn returned_type(&self, at: Node) -> Option<Type> {
        let scope = crate::engine::source::ancestor(at, &["lambda_expression", "method_declaration", "class_body"])?;
        match scope.kind() {
            "method_declaration" => {
                let kind = self.type_node(scope.child_by_field_name("type")?)?;
                let extra = scope.child_by_field_name("dimensions").map_or(0, |d| self.file.text_of(d).matches('[').count());
                Some((0..extra).fold(kind, |kind, _| Type::Array(Box::new(kind))))
            }
            "lambda_expression" => {
                let (_, returned) = self.function_type(&self.target(scope, true)?)?;
                (!returned.open()).then_some(returned)
            }
            _ => None,
        }
    }

    /// The type the context expects from an expression: a declared type, a parameter, a return type.
    /// `arguments` is off when the caller is itself needed to pick the method the argument goes to.
    fn target(&self, expression: Node, arguments: bool) -> Option<Type> {
        if self.spent() {
            return None;
        }
        let mut inner = expression;
        let mut holder = crate::engine::source::parent(expression)?;
        while holder.kind() == "parenthesized_expression" {
            inner = holder;
            holder = crate::engine::source::parent(holder)?;
        }
        match holder.kind() {
            "argument_list" if arguments => {
                let call = crate::engine::source::parent(holder)?;
                let position = call_arguments(call).iter().position(|argument| *argument == inner)?;
                let resolved = match call.kind() {
                    "method_invocation" => self.resolve_call(call)?,
                    "object_creation_expression" => self.resolve_constructor(call)?,
                    "explicit_constructor_invocation" => self.resolve_delegation(call)?,
                    "enum_constant" => {
                        let owner = self.own_type(&enclosing_type(self.file, self.scope, call)?);
                        let info = self.index.get(&owner.name())?;
                        let candidates: Vec<(&ClassInfo, &Method)> =
                            info.methods.iter().filter(|method| method.name == "<init>").map(|method| (info, method)).collect();
                        self.select(owner, &candidates, &self.shapes(call))?
                    }
                    _ => return None,
                };
                let method = &resolved.method;
                let last = method.generic_parameters.len().checked_sub(1)?;
                let pattern = match method.generic_parameters.get(position.min(last))? {
                    Type::Array(element) if method.varargs && position >= last => element,
                    other => other,
                };
                let marked = self.busy.borrow_mut().insert(unwrap(inner).id());
                let map = self.call_map(&resolved, call, true);
                if marked {
                    self.busy.borrow_mut().remove(&unwrap(inner).id());
                }
                Some(pattern.substitute(&map))
            }
            "variable_declarator" => {
                let declaration = crate::engine::source::parent(holder)?;
                declaration.child_by_field_name("type").filter(|kind| self.file.text_of(*kind) != "var")?;
                self.declared_type(declaration, Some(holder))
            }
            "assignment_expression" if holder.child_by_field_name("right") == Some(inner) => {
                self.type_of(holder.child_by_field_name("left")?)
            }
            "cast_expression" if FUNCTIONS.contains(&unwrap(inner).kind()) => self.type_node(holder.child_by_field_name("type")?),
            "resource" => self.type_node(holder.child_by_field_name("type")?),
            "return_statement" => self.returned_type(holder),
            "lambda_expression" if holder.child_by_field_name("body") == Some(inner) => {
                let (_, returned) = self.function_type(&self.target(holder, true)?)?;
                (!returned.open() && returned != Type::Primitive("void")).then_some(returned)
            }
            "ternary_expression" if holder.child_by_field_name("condition") != Some(inner) => self.target(holder, arguments),
            "array_initializer" => match self.type_of(holder)? {
                Type::Array(element) => Some(*element),
                _ => None,
            },
            _ => None,
        }
    }

    /// `this(...)` or `super(...)` at the start of a constructor.
    fn resolve_delegation(&self, call: Node) -> Option<Call> {
        if self.spent() {
            return None;
        }
        let own = enclosing_type(self.file, self.scope, call)?;
        let delegate = call.child_by_field_name("constructor").map(|part| part.kind());
        let owner = if delegate == Some("super") { self.type_of_super(&own)? } else { self.own_type(&own) };
        let info = self.index.get(&owner.name())?;
        let candidates: Vec<(&ClassInfo, &Method)> =
            info.methods.iter().filter(|method| method.name == "<init>").map(|method| (info, method)).collect();
        self.select(owner, &candidates, &self.shapes(call))
    }

    fn type_of_super(&self, own: &str) -> Option<Type> {
        let own = self.own_type(own);
        let info = self.index.get(&own.name())?;
        let parent = info.superclass.clone().unwrap_or(OBJECT.to_string());
        Some(Type::Class(parent.clone(), self.index.arguments_as(&own, &parent).unwrap_or_default()))
    }

    /// The least upper bound of two class types, as far as single inheritance and shared interfaces give it.
    pub fn shared(&self, a: &Type, b: &Type) -> Type {
        let (left, right) = (a.name(), b.name());
        if self.index.is_subtype(&left, &right) {
            return b.clone();
        }
        if self.index.is_subtype(&right, &left) {
            return a.clone();
        }
        let class = self.index.superclasses(&left).into_iter().find(|ancestor| ancestor != OBJECT && self.index.is_subtype(&right, ancestor));
        let found = class.or_else(|| {
            self.index.lineage(&left).into_iter().find(|ancestor| ancestor != OBJECT && self.index.is_subtype(&right, ancestor))
        });
        Type::class(found.as_deref().unwrap_or(OBJECT))
    }

    fn conditional(&self, expression: Node) -> Option<Type> {
        let branch = |field: &str| expression.child_by_field_name(field).and_then(|node| self.type_of(node));
        let (first, second) = (branch("consequence"), branch("alternative"));
        let unboxed = |kind: &Type| match kind {
            Type::Primitive(name) => Some(*name),
            Type::Class(name, _) => boxed(name),
            _ => None,
        };
        if let (Some(a), Some(b)) = (&first, &second) {
            if a == b && unboxed(a).is_some() {
                return first;
            }
            match (unboxed(a), unboxed(b)) {
                (Some(x), Some(y)) if x == y => {
                    let wrapper = Type::Primitive(x).boxed();
                    let wanted = self.target(expression, false).filter(|target| target.erased() == wrapper);
                    return Some(wanted.unwrap_or(Type::Primitive(x)));
                }
                (Some("boolean"), Some(_)) | (Some(_), Some("boolean")) => return None,
                (Some(x), Some(y)) => {
                    let wide = if widens(x, y) { y } else { x };
                    return Some(Type::Primitive(if matches!(wide, "byte" | "short" | "char") && x != y { "int" } else { wide }));
                }
                (Some(x), None) if *b == Type::Null => return Some(Type::Primitive(x).boxed()),
                (None, Some(y)) if *a == Type::Null => return Some(Type::Primitive(y).boxed()),
                _ => {}
            }
        }
        let mut holder = crate::engine::source::parent(expression);
        while holder.is_some_and(|node| node.kind() == "parenthesized_expression") {
            holder = holder.and_then(crate::engine::source::parent);
        }
        let in_lambda = holder.is_some_and(|node| {
            node.kind() == "lambda_expression"
                || (node.kind() == "return_statement"
                    && crate::engine::source::ancestor(node, &["lambda_expression", "method_declaration", "class_body"])
                        .is_some_and(|scope| scope.kind() == "lambda_expression"))
        });
        let branches = [first.clone(), second.clone()];
        let joined = match (first, second) {
            (Some(Type::Null), other) | (other, Some(Type::Null)) => other,
            (Some(a @ Type::Class(..)), Some(b @ Type::Class(..))) => Some(self.shared(&a, &b)),
            (Some(a), Some(b)) if a.erased() == b.erased() => Some(a),
            (Some(a), Some(b)) => Some(self.shared(&a.boxed(), &b.boxed())),
            _ => None,
        };
        if !in_lambda && self.busy.borrow_mut().insert(expression.id()) {
            let cast = holder.is_some_and(|node| node.kind() == "cast_expression");
            let wanted = if cast || self.fills_type_variable(expression) { None } else { self.target(expression, true) };
            self.busy.borrow_mut().remove(&expression.id());
            let array = matches!(joined, Some(Type::Array(_)));
            if let Some(wanted) = wanted.filter(|wanted| !wanted.open() && !matches!(wanted, Type::Primitive(_))) {
                let fitting = branches.iter().flatten().all(|branch| self.assignable(branch, &wanted, false));
                if fitting && (!array || matches!(wanted, Type::Array(_))) {
                    return Some(wanted);
                }
            }
        }
        joined
    }

    /// The expression is an argument for a parameter whose type is a type variable of the called method.
    fn fills_type_variable(&self, expression: Node) -> bool {
        let mut inner = expression;
        let mut holder = crate::engine::source::parent(expression);
        while let Some(node) = holder.filter(|node| node.kind() == "parenthesized_expression") {
            inner = node;
            holder = crate::engine::source::parent(node);
        }
        let Some(call) = holder.filter(|node| node.kind() == "argument_list").and_then(|list| crate::engine::source::parent(list)) else { return false };
        let Some(position) = call_arguments(call).iter().position(|argument| *argument == inner) else { return false };
        let resolved = match call.kind() {
            "method_invocation" => self.resolve_call(call),
            "object_creation_expression" => self.resolve_constructor(call),
            _ => None,
        };
        resolved.is_some_and(|resolved| {
            let method = &resolved.method;
            let last = method.generic_parameters.len().saturating_sub(1);
            match method.generic_parameters.get(position.min(last)) {
                Some(Type::Variable(name)) => method.type_parameters.contains(name),
                _ => false,
            }
        })
    }

    fn initializer(&self, expression: Node) -> Option<Type> {
        let holder = crate::engine::source::parent(expression)?;
        match holder.kind() {
            "array_creation_expression" => self.type_of(holder),
            "variable_declarator" => self.declared_type(crate::engine::source::parent(holder)?, Some(holder)),
            "array_initializer" => match self.type_of(holder)? {
                Type::Array(element) => Some(*element),
                _ => None,
            },
            _ => None,
        }
    }

    fn lambda_parameter(&self, lambda: Node, position: usize) -> Option<Type> {
        if lambda.kind() != "lambda_expression" || self.depth.get() > 40 {
            return None;
        }
        self.depth.set(self.depth.get() + 1);
        let kind = self
            .lambda_target(lambda)
            .and_then(|target| self.function_type(&target))
            .and_then(|(parameters, _)| parameters.into_iter().nth(position))
            .filter(|kind| !kind.open());
        self.depth.set(self.depth.get() - 1);
        kind
    }

    pub fn type_of(&self, expression: Node) -> Option<Type> {
        let expression = unwrap(expression);
        if let Some(known) = self.cache.borrow().get(&expression.id()) {
            return known.clone();
        }
        if self.depth.get() > 40 {
            return None;
        }
        if self.depth.get() == 0 {
            self.work.set(0);
        }
        if self.work.get() > WORK_LIMIT {
            return None;
        }
        self.work.set(self.work.get() + 1);
        self.depth.set(self.depth.get() + 1);
        let before = self.skipped.get();
        let kind = self.compute_type(expression);
        self.depth.set(self.depth.get() - 1);
        if self.work.get() > WORK_LIMIT {
            if self.depth.get() == 0 {
                GIVEN_UP.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
                if std::env::var("NP_DBG").is_ok() {
                    eprintln!("gave up: {}:{}", self.file.path, expression.start_position().row + 1);
                }
            }
            return None;
        }
        if self.skipped.get() == before || self.busy.borrow().is_empty() {
            self.cache.borrow_mut().insert(expression.id(), kind.clone());
        }
        kind
    }

    fn compute_type(&self, expression: Node) -> Option<Type> {
        let text = self.file.text_of(expression);
        let operand = |field: &str| expression.child_by_field_name(field).and_then(|node| self.type_of(node));
        match expression.kind() {
            "string_literal" => Some(Type::class(STRING)),
            "character_literal" => Some(Type::Primitive("char")),
            "true" | "false" => Some(Type::Primitive("boolean")),
            "null_literal" => Some(Type::Null),
            "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => {
                Some(Type::Primitive(if text.ends_with(['l', 'L']) { "long" } else { "int" }))
            }
            "decimal_floating_point_literal" | "hex_floating_point_literal" => {
                Some(Type::Primitive(if text.ends_with(['f', 'F']) { "float" } else { "double" }))
            }
            "class_literal" => {
                let named = expression.named_child(0).and_then(|kind| self.type_node(kind)).map(Type::boxed);
                Some(Type::Class("java.lang.Class".to_string(), named.into_iter().collect()))
            }
            "this" => enclosing_type(self.file, self.scope, expression).map(|own| self.own_type(&own)),
            "super" => self.type_of_super(&enclosing_type(self.file, self.scope, expression)?),
            "identifier" => self
                .case_constant(expression, text)
                .or_else(|| self.variable(expression, text))
                .or_else(|| self.pattern_variable(expression, text)),
            "field_access" if text.trim_end().ends_with("this") && text.trim_end().trim_end_matches("this").trim_end().ends_with('.') => {
                let outer: String = text.trim_end().trim_end_matches("this").trim_end().trim_end_matches('.').split_whitespace().collect();
                self.class_name(expression, &outer).map(|name| Type::class(&name))
            }
            "field_access" => {
                let object = expression.child_by_field_name("object")?;
                let field = self.file.text_of(expression.child_by_field_name("field")?);
                match self.receiver(object)? {
                    Receiver::Value(Type::Array(_)) if field == "length" => Some(Type::Primitive("int")),
                    Receiver::Value(owner @ Type::Class(..)) => self.field_of(&owner, field),
                    Receiver::Static(owner) => self.field_of(&Type::class(&owner), field),
                    _ => None,
                }
            }
            "method_invocation" => self.call_type(expression),
            "lambda_expression" | "method_reference" => self.lambda_target(expression).filter(|kind| !kind.open()),
            "object_creation_expression" => self.created_type(expression),
            "array_creation_expression" => {
                let mut kind = self.type_node(expression.child_by_field_name("type")?)?;
                for _ in 0..text.split('{').next().unwrap_or(text).matches('[').count() {
                    kind = Type::Array(Box::new(kind));
                }
                Some(kind)
            }
            "cast_expression" => self.type_node(expression.child_by_field_name("type")?),
            "array_access" => match operand("array")? {
                Type::Array(element) => Some(*element),
                _ => None,
            },
            "instanceof_expression" => Some(Type::Primitive("boolean")),
            "assignment_expression" => operand("left"),
            "update_expression" => expression.named_child(0).and_then(|node| self.type_of(node)),
            "unary_expression" => {
                let inner = operand("operand")?;
                match self.file.text_of(expression.child_by_field_name("operator")?) {
                    "!" => Some(Type::Primitive("boolean")),
                    _ => Some(Type::Primitive(match numeric_rank(&inner)? {
                        0 => "int",
                        1 => "long",
                        2 => "float",
                        _ => "double",
                    })),
                }
            }
            "binary_expression" => {
                let operator = self.file.text_of(expression.child_by_field_name("operator")?);
                if operator == "+" {
                    // A long chain of string pieces is one deep left spine: walk it without recursion.
                    let mut spine = expression;
                    while spine.kind() == "binary_expression" && spine.child_by_field_name("operator").is_some_and(|sign| self.file.text_of(sign) == "+") {
                        if spine.child_by_field_name("right").is_some_and(|right| right.kind() == "string_literal") {
                            return Some(Type::class(STRING));
                        }
                        spine = spine.child_by_field_name("left")?;
                    }
                }
                match operator {
                    "==" | "!=" | "<" | ">" | "<=" | ">=" | "&&" | "||" => Some(Type::Primitive("boolean")),
                    _ => {
                        let (left, right) = (operand("left"), operand("right"));
                        let string = Type::class(STRING);
                        if operator == "+" && (left.as_ref() == Some(&string) || right.as_ref() == Some(&string)) {
                            return Some(string);
                        }
                        let (left, right) = (left?, right?);
                        if matches!(operator, "<<" | ">>" | ">>>") {
                            return Some(Type::Primitive(if numeric_rank(&left)? == 1 { "long" } else { "int" }));
                        }
                        if matches!(operator, "&" | "|" | "^") && left == Type::Primitive("boolean") {
                            return Some(left);
                        }
                        Some(Type::Primitive(match numeric_rank(&left)?.max(numeric_rank(&right)?) {
                            0 => "int",
                            1 => "long",
                            2 => "float",
                            _ => "double",
                        }))
                    }
                }
            }
            "ternary_expression" => self.conditional(expression),
            "array_initializer" => self.initializer(expression),
            _ => None,
        }
    }

    /// PMD's typeIs: the static type is the named type or a subtype of it.
    pub fn type_is(&self, expression: Node, name: &str) -> bool {
        match self.type_of(expression) {
            Some(Type::Class(actual, _)) => self.index.is_subtype(&actual, name),
            Some(other) => other.name() == name,
            None => false,
        }
    }

    /// PMD's matchesSig for `Owner#name(param,...)`, with `_` for any type and `_*` for any parameters.
    pub fn matches_sig(&self, call: Node, signature: &str) -> bool {
        let Some((owner, rest)) = signature.split_once('#') else { return false };
        let Some((name, parameters)) = rest.trim_end_matches(')').split_once('(') else { return false };
        if call.child_by_field_name("name").is_none_or(|node| self.file.text_of(node) != name) {
            return false;
        }
        let Some(resolved) = self.resolve_call(call) else { return false };
        let receiver = match call.child_by_field_name("object").filter(|object| object.kind() != "super") {
            Some(_) => resolved.receiver.name(),
            None => resolved.declaring,
        };
        if owner != "_" && !self.index.is_subtype(&receiver, owner) {
            return false;
        }
        if parameters == "_*" {
            return true;
        }
        let wanted: Vec<&str> = if parameters.is_empty() { Vec::new() } else { parameters.split(',').map(str::trim).collect() };
        let method = resolved.method;
        wanted.len() == method.parameters.len()
            && wanted.iter().zip(&method.parameters).all(|(want, formal)| *want == "_" || formal.name() == *want)
    }
}
