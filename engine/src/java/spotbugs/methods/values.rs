//! The instructions javac writes for expressions, as `code.rs` counts them.
use super::code::{AWAY, Code, Op};
use crate::engine::source::named_children;
use crate::java::types::expr::{Binding, Receiver, unwrap};
use crate::java::types::model::{Type, flag};
use std::collections::HashSet;
use tree_sitter::Node;

const LITERALS: &[&str] = &[
    "decimal_integer_literal", "hex_integer_literal", "octal_integer_literal", "binary_integer_literal",
    "decimal_floating_point_literal", "hex_floating_point_literal", "string_literal", "character_literal", "text_block",
    "true", "false", "null_literal", "class_literal",
];

impl<'a> Code<'_, 'a> {
    pub fn value_of(&mut self, node: Option<Node<'a>>) {
        if let Some(node) = node {
            self.value(node);
        }
    }

    pub fn arguments(&mut self, list: Option<Node<'a>>) {
        for argument in list.map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")) {
            self.value(argument);
        }
    }

    /// An expression whose value is thrown away: `i++` and `i += 1` on an `int` local are one `iinc`.
    pub fn effect(&mut self, node: Node<'a>) {
        let operand = match node.kind() {
            "update_expression" => named_children(node).into_iter().next(),
            "assignment_expression" if self.increments(node) => node.child_by_field_name("left"),
            _ => None,
        };
        match operand {
            Some(local) if self.int_local(local) => self.push(Op::Other),
            _ if node.kind() == "update_expression" => self.ops.extend([Op::Load, Op::Other]),
            _ => self.value(node),
        }
    }

    fn increments(&self, node: Node) -> bool {
        let operator = node.child_by_field_name("operator").map(|operator| self.context.text(operator));
        let amount = node.child_by_field_name("right").map(unwrap).filter(|right| right.kind() == "decimal_integer_literal");
        matches!(operator, Some("+=" | "-=")) && amount.and_then(|amount| self.context.text(amount).parse::<i64>().ok()).is_some_and(|amount| amount <= 32767)
    }

    fn int_local(&self, node: Node) -> bool {
        node.kind() == "identifier" && matches!(self.context.resolver.binding(node, self.context.text(node)), Some(Binding::Local(Some(Type::Primitive("int")))))
    }

    pub fn value(&mut self, node: Node<'a>) {
        let resolver = self.context.resolver;
        match node.kind() {
            "parenthesized_expression" => self.value(unwrap(node)),
            kind if LITERALS.contains(&kind) => self.push(Op::Other),
            "identifier" => self.push(if resolver.constant_field_as(node, true) || self.constant_member(node) { Op::Other } else { Op::Load }),
            "this" => self.push(Op::Load),
            "field_access" => self.field(node),
            "method_invocation" => self.call(node),
            "object_creation_expression" => self.creation(node),
            "dimensions_expr" => self.value_of(node.named_child(0)),
            "array_creation_expression" => {
                let parts = named_children(node).into_iter().filter(|part| matches!(part.kind(), "dimensions_expr" | "array_initializer"));
                parts.for_each(|part| self.value(part));
                self.push(Op::Other);
            }
            "array_initializer" => {
                self.push(Op::Other);
                for element in named_children(node) {
                    self.ops.extend([Op::Other, Op::Other]);
                    self.value(element);
                    self.push(Op::Other);
                }
            }
            "array_access" => {
                self.value_of(node.child_by_field_name("array"));
                self.value_of(node.child_by_field_name("index"));
                self.push(Op::Other);
            }
            "cast_expression" => {
                self.value_of(node.child_by_field_name("value"));
                if !self.widens(node) {
                    self.push(Op::Other);
                }
            }
            "instanceof_expression" | "unary_expression" => {
                self.value_of(node.named_child(0));
                self.push(Op::Other);
            }
            "binary_expression" => {
                self.value_of(node.child_by_field_name("left"));
                self.value_of(node.child_by_field_name("right"));
                self.push(Op::Other);
            }
            "ternary_expression" => {
                self.value_of(node.child_by_field_name("condition"));
                self.push(Op::Other);
                self.value_of(node.child_by_field_name("consequence"));
                self.push(Op::Goto(AWAY));
                self.value_of(node.child_by_field_name("alternative"));
            }
            "update_expression" => self.ops.extend([Op::Load, Op::Other]),
            "assignment_expression" => self.assign(node),
            "lambda_expression" => {
                if self.captures(node) {
                    self.push(Op::Load);
                }
                self.push(Op::Other);
            }
            "method_reference" => {
                match node.named_child(0) {
                    Some(object) if matches!(object.kind(), "this" | "super") => self.push(Op::Load),
                    Some(object) if object.kind().ends_with("type") || matches!(resolver.receiver(object), Some(Receiver::Static(_))) => {}
                    Some(object) => self.value(object),
                    None => {}
                }
                self.push(Op::Other);
            }
            _ => self.push(Op::Kill),
        }
    }

    /// A `final` instance field of a class in this file set from a constant expression: javac writes its value.
    fn constant_member(&self, name: Node) -> bool {
        let Some(Binding::Field(_, info, field)) = self.context.resolver.binding(name, self.context.text(name)) else { return false };
        let simple = matches!(&field.kind, Type::Primitive(_)) || field.kind.name() == "java.lang.String";
        if !simple || field.flags & flag::FINAL == 0 || field.flags & flag::STATIC != 0 {
            return false;
        }
        let Some(class) = self.context.classes.get(&info.name) else { return false };
        let body = class.child_by_field_name("body");
        let members = body.map(super::super::place::members).unwrap_or_default();
        members.into_iter().filter(|member| member.kind() == "field_declaration").flat_map(crate::java::helpers::declarators).any(|declarator| {
            let named = declarator.child_by_field_name("name").is_some_and(|written| self.context.text(written) == field.name);
            let value = declarator.child_by_field_name("value");
            let mut uses = Vec::new();
            named && value.is_some_and(|value| self.context.resolver.constant_shape(value, &mut uses) && uses.is_empty())
        })
    }

    fn field(&mut self, node: Node<'a>) {
        let resolver = self.context.resolver;
        let (Some(object), Some(field)) = (node.child_by_field_name("object"), node.child_by_field_name("field")) else { return self.push(Op::Kill) };
        if field.kind() == "this" {
            return self.ops.extend([Op::Load, Op::Field]);
        }
        if resolver.constant_field_as(node, true) {
            return self.push(Op::Other);
        }
        match object.kind() {
            "super" => self.ops.extend([Op::Load, Op::Field]),
            _ if matches!(resolver.receiver(object), Some(Receiver::Static(_))) => self.push(Op::Load),
            _ => {
                self.value(object);
                let length = self.context.text(field) == "length" && matches!(resolver.type_of(object), Some(Type::Array(_)));
                self.push(if length { Op::Other } else { Op::Field });
            }
        }
    }

    fn call(&mut self, node: Node<'a>) {
        let resolver = self.context.resolver;
        let name = node.child_by_field_name("name");
        let arguments = node.child_by_field_name("arguments");
        let bare = arguments.is_none_or(|list| named_children(list).iter().all(|part| part.kind().ends_with("comment")));
        let notify = bare && name.is_some_and(|name| matches!(self.context.text(name), "notify" | "notifyAll"));
        let object = node.child_by_field_name("object");
        let mut virtual_call = true;
        match object {
            None if notify => self.push(Op::Load),
            None => {
                if !resolver.resolve_call(node).is_some_and(|call| call.method.is_static) {
                    self.push(Op::Load);
                }
            }
            Some(object) if object.kind() == "super" => {
                virtual_call = false;
                self.push(Op::Load);
            }
            Some(object) if matches!(resolver.receiver(object), Some(Receiver::Static(_))) => {}
            Some(object) => self.value(object),
        }
        self.arguments(arguments);
        let invoked = match (notify && virtual_call, name) {
            (true, Some(_)) if !self.on_interface(node, object) => Op::Notify(arguments.unwrap_or(node)),
            _ => Op::Other,
        };
        self.push(invoked);
    }

    /// Whether javac calls a method of `java.lang.Object` with `invokeinterface`: on a value of an interface type.
    fn on_interface(&self, call: Node, object: Option<Node>) -> bool {
        let index = self.context.resolver.index;
        let owner = match object {
            Some(object) => match self.context.resolver.type_of(object).map(|kind| kind.erased()) {
                Some(Type::Class(name, _)) => name,
                _ => return false,
            },
            None => {
                let holder = crate::engine::source::ancestor(call, &["class_body", "interface_body", "enum_body", "lambda_expression"]);
                return holder.is_some_and(|holder| holder.kind() == "interface_body");
            }
        };
        index.get(&owner).is_some_and(|info| info.is_interface)
    }

    fn creation(&mut self, node: Node<'a>) {
        self.push(Op::Other);
        let anonymous = named_children(node).iter().any(|part| part.kind() == "class_body");
        let inner = || {
            let kind = node.child_by_field_name("type").and_then(|kind| self.context.resolver.type_node(kind));
            let Some(Type::Class(name, _)) = kind.map(|kind| kind.erased()) else { return false };
            self.context.resolver.index.get(&name).is_some_and(|info| {
                let nested = info.name.rsplit_once('.').is_some_and(|(outer, _)| self.context.resolver.index.get(outer).is_some());
                nested && !info.is_interface && info.flags & (flag::STATIC | flag::ENUM | flag::RECORD) == 0
            })
        };
        match node.child_by_field_name("object") {
            Some(outer) => self.value(outer),
            None if (anonymous && !self.is_static) || (!anonymous && inner()) => self.push(Op::Load),
            None => {}
        }
        self.arguments(node.child_by_field_name("arguments"));
        self.push(Op::Other);
    }

    fn assign(&mut self, node: Node<'a>) {
        let resolver = self.context.resolver;
        let plain = node.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "=");
        let Some(left) = node.child_by_field_name("left").map(unwrap) else { return self.push(Op::Kill) };
        let right = node.child_by_field_name("right");
        let bare = match left.kind() {
            "identifier" => match resolver.binding(left, self.context.text(left)) {
                Some(Binding::Local(_)) => true,
                Some(Binding::Field(_, _, field)) => field.flags & flag::STATIC != 0,
                None => false,
            },
            "field_access" => left.child_by_field_name("object").is_some_and(|object| matches!(resolver.receiver(object), Some(Receiver::Static(_)))),
            _ => false,
        };
        match left.kind() {
            _ if bare && plain => {}
            _ if bare => self.push(Op::Load),
            "array_access" => {
                self.value_of(left.child_by_field_name("array"));
                self.value_of(left.child_by_field_name("index"));
            }
            "field_access" => self.value_of(left.child_by_field_name("object")),
            _ => self.push(Op::Load),
        }
        self.value_of(right);
        self.push(Op::Other);
    }

    /// A cast javac writes no `checkcast` for: to a type the value already has.
    fn widens(&self, node: Node) -> bool {
        let resolver = self.context.resolver;
        let target = node.child_by_field_name("type").and_then(|kind| resolver.type_node(kind)).map(|kind| kind.erased());
        let source = node.child_by_field_name("value").and_then(|value| resolver.type_of(value)).map(|kind| kind.erased());
        match (source, target) {
            (Some(Type::Class(from, _)), Some(Type::Class(to, _))) => from == to || to == "java.lang.Object" || resolver.index.is_subtype(&from, &to),
            _ => false,
        }
    }

    /// Whether a lambda takes `this` or a local variable of the method around it.
    fn captures(&self, lambda: Node) -> bool {
        let resolver = self.context.resolver;
        let mut declared = HashSet::new();
        let mut stack = vec![lambda];
        let mut used = Vec::new();
        while let Some(node) = stack.pop() {
            match node.kind() {
                "this" | "super" => return true,
                "identifier" => used.push(node),
                "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "inferred_parameters" | "lambda_expression" => {
                    let names = node.child_by_field_name("name").into_iter().chain(named_children(node).into_iter().filter(|part| part.kind() == "identifier"));
                    declared.extend(names.map(|name| self.context.text(name)));
                }
                "method_invocation" if node.child_by_field_name("object").is_none() && !resolver.resolve_call(node).is_some_and(|call| call.method.is_static) => return true,
                _ => {}
            }
            stack.extend(named_children(node));
        }
        used.into_iter().any(|name| {
            let parent = crate::engine::source::parent(name);
            let member = parent.is_some_and(|parent| {
                (parent.kind() == "field_access" && parent.child_by_field_name("field") == Some(name)) || (parent.kind() == "method_invocation" && parent.child_by_field_name("name") == Some(name))
            });
            !member && !declared.contains(self.context.text(name)) && match resolver.binding(name, self.context.text(name)) {
                Some(Binding::Local(_)) => true,
                Some(Binding::Field(_, _, field)) => field.flags & flag::STATIC == 0 && !resolver.constant_field_as(name, true),
                None => false,
            }
        })
    }
}
