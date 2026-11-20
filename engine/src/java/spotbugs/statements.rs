//! Patterns that look at one statement or expression inside a method: DCN_NULLPOINTER_EXCEPTION,
//! JLM_JSR166_UTILCONCURRENT_MONITORENTER and PREDICTABLE_RANDOM.
use super::{Context, names};
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use crate::java::types::scope::{TYPE_DECLARATIONS, enclosing_types};
use tree_sitter::Node;

/// The method a message names for code inside a member of the class, when SpotBugs' name for it is known.
pub fn member_label(context: &Context, own: &str, class: Node, member: Node) -> Option<String> {
    let inner = class.kind() == "class_declaration" && !has_modifier(class, "static") && parent(class).is_some_and(|holder| holder.kind() == "class_body");
    let nest = enclosing_types(context.resolver.scope, class);
    let outer = nest.get(1).filter(|_| inner).map(String::as_str);
    match member.kind() {
        "method_declaration" => Some(names::method(context, own, member, None)),
        "constructor_declaration" => Some(names::method(context, own, member, outer)),
        "static_initializer" => Some(format!("{}.<clinit>()", names::binary(context, own))),
        _ => None,
    }
}

/// Every node of a member's code that belongs to the member itself: not lambdas, not classes declared inside.
fn own_nodes<'t>(node: Node<'t>, out: &mut Vec<Node<'t>>) {
    for part in children(node) {
        if matches!(part.kind(), "lambda_expression" | "class_body") || TYPE_DECLARATIONS.contains(&part.kind()) {
            continue;
        }
        out.push(part);
        own_nodes(part, out);
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

fn predictable(context: &Context, node: Node) -> Option<&'static str> {
    let resolver = context.resolver;
    match node.kind() {
        "object_creation_expression" => {
            let made = node.child_by_field_name("type").and_then(|written| resolver.type_node(written))?.name();
            (made == "java.util.Random").then_some("java.util.Random")
        }
        "method_invocation" => {
            let name = context.text(node.child_by_field_name("name")?);
            let found = resolver.resolve_call(node)?;
            match (found.declaring.as_str(), name) {
                ("java.util.concurrent.ThreadLocalRandom", "current") => Some("java.util.concurrent.ThreadLocalRandom"),
                ("java.lang.Math", "random") => Some("java.lang.Math.random()"),
                _ => None,
            }
        }
        _ => None,
    }
}

pub fn statements(context: &Context, class: Node) {
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let Some(body) = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")) else { return };
    let mut members = children(body);
    members.extend(children(body).into_iter().filter(|part| part.kind() == "enum_body_declarations").flat_map(children));
    for member in members {
        if TYPE_DECLARATIONS.contains(&member.kind()) {
            continue;
        }
        let label = member_label(context, &own, class, member);
        let mut nodes = Vec::new();
        own_nodes(member, &mut nodes);
        for node in nodes {
            if let Some(generator) = predictable(context, node) {
                context.report("PREDICTABLE_RANDOM", node, context.line(node), format!("This random generator ({generator}) is predictable"));
            }
            let Some(label) = &label else { continue };
            match node.kind() {
                "catch_clause" if catches(context, node, "java.lang.NullPointerException") => {
                    context.report("DCN_NULLPOINTER_EXCEPTION", node, context.line(node), format!("Do not catch NullPointerException like in {label}"));
                }
                "synchronized_statement" => {
                    if let Some((pattern, lock)) = node.named_child(0).and_then(|lock| monitor(context, lock)) {
                        context.report(pattern, node, context.line(node), format!("Synchronization performed on {} in {label}", names::binary(context, &lock)));
                    }
                }
                _ => {}
            }
        }
    }
}
