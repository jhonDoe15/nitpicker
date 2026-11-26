//! Names javac replaces by their constant value: `final` instance fields and `final` locals set from a constant
//! expression, which the index does not mark as constants.
use super::code::Code;
use crate::engine::source::{named_children, parent};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::expr::Binding;
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

impl Code<'_, '_> {
    fn constant_value(&self, value: Option<Node>) -> bool {
        let mut uses = Vec::new();
        value.is_some_and(|value| self.context.resolver.constant_shape(value, &mut uses) && uses.is_empty())
    }

    /// A `final` instance field of a class in this file set from a constant expression: javac writes its value.
    pub(super) fn constant_member(&self, name: Node) -> bool {
        let Some(Binding::Field(_, info, field)) = self.context.resolver.binding(name, self.context.text(name)) else { return false };
        let simple = matches!(&field.kind, Type::Primitive(_)) || field.kind.name() == "java.lang.String";
        if !simple || field.flags & flag::FINAL == 0 || field.flags & flag::STATIC != 0 {
            return false;
        }
        let Some(class) = self.context.classes.get(&info.name) else { return false };
        let body = class.child_by_field_name("body");
        let members = body.map(super::super::super::place::members).unwrap_or_default();
        members.into_iter().filter(|member| member.kind() == "field_declaration").flat_map(declarators).any(|declarator| {
            let named = declarator.child_by_field_name("name").is_some_and(|written| self.context.text(written) == field.name);
            named && self.constant_value(declarator.child_by_field_name("value"))
        })
    }


    /// A `final` local of a primitive or `String` type declared before `name` in a block around it.
    pub(super) fn constant_local(&self, name: Node) -> bool {
        let text = self.context.text(name);
        if !matches!(self.context.resolver.binding(name, text), Some(Binding::Local(Some(kind))) if matches!(kind, Type::Primitive(_)) || kind.name() == "java.lang.String") {
            return false;
        }
        let mut inner = name;
        while let Some(scope) = parent(inner) {
            let earlier = named_children(scope).into_iter().take_while(|part| part.start_byte() < inner.start_byte());
            for statement in earlier.filter(|part| part.kind() == "local_variable_declaration") {
                for declarator in declarators(statement) {
                    if declarator.child_by_field_name("name").is_some_and(|written| self.context.text(written) == text) {
                        return has_modifier(statement, "final") && self.constant_value(declarator.child_by_field_name("value"));
                    }
                }
            }
            inner = scope;
        }
        false
    }

    /// The `int` an expression always has, as javac works it out for `x += amount`.
    pub(super) fn amount(&self, node: Node) -> Option<i64> {
        let node = crate::java::types::expr::unwrap(node);
        if let Some(value) = super::super::super::folds::number(self.context, node) {
            return Some(value);
        }
        let operand = |field: &str| node.child_by_field_name(field).and_then(|part| self.amount(part));
        match node.kind() {
            "character_literal" => self.context.text(node).trim_matches('\'').chars().next().filter(|_| !self.context.text(node).contains('\\')).map(|letter| i64::from(u32::from(letter))),
            "cast_expression" if node.child_by_field_name("type").is_some_and(|kind| kind.kind() == "integral_type") => operand("value"),
            "unary_expression" if node.child(0).is_some_and(|sign| self.context.text(sign) == "+") => operand("operand"),
            "ternary_expression" => match super::super::super::folds::fixed(self.context, node.child_by_field_name("condition"))? {
                true => operand("consequence"),
                false => operand("alternative"),
            },
            "binary_expression" => {
                let (left, right) = (operand("left")?, operand("right")?);
                match node.child_by_field_name("operator").map(|operator| self.context.text(operator))? {
                    "+" => Some(left + right),
                    "-" => Some(left - right),
                    "*" => Some(left * right),
                    _ => None,
                }
            }
            "identifier" if self.constant_local(node) => self.local_value(node),
            _ => None,
        }
    }

    fn local_value(&self, name: Node) -> Option<i64> {
        let text = self.context.text(name);
        let mut scope = parent(name);
        while let Some(holder) = scope {
            for statement in named_children(holder).into_iter().filter(|part| part.kind() == "local_variable_declaration" && part.start_byte() < name.start_byte()) {
                let found = declarators(statement).into_iter().find(|declarator| declarator.child_by_field_name("name").is_some_and(|written| self.context.text(written) == text));
                if let Some(declarator) = found {
                    return declarator.child_by_field_name("value").and_then(|value| self.amount(value));
                }
            }
            scope = parent(holder);
        }
        None
    }
}
