//! Expressions in the order javac evaluates them, each giving its value.
use super::values::{BOOLEAN, Frame, Origin, Value, Walk};
use crate::engine::source::named_children;
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::Type;
use tree_sitter::Node;

const STATEMENTS: &[&str] = &["block", "switch_block", "local_variable_declaration", "expression_statement", "return_statement", "throw_statement"];

impl<'c, 'a> Walk<'c, 'a> {
    fn kind_of(&self, node: Node) -> Option<Type> {
        self.context.resolver.type_of(node)
    }

    pub fn eval(&mut self, node: Node<'a>) -> Value {
        let context = self.context;
        match node.kind() {
            "parenthesized_expression" => match named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")) {
                Some(inner) => self.eval(inner),
                None => self.plain(None),
            },
            "cast_expression" => {
                let Some(inner) = node.child_by_field_name("value") else { return self.plain(None) };
                let value = self.eval(inner);
                let target = node.child_by_field_name("type").and_then(|_| self.kind_of(node));
                if matches!(value.1, Some(Type::Primitive(_))) || matches!(target, Some(Type::Primitive(_))) {
                    return self.boxed(value, target.as_ref());
                }
                let upcast = match (&value.1, &target) {
                    (Some(Type::Class(from, _)), Some(Type::Class(to, _))) => from == to || context.resolver.index.is_subtype(from, to),
                    _ => false,
                };
                if upcast { value } else { (value.0, target) }
            }
            "null_literal" => (self.fresh(Origin::Null), Some(Type::Null)),
            "string_literal" => (self.fresh(Origin::Literal), self.kind_of(node)),
            "this" => (0, self.kind_of(node)),
            "identifier" => self.name(node),
            "field_access" => self.field_access(node),
            "method_invocation" => self.call(node),
            "assignment_expression" => self.assign(node),
            "update_expression" => {
                let target = named_children(node).into_iter().next();
                if let Some(target) = target.filter(|target| target.kind() == "identifier") {
                    let value = self.plain(self.kind_of(target));
                    self.set_local(context.text(target), value);
                }
                self.plain(self.kind_of(node))
            }
            "ternary_expression" => self.ternary(node),
            "binary_expression" => self.binary(node),
            "instanceof_expression" => {
                let value = node.child_by_field_name("left").map(|left| self.eval(left));
                let named = node.child_by_field_name("name").or_else(|| {
                    named_children(node).into_iter().find(|part| part.kind() == "type_pattern").and_then(|pattern| named_children(pattern).into_iter().find(|part| part.kind() == "identifier"))
                });
                if let (Some(name), Some(value)) = (named, value) {
                    let kind = node.child_by_field_name("right").and_then(|kind| context.resolver.type_node(kind));
                    self.declare(context.text(name), (value.0, kind.clone()), kind);
                }
                self.plain(Some(Type::Primitive("boolean")))
            }
            "lambda_expression" => {
                self.lambda(node);
                self.plain(None)
            }
            "object_creation_expression" => {
                for part in named_children(node) {
                    match part.kind() {
                        "argument_list" => self.arguments(part),
                        "class_body" => self.class_body(part),
                        _ => {}
                    }
                }
                self.plain(self.kind_of(node))
            }
            "switch_expression" => {
                self.switch(node);
                self.plain(self.kind_of(node))
            }
            kind if STATEMENTS.contains(&kind) => {
                self.statement(node);
                self.plain(None)
            }
            "class_body" => {
                self.class_body(node);
                self.plain(None)
            }
            _ => {
                for part in named_children(node) {
                    self.eval(part);
                }
                self.plain(self.kind_of(node))
            }
        }
    }

    pub fn arguments(&mut self, list: Node<'a>) {
        for argument in named_children(list) {
            self.eval(argument);
        }
    }

    fn name(&mut self, node: Node<'a>) -> Value {
        let context = self.context;
        let name = context.text(node);
        match context.resolver.binding(node, name) {
            Some(Binding::Local(declared)) => {
                if let Some(local) = self.env.locals.iter().rev().find(|local| &*local.name == name) {
                    return (local.value, local.kind.as_deref().cloned());
                }
                if let Some(value) = self.component(node, name, &declared) {
                    return value;
                }
                self.captured(name, declared, node)
            }
            Some(Binding::Field(_, declaring, field)) => {
                let declaring = declaring.name.clone();
                let kind = super::super::observed::observed(context, node).or_else(|| Some(field.kind.clone()));
                self.field(Some(0), &declaring, field, kind)
            }
            None => match self.env.locals.iter().rev().find(|local| &*local.name == name) {
                Some(local) => (local.value, local.kind.as_deref().cloned()),
                None => self.plain(self.kind_of(node)),
            },
        }
    }

    /// A record component named in a method of its record other than the compact constructor: its field.
    fn component(&mut self, node: Node<'a>, name: &str, kind: &Option<Type>) -> Option<Value> {
        if matches!(self.frame, Frame::Lambda(_)) {
            return None;
        }
        let record = crate::engine::source::ancestor(node, &["record_declaration", "class_body", "lambda_expression", "compact_constructor_declaration"])?;
        if record.kind() == "class_body" && parent_is_record(record) {
            let holder = crate::engine::source::parent(record)?;
            let declaring = self.context.resolver.scope.names.get(&holder.id())?.clone();
            let listed = holder.child_by_field_name("parameters").is_some_and(|parameters| {
                named_children(parameters).iter().any(|component| component.child_by_field_name("name").is_some_and(|named| self.context.text(named) == name))
            });
            let (_, field) = self.context.resolver.index.field(&declaring, name).filter(|_| listed)?;
            return Some(self.field(Some(0), &declaring, field, kind.clone()));
        }
        None
    }

    fn field_access(&mut self, node: Node<'a>) -> Value {
        let context = self.context;
        let Some(object) = node.child_by_field_name("object") else { return self.plain(None) };
        let named = node.child_by_field_name("field");
        if named.is_none_or(|field| field.kind() == "this") {
            return (0, self.kind_of(node));
        }
        let holder = match object.kind() {
            "this" | "super" => Some(0),
            _ => match context.resolver.receiver(object) {
                Some(Receiver::Static(_)) => None,
                _ => Some(self.eval(object).0),
            },
        };
        let Some((declaring, name)) = super::super::fields::field_key(context, node) else { return self.plain(self.kind_of(node)) };
        let Some((_, field)) = context.resolver.index.field(&declaring, &name) else { return self.plain(self.kind_of(node)) };
        let kind = super::super::observed::observed(context, node).or_else(|| Some(field.kind.clone()));
        self.field(holder, &declaring, field, kind)
    }

    fn call(&mut self, node: Node<'a>) -> Value {
        let context = self.context;
        let mut held = None;
        if let Some(object) = node.child_by_field_name("object") {
            let receiver = context.resolver.receiver(object);
            if !matches!(object.kind(), "super" | "this") && !matches!(receiver, Some(Receiver::Static(_))) {
                held = Some(self.eval(object));
            }
        }
        let arguments: Vec<Node> = node.child_by_field_name("arguments").map(named_children).unwrap_or_default();
        let values: Vec<Value> = arguments.iter().map(|argument| self.eval(*argument)).collect();
        let Some(found) = context.resolver.resolve_call(node) else { return self.plain(self.kind_of(node)) };
        let boxing = found.declaring == BOOLEAN && found.method.name == "valueOf" && matches!(found.method.parameters.as_slice(), [Type::Primitive("boolean")]);
        if let (true, Some(value)) = (boxing, values.first()) {
            let inner = self.boxed(value.clone(), Some(&Type::Primitive("boolean")));
            return (self.fresh(Origin::Boxed(inner.0)), Some(Type::class(BOOLEAN)));
        }
        let unboxing = found.declaring == BOOLEAN && found.method.name == "booleanValue";
        if let (true, Some(object)) = (unboxing, held) {
            return (self.fresh(Origin::Unboxed(object.0)), Some(Type::Primitive("boolean")));
        }
        let kind = Some(found.method.returns.clone());
        match super::called(context, node, &found) {
            Some(label) => (self.fresh(Origin::Call(label)), kind),
            None => self.plain(kind),
        }
    }

    fn assign(&mut self, node: Node<'a>) -> Value {
        let context = self.context;
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return self.plain(None) };
        let plain = node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=");
        if left.kind() == "field_access" {
            if let Some(object) = left.child_by_field_name("object").filter(|object| !matches!(object.kind(), "this" | "super")) {
                if !matches!(context.resolver.receiver(object), Some(Receiver::Static(_))) {
                    self.eval(object);
                }
            }
        } else if left.kind() == "array_access" {
            for part in named_children(left) {
                self.eval(part);
            }
        }
        let value = self.eval(right);
        let target = self.kind_of(left);
        let value = if plain { self.boxed(value, target.as_ref()) } else { self.plain(target) };
        match left.kind() {
            "identifier" => match context.resolver.binding(left, context.text(left)) {
                Some(Binding::Local(_)) => self.set_local(context.text(left), value.clone()),
                Some(Binding::Field(_, declaring, field)) => self.forget(&declaring.name, &field.name),
                None => {}
            },
            "field_access" => {
                if let Some((declaring, name)) = super::super::fields::field_key(context, left) {
                    self.forget(&declaring, &name);
                }
            }
            _ => {}
        }
        value
    }

    pub fn forget(&mut self, declaring: &str, name: &str) {
        let binary = super::super::names::binary(self.context, declaring);
        self.env.loads.retain(|load| load.1 != binary || load.2 != name);
    }

    fn ternary(&mut self, node: Node<'a>) -> Value {
        let condition = node.child_by_field_name("condition");
        let (Some(consequence), Some(alternative)) = (node.child_by_field_name("consequence"), node.child_by_field_name("alternative")) else {
            return self.plain(None);
        };
        if let Some(test) = super::super::folds::fixed(self.context, condition) {
            return self.eval(if test { consequence } else { alternative });
        }
        if let Some(condition) = condition {
            self.eval(condition);
        }
        let before = self.env.clone();
        let first = self.eval(consequence);
        let after = std::mem::replace(&mut self.env, before);
        let second = self.eval(alternative);
        self.merge(after);
        let literal = |walk: &Self, value: &Value| if walk.origins[value.0 as usize] == Origin::Literal { Some(Type::class("java.lang.Object")) } else { value.1.clone() };
        let kind = super::merged(self.context, &literal(self, &first), &literal(self, &second));
        if first.0 == second.0 { (first.0, kind) } else { self.plain(kind) }
    }

    fn binary(&mut self, node: Node<'a>) -> Value {
        let operator = node.child_by_field_name("operator").map(|operator| operator.kind()).unwrap_or_default();
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return self.plain(None) };
        let first = self.eval(left);
        if matches!(operator, "&&" | "||") {
            let before = self.env.clone();
            self.eval(right);
            self.merge(before);
            return self.plain(Some(Type::Primitive("boolean")));
        }
        let second = self.eval(right);
        if matches!(operator, "==" | "!=") {
            self.compared(node, &first, &second);
        }
        self.plain(self.kind_of(node))
    }

    /// A lambda body: its own method, whose first parameters are the locals it captures.
    pub fn lambda(&mut self, node: Node<'a>) {
        let saved = (std::mem::take(&mut self.env), self.frame);
        self.frame = Frame::Lambda(0);
        if let Some(parameters) = node.child_by_field_name("parameters") {
            let names: Vec<Node> = if parameters.kind() == "identifier" { vec![parameters] } else { named_children(parameters) };
            for parameter in names {
                let name = if parameter.kind() == "identifier" { Some(parameter) } else { parameter.child_by_field_name("name") };
                if let Some(name) = name {
                    let kind = self.context.resolver.binding(name, self.context.text(name)).and_then(|bound| match bound {
                        Binding::Local(kind) => kind,
                        Binding::Field(..) => None,
                    });
                    let value = self.plain(kind.clone());
                    self.declare(self.context.text(name), value, kind);
                }
            }
        }
        if let Some(body) = node.child_by_field_name("body") {
            self.eval(body);
        }
        (self.env, self.frame) = saved;
    }
}

fn parent_is_record(body: Node) -> bool {
    crate::engine::source::parent(body).is_some_and(|holder| holder.kind() == "record_declaration")
}
