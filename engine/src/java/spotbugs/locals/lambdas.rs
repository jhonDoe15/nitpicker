//! What the hidden method javac writes for a lambda looks like: its parameters, and whether it is an instance method.
use super::nested;
use super::super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::expr::Binding;
use crate::java::types::model::{OBJECT, flag};
use crate::java::types::scope::enclosing_types;
use std::collections::HashSet;
use tree_sitter::Node;

pub fn parameters(context: &Context, lambda: Node) -> Vec<String> {
    let Some(list) = lambda.child_by_field_name("parameters") else { return Vec::new() };
    if list.kind() == "identifier" {
        return vec![context.text(list).to_string()];
    }
    let parts = named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment"));
    parts.filter_map(|part| if part.kind() == "identifier" { Some(part) } else { super::assign::parameter_name(part) }).map(|name| context.text(name).to_string()).collect()
}

/// Whether a lambda's hidden method is an instance method: its body uses `this`, `super`, a field or method of an
/// object of a class around it, makes an anonymous class or an object of an inner or local class.
pub fn uses_this(context: &Context, lambda: Node) -> bool {
    let mut visit = children(lambda);
    while let Some(node) = visit.pop() {
        let found = match node.kind() {
            "this" | "super" => true,
            "class_body" if parent(node).is_some_and(|holder| holder.kind() == "object_creation_expression") => true,
            "identifier" if plain(node) => matches!(context.resolver.binding(node, context.text(node)), Some(Binding::Field(_, _, field)) if field.flags & flag::STATIC == 0),
            "method_invocation" if node.child_by_field_name("object").is_none() => {
                let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
                enclosing_types(context.resolver.scope, lambda).iter().find_map(|class| declared_in(context, class, name)).is_some_and(|fixed| !fixed)
            }
            "object_creation_expression" | "method_reference" => creates_inner(context, node),
            _ => false,
        };
        if found {
            return true;
        }
        if !nested(node) {
            visit.extend(children(node));
        }
    }
    false
}

/// An identifier that stands for a variable or field by itself, not the name part of something else.
fn plain(node: Node) -> bool {
    let Some(holder) = parent(node) else { return false };
    let is = |field: &str| holder.child_by_field_name(field).is_some_and(|part| part.id() == node.id());
    match holder.kind() {
        "field_access" => !is("field"),
        "method_invocation" => !is("name"),
        "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "inferred_parameters" | "lambda_expression" => is("value"),
        "labeled_statement" | "break_statement" | "continue_statement" | "method_reference" => false,
        _ => true,
    }
}

/// Whether `new X(...)` or `X::new` makes an object of a class that takes the object around it.
fn creates_inner(context: &Context, node: Node) -> bool {
    let written = match node.kind() {
        "object_creation_expression" => node.child_by_field_name("type"),
        _ if children(node).last().is_some_and(|last| last.kind() == "new") => node.named_child(0),
        _ => None,
    };
    let Some(written) = written.map(|written| if written.kind() == "generic_type" { written.named_child(0).unwrap_or(written) } else { written }) else { return false };
    let Some(class) = context.resolver.class_name(node, context.text(written)) else { return false };
    let mut inner = false;
    crate::engine::source::walk(context.file.tree.root_node(), |part| {
        let named = context.resolver.scope.names.get(&part.id()).is_some_and(|name| *name == class);
        inner |= named && part.kind() == "class_declaration" && crate::java::javac::instance_around(context.resolver, part).is_some();
    });
    inner
}

/// Whether a method of the name is static, looked up in a class, its superclasses, interfaces and `Object`.
fn declared_in(context: &Context, class: &str, name: &str) -> Option<bool> {
    let index = context.resolver.index;
    let mut pending = vec![class.to_string()];
    let mut seen = HashSet::new();
    while let Some(current) = pending.pop() {
        if !seen.insert(current.clone()) || seen.len() > 64 {
            continue;
        }
        let Some(info) = index.get(&current) else { continue };
        if let Some(method) = info.methods.iter().find(|method| method.name == name) {
            return Some(method.is_static);
        }
        pending.extend(info.interfaces.iter().cloned());
        pending.extend(info.superclass.clone());
    }
    let object = index.get(OBJECT)?;
    object.methods.iter().find(|method| method.name == name).map(|method| method.is_static)
}
