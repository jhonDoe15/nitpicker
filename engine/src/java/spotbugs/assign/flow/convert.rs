//! Code javac writes that is a call although the source shows none: boxing and unboxing (`Integer.valueOf`,
//! `intValue`), and a `switch` on anything but an `int` (`ordinal`, `hashCode`, a pattern switch). And the
//! variables a pattern binds, which hold a value nothing else is known about.
use super::Walk;
use super::values::State;
use crate::engine::source::{named_children, walk};
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::Type;
use tree_sitter::Node;

fn boxed(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Class(..))) && kind.clone().is_some_and(|kind| matches!(kind.unboxed_or_same(), Type::Primitive(_)))
}

fn primitive(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Primitive(_)))
}

pub fn converts(from: &Option<Type>, to: &Option<Type>) -> bool {
    (boxed(from) && primitive(to)) || (primitive(from) && boxed(to))
}

impl<'c, 'a> Walk<'c, 'a> {
    pub fn type_of(&self, node: Node<'a>) -> Option<Type> {
        let node = unwrap(node);
        if node.kind() == "identifier" {
            if let Some(Binding::Local(kind)) = self.context.resolver.binding(node, self.context.text(node)) {
                return kind;
            }
        }
        self.context.resolver.type_of(node)
    }

    /// A value of `from` stored where `to` is wanted: a call when one is boxed and the other is not.
    pub fn convert(&mut self, from: Node<'a>, to: &Option<Type>) -> bool {
        let converted = converts(&self.type_of(from), to);
        if converted {
            self.called();
        }
        converted
    }

    /// Whether javac unboxes an operand of this operator.
    pub fn unboxes(&self, node: Node<'a>) -> bool {
        let operator = node.child_by_field_name("operator").map(|operator| self.context.text(operator));
        let operands: Vec<Option<Type>> = ["left", "right", "operand"].iter().filter_map(|name| node.child_by_field_name(name)).map(|part| self.type_of(part)).collect();
        match operator {
            Some("==" | "!=") => operands.iter().any(boxed) && operands.iter().any(primitive),
            Some("+") if matches!(self.context.resolver.type_of(node), Some(Type::Class(name, _)) if name == "java.lang.String") => false,
            _ => operands.iter().any(boxed),
        }
    }

    /// Whether javac writes a call to pick the case of a `switch`.
    pub fn selects_by_call(&self, node: Node<'a>) -> bool {
        let Some(condition) = node.child_by_field_name("condition") else { return false };
        match self.type_of(condition) {
            Some(Type::Primitive(_)) => false,
            Some(_) => true,
            None => {
                let mut literal = false;
                walk(node.child_by_field_name("body").unwrap_or(node), |part| literal |= part.kind() == "string_literal" && part.parent().is_some_and(|label| label.kind() == "switch_label"));
                literal
            }
        }
    }

    /// The variables patterns in the node bind.
    pub fn bind(&mut self, node: Node<'a>, state: &mut State) {
        let mut names = Vec::new();
        walk(node, |part| {
            let name = match part.kind() {
                "instanceof_expression" => part.child_by_field_name("name"),
                "type_pattern" | "record_pattern_component" => named_children(part).into_iter().rfind(|piece| piece.kind() == "identifier"),
                _ => None,
            };
            names.extend(name);
        });
        for name in names {
            state.locals.insert(self.context.text(name).to_string(), self.numbers.fresh());
        }
    }
}
