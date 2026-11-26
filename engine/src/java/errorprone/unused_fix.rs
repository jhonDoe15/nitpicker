//! The fix UnusedException suggests: pass the caught exception to the constructor of the exception that is thrown.
use super::fixes::Fix;
use super::Context;
use crate::engine::source::{children, named_children};
use crate::java::types::model::{Method, flag};
use tree_sitter::Node;

fn visibility(method: &Method) -> (bool, bool, bool) {
    (method.flags & flag::PUBLIC != 0, method.flags & flag::PROTECTED != 0, method.is_private)
}

/// The throws in a block, not looking into nested `try` statements.
fn throws<'t>(node: Node<'t>, found: &mut Vec<Node<'t>>) {
    for part in children(node) {
        match part.kind() {
            "try_statement" | "try_with_resources_statement" => {}
            "throw_statement" => {
                found.push(part);
                throws(part, found);
            }
            _ => throws(part, found),
        }
    }
}

fn constructor_fix(context: &Context, creation: Node, name: &str, caught: &[crate::java::types::model::Type]) -> Option<Fix> {
    let (resolved, _) = context.resolver.call_formals(creation)?;
    let used = &resolved.method;
    let class = context.resolver.index.get(&resolved.declaring)?;
    let anonymous = children(creation).iter().any(|part| part.kind() == "class_body");
    let fits = class.methods.iter().filter(|each| each.name == "<init>").find(|each| {
        each.parameters.len() == used.parameters.len() + 1
            && (anonymous || visibility(each) == visibility(used))
            && each.parameters[..used.parameters.len()] == used.parameters[..]
            && caught.iter().all(|kind| context.resolver.assignable(kind, &each.parameters[used.parameters.len()], false))
    });
    fits?;
    let given: Vec<Node> = creation.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    match given.last() {
        Some(last) => Some(Fix::new().insert(last.end_byte(), format!(", {name}"))),
        None => {
            let list = creation.child_by_field_name("arguments")?;
            Some(Fix::new().insert(list.start_byte() + 1, name))
        }
    }
}

/// The fixes for every `throw new X(...)` in the catch block.
pub fn fixes(context: &Context, clause: Node, parameter: Node, name: &str) -> Vec<Fix> {
    let Some(body) = clause.child_by_field_name("body") else { return Vec::new() };
    let kinds: Vec<_> = children(parameter)
        .into_iter()
        .filter(|part| part.kind() == "catch_type")
        .flat_map(named_children)
        .filter_map(|kind| context.resolver.type_node(kind))
        .collect();
    let mut found = Vec::new();
    throws(body, &mut found);
    let mut all = Fix::new();
    for statement in found {
        let Some(thrown) = named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")) else { continue };
        if thrown.kind() == "object_creation_expression" {
            if let Some(fix) = constructor_fix(context, thrown, name, &kinds) {
                all = all.merged((fix).clone());
            }
        }
    }
    vec![all]
}
