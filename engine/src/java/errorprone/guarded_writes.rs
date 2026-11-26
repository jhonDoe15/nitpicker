//! StaticGuardedByInstance: a write to a static variable inside `synchronized` on an instance lock.
use super::Context;
use super::nodes::unparenthesized;
use super::shape::preferred;
use crate::engine::source::{children, named_children};
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

/// A variable a name stands for: whether it is static, and the name javac prints for it.
struct Variable {
    is_static: bool,
    name: String,
}

fn variable(context: &Context, node: Node) -> Option<Variable> {
    match node.kind() {
        "this" => Some(Variable { is_static: false, name: "this".to_string() }),
        "identifier" => {
            let name = context.text(node);
            match context.resolver.binding(node, name)? {
                Binding::Local(_) => Some(Variable { is_static: false, name: name.to_string() }),
                Binding::Field(_, _, field) => Some(Variable { is_static: field.flags & flag::STATIC != 0, name: name.to_string() }),
            }
        }
        "field_access" => {
            let object = node.child_by_field_name("object")?;
            let name = context.text(node.child_by_field_name("field")?);
            let owner = match context.resolver.receiver(object)? {
                Receiver::Static(owner) => owner,
                Receiver::Value(Type::Class(owner, _)) => owner,
                Receiver::Value(Type::Array(_)) if name == "length" => return Some(Variable { is_static: false, name: name.to_string() }),
                Receiver::Value(_) => return None,
            };
            let (_, field) = context.resolver.index.field(&owner, name)?;
            Some(Variable { is_static: field.flags & flag::STATIC != 0, name: name.to_string() })
        }
        _ => None,
    }
}

fn record(context: &Context, target: Node, lock: &str) {
    if !matches!(target.kind(), "identifier" | "field_access") || !variable(context, target).is_some_and(|found| found.is_static) {
        return;
    }
    let message = format!("Write to static variable should not be guarded by instance lock '{lock}'");
    context.report_fixed("StaticGuardedByInstance", target, preferred(target), &message, &[]);
}

fn scan(context: &Context, node: Node, lock: &str) {
    match node.kind() {
        "synchronized_statement" | "object_creation_expression" => return,
        "assignment_expression" => {
            if let Some(left) = node.child_by_field_name("left") {
                record(context, left, lock);
            }
        }
        "update_expression" => {
            if let Some(operand) = named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")) {
                record(context, operand, lock);
            }
        }
        _ => {}
    }
    for child in children(node) {
        scan(context, child, lock);
    }
}

pub fn static_guarded_by_instance(context: &Context, node: Node) {
    if node.kind() != "synchronized_statement" {
        return;
    }
    let (Some(lock), Some(block)) = (named_children(node).into_iter().find(|part| part.kind() == "parenthesized_expression"), node.child_by_field_name("body")) else { return };
    let Some(lock) = variable(context, unparenthesized(lock)).filter(|found| !found.is_static) else { return };
    for child in children(block) {
        scan(context, child, &lock.name);
    }
}
