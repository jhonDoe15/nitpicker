//! ClassNewInstance: `Class.newInstance()` bypasses exception checking; prefer `getDeclaredConstructor().newInstance()`.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "Class.newInstance() bypasses exception checking; prefer getDeclaredConstructor().newInstance()";
const REFLECTIVE: &str = "java.lang.ReflectiveOperationException";
const THROWN: [&str; 4] = ["java.lang.InstantiationException", "java.lang.IllegalAccessException", "java.lang.reflect.InvocationTargetException", "java.lang.NoSuchMethodException"];

fn is_new_instance(context: &Context, call: Node) -> bool {
    call.kind() == "method_invocation"
        && call.child_by_field_name("name").is_some_and(|name| context.text(name) == "newInstance")
        && call.child_by_field_name("object").is_some()
        && context.resolver.matches_sig(call, "java.lang.Class#newInstance(_*)")
}

fn subtype(context: &Context, kind: &str, of: &str) -> bool {
    context.resolver.index.is_subtype(kind, of)
}

fn class_name(kind: Option<Type>) -> Option<String> {
    match kind? {
        Type::Class(name, _) => Some(name),
        _ => None,
    }
}

/// What is left of the four exceptions after the handlers: the types that no handler covers.
fn unhandled(context: &Context, handlers: &[Vec<String>]) -> Vec<&'static str> {
    let mut left: Vec<&'static str> = THROWN.to_vec();
    for alternatives in handlers {
        for precise in alternatives {
            left.retain(|element| !subtype(context, element, precise));
        }
    }
    left
}

fn catch_types<'t>(context: &Context, catch: Node<'t>) -> (Node<'t>, Vec<(Node<'t>, String)>) {
    let parameter = children(catch).into_iter().find(|part| part.kind() == "catch_formal_parameter").unwrap_or(catch);
    let union = children(parameter).into_iter().find(|part| part.kind() == "catch_type").unwrap_or(parameter);
    let alternatives = named_children(union)
        .into_iter()
        .filter(|part| !part.kind().ends_with("comment"))
        .filter_map(|part| class_name(context.resolver.type_node(part)).map(|name| (part, name)))
        .collect();
    (union, alternatives)
}

fn reflective_union(context: &Context, alternatives: &[(Node<'_>, String)]) -> bool {
    !alternatives.is_empty() && alternatives.iter().all(|(_, name)| subtype(context, name, REFLECTIVE))
}

fn fix_exceptions(context: &Context, call: Node, fix: &mut Fix) -> bool {
    let mut at = parent(call);
    let mut tried = None;
    while let Some(up) = at {
        if up.kind() == "catch_clause" {
            return false;
        }
        if matches!(up.kind(), "try_statement" | "try_with_resources_statement") && children(up).iter().any(|part| part.kind() == "catch_clause") {
            tried = Some(up);
            break;
        }
        at = parent(up);
    }
    let Some(tried) = tried else { return false };
    let catches: Vec<Node> = children(tried).into_iter().filter(|part| part.kind() == "catch_clause").collect();
    let infos: Vec<(Node, Vec<(Node, String)>)> = catches.iter().map(|catch| catch_types(context, *catch)).collect();
    let handlers: Vec<Vec<String>> = infos.iter().map(|(_, alternatives)| alternatives.iter().map(|(_, name)| name.clone()).collect()).collect();
    if unhandled(context, &handlers).is_empty() {
        return true;
    }
    let last = catches.len() - 1;
    let (last_type, last_alternatives) = &infos[last];
    if last_alternatives.len() > 1 {
        let mut seen: Vec<String> = Vec::new();
        let mut found = false;
        for (part, name) in last_alternatives {
            let shown = if subtype(context, name, REFLECTIVE) {
                found = true;
                "ReflectiveOperationException".to_string()
            } else {
                context.text(*part).to_string()
            };
            if !seen.contains(&shown) {
                seen.push(shown);
            }
        }
        if found {
            *fix = std::mem::take(fix).and(last_type.start_byte(), last_type.end_byte(), seen.join(" | "));
            return true;
        }
    }
    let reflective: Vec<usize> = (0..catches.len()).filter(|at| reflective_union(context, &infos[*at].1)).collect();
    let blocks: Vec<&str> = reflective.iter().filter_map(|at| catches[*at].child_by_field_name("body")).map(|body| context.text(body)).collect();
    let mut unique = blocks.clone();
    unique.sort_unstable();
    unique.dedup();
    if unique.len() != 1 {
        let name = children(catches[last]).into_iter().find(|part| part.kind() == "catch_formal_parameter").and_then(|part| part.child_by_field_name("name")).map(|name| context.text(name)).unwrap_or("e");
        let text = format!("catch (ReflectiveOperationException {name}) {{ throw new LinkageError({name}.getMessage(), {name}); }}");
        *fix = std::mem::take(fix).insert(catches[last].end_byte(), text);
        return true;
    }
    let mut calls_new_instance = false;
    walk(catches[reflective[0]], |inner| calls_new_instance |= is_new_instance(context, inner));
    if calls_new_instance {
        let (kind, _) = &infos[*reflective.last().unwrap_or(&0)];
        *fix = std::mem::take(fix).and(kind.start_byte(), kind.end_byte(), "ReflectiveOperationException");
        return true;
    }
    for (order, at) in reflective.iter().enumerate() {
        if order == 0 {
            let (kind, _) = &infos[*at];
            *fix = std::mem::take(fix).and(kind.start_byte(), kind.end_byte(), "ReflectiveOperationException");
        } else {
            *fix = std::mem::take(fix).delete(catches[*at].start_byte(), catches[*at].end_byte());
        }
    }
    true
}

fn fix_throws(context: &Context, call: Node, fix: &mut Fix) {
    let Some(method) = crate::engine::source::ancestor(call, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"]) else { return };
    let Some(clause) = children(method).into_iter().find(|part| part.kind() == "throws") else { return };
    let listed: Vec<Node> = named_children(clause).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let Some(last) = listed.last() else { return };
    let handlers: Vec<Vec<String>> = listed.iter().map(|part| class_name(context.resolver.type_node(*part)).into_iter().collect()).collect();
    let left = unhandled(context, &handlers);
    if left.is_empty() {
        return;
    }
    let mut names: Vec<&str> = left.iter().map(|name| name.rsplit('.').next().unwrap_or(name)).collect();
    names.sort_unstable();
    *fix = std::mem::take(fix).insert(last.end_byte(), format!(", {}", names.join(", "))).with_imports();
}

pub fn class_new_instance(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !is_new_instance(context, node) {
        return;
    }
    let Some(receiver) = node.child_by_field_name("object") else { return };
    let mut fix = Fix::replace(receiver.end_byte(), node.end_byte(), ".getDeclaredConstructor().newInstance()");
    if !fix_exceptions(context, node, &mut fix) {
        fix_throws(context, node, &mut fix);
    }
    let at = node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte());
    context.report_fixed("ClassNewInstance", node, at, MESSAGE, &[fix]);
}
