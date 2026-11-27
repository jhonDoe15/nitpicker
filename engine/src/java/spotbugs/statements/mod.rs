//! Patterns that look at one statement or expression inside a method: DCN_NULLPOINTER_EXCEPTION,
//! JLM_JSR166_UTILCONCURRENT_MONITORENTER, JLM_JSR166_LOCK_MONITORENTER and PREDICTABLE_RANDOM.
mod layout;
mod maps;
pub(super) mod random;
mod switches;
mod volatile;

use super::{Context, names, place};
use crate::engine::source::{children, named_children};
use crate::java::types::model::Type;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

/// The method a message names for code inside a member of the class, when SpotBugs' name for it is known.
pub fn member_label(context: &Context, own: &str, class: Node, member: Node) -> Option<String> {
    let around = crate::java::javac::instance_around(context.resolver, class);
    let outer = around.as_deref();
    match member.kind() {
        "method_declaration" => Some(names::method(context, own, member, None)),
        "constructor_declaration" | "compact_constructor_declaration" => Some(names::method(context, own, member, outer)),
        kind if TYPE_DECLARATIONS.contains(&kind) => Some(names::method(context, own, member, outer)),
        "static_initializer" => {
            let binary = names::binary(context, own);
            let simple = binary.rsplit(['.', '$']).next().unwrap_or(&binary).to_string();
            Some(format!("{binary}.<static initializer for {simple}>()"))
        }
        _ => None,
    }
}

/// Every node of a member's code that is not in a class declared inside, nor in a lambda, which javac makes a
/// method of its own: the lambdas go to `lambdas`.
pub fn own_nodes<'t>(node: Node<'t>, out: &mut Vec<Node<'t>>, lambdas: &mut Vec<Node<'t>>) {
    for part in children(node) {
        if part.kind() == "class_body" || TYPE_DECLARATIONS.contains(&part.kind()) {
            continue;
        }
        if part.kind() == "lambda_expression" {
            lambdas.push(part);
            continue;
        }
        out.push(part);
        own_nodes(part, out, lambdas);
    }
}

fn catches(context: &Context, clause: Node, wanted: &str) -> bool {
    children(clause)
        .into_iter()
        .filter(|part| part.kind() == "catch_formal_parameter")
        .flat_map(children)
        .filter(|part| part.kind() == "catch_type")
        .flat_map(named_children)
        .any(|listed| context.resolver.type_node(listed).is_some_and(|kind| kind.name() == wanted))
}

/// A lock taken with `synchronized` on an object of `java.util.concurrent`, which has its own way of locking.
fn monitor(context: &Context, lock: Node) -> Option<(&'static str, String)> {
    let Type::Class(name, _) = super::observed::observed(context, lock)?.erased() else { return None };
    if context.resolver.index.is_subtype(&name, "java.util.concurrent.locks.Lock") {
        return Some(("JLM_JSR166_LOCK_MONITORENTER", name));
    }
    name.starts_with("java.util.concurrent.").then_some(("JLM_JSR166_UTILCONCURRENT_MONITORENTER", name))
}

pub fn statements(context: &Context, class: Node) {
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let Some(body) = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")) else { return };
    random::subclass(context, class);
    for member in place::members(body) {
        if TYPE_DECLARATIONS.contains(&member.kind()) {
            continue;
        }
        let mut nodes = Vec::new();
        let mut lambdas = Vec::new();
        own_nodes(member, &mut nodes, &mut lambdas);
        check_method(context, member, &nodes, member_label(context, &own, class, member).as_deref());
        while let Some(lambda) = lambdas.pop() {
            let mut nodes = Vec::new();
            own_nodes(lambda, &mut nodes, &mut lambdas);
            check_method(context, lambda, &nodes, names::lambda(context, lambda).as_deref());
        }
    }
}

/// The patterns of one method's code: a member, or the body of a lambda. Code without a method SpotBugs names, as in
/// a field initializer, is only checked for predictable generators, which name their methods themselves.
fn check_method(context: &Context, member: Node, nodes: &[Node], label: Option<&str>) {
    if let Some(label) = label {
        maps::check(context, member, nodes, label);
        switches::check(context, member, nodes, label);
    }
    let mut locked = std::collections::HashSet::new();
    for node in nodes {
        random::check(context, *node);
        let Some(label) = label else { continue };
        volatile::check(context, *node, label);
        match node.kind() {
            "catch_clause" if catches(context, *node, "java.lang.NullPointerException") => {
                let message = format!("Do not catch NullPointerException like in {label}");
                context.report_placed("DCN_NULLPOINTER_EXCEPTION", *node, context.line(*node), message, place::function(label), 2);
            }
            "synchronized_statement" => {
                let Some(lock) = node.named_child(0) else { continue };
                if let Some((pattern, kind)) = monitor(context, lock) {
                    let place = place::value(context, label, lock);
                    // SpotBugs keeps one of the findings that name the same place on the same line.
                    if !locked.insert((pattern, context.line(*node), place.clone())) {
                        continue;
                    }
                    let message = format!("Synchronization performed on {} in {label}", names::binary(context, &kind));
                    let priority = if pattern == "JLM_JSR166_LOCK_MONITORENTER" { 1 } else { 2 };
                    let arguments = vec![names::binary(context, &kind), label.to_string()];
                    context.report_listed(pattern, *node, context.line(*node), message, place, priority, arguments);
                }
            }
            _ => {}
        }
    }
}
