//! Whether SpotBugs takes a class for one that threads share: it holds a monitor somewhere (a `synchronized` method or
//! block, lambdas included), it is a `Runnable`, a field is `volatile` or has an atomic or a `Lock` type, a local
//! variable or parameter has an atomic type, or its code calls a method of a `Lock` or one of the
//! `Collections.synchronized...` wrappers.
use super::super::Context;
use crate::engine::source::children;
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::Type;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

const LOCK: &str = "java.util.concurrent.locks.Lock";

fn element(kind: Type) -> Type {
    match kind {
        Type::Array(inner) => element(*inner),
        other => other,
    }
}

fn atomic(kind: Option<Type>) -> bool {
    matches!(kind.map(element), Some(Type::Class(name, _)) if name.starts_with("java.util.concurrent.atomic."))
}

fn lock(context: &Context, kind: Option<Type>) -> bool {
    matches!(kind.map(element), Some(Type::Class(name, _)) if context.resolver.index.is_subtype(&name, LOCK))
}

/// Every node of the class's own code, lambdas included, classes declared inside left out.
fn own<'t>(node: Node<'t>, out: &mut Vec<Node<'t>>) {
    for part in children(node) {
        if part.kind() == "class_body" || TYPE_DECLARATIONS.contains(&part.kind()) {
            continue;
        }
        out.push(part);
        own(part, out);
    }
}

pub fn threaded(context: &Context, own_name: &str, members: &[Node]) -> bool {
    if context.resolver.index.is_subtype(own_name, "java.lang.Runnable") {
        return true;
    }
    let mut nodes = Vec::new();
    for member in members {
        if TYPE_DECLARATIONS.contains(&member.kind()) {
            continue;
        }
        if member.kind() == "method_declaration" && super::synchronized(context, *member) {
            return true;
        }
        if member.kind() == "field_declaration" {
            if has_modifier(*member, "volatile") {
                return true;
            }
            let kind = member.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind));
            let arrays = declarators(*member).into_iter().any(|declarator| declarator.child_by_field_name("dimensions").is_some());
            if atomic(kind.clone()) || lock(context, kind) || (arrays && field_arrays(context, *member)) {
                return true;
            }
        }
        own(*member, &mut nodes);
    }
    nodes.into_iter().any(|node| match node.kind() {
        "synchronized_statement" => true,
        "formal_parameter" | "spread_parameter" | "local_variable_declaration" | "catch_formal_parameter" | "resource" => {
            atomic(node.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)))
        }
        "method_invocation" if node.child_by_field_name("name").is_some_and(|name| {
            let name = context.text(name);
            name.starts_with("synchronized") || matches!(name, "lock" | "lockInterruptibly" | "tryLock" | "unlock" | "newCondition")
        }) => context.resolver.resolve_call(node).is_some_and(|call| {
            context.resolver.index.is_subtype(&call.declaring, LOCK) || (call.declaring == "java.util.Collections" && call.method.name.starts_with("synchronized"))
        }),
        _ => false,
    })
}

fn field_arrays(context: &Context, member: Node) -> bool {
    declarators(member).into_iter().any(|declarator| {
        let kind = context.resolver.declared_type(member, Some(declarator));
        atomic(kind.clone()) || lock(context, kind)
    })
}
