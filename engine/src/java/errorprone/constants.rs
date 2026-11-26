//! Checks about fields: constants that are better inlined, and static fields that hold a `Throwable`.
use super::Context;
use super::fixes::Fix;
use super::lookup::field_of;
use crate::engine::source::{children, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

const EMPTY_NAMES: &[&str] = &["EMPTY", "EMPTY_STR", "EMPTY_STRING"];

fn empty_string_literal(context: &Context, value: Node) -> bool {
    value.kind() == "string_literal" && crate::java::types::expr::literal_text(context.file, value).is_some_and(|text| text.is_empty())
}

pub fn inline_trivial_constant(context: &Context, root: Node) {
    if !EMPTY_NAMES.iter().any(|name| context.file.text.contains(name)) {
        return;
    }
    let mut fields: Vec<(Node, Node, String)> = Vec::new();
    walk(root, |node| {
        if node.kind() != "field_declaration" || !has_modifier(node, "private") || !has_modifier(node, "static") || !has_modifier(node, "final") {
            return;
        }
        for declarator in declarators(node) {
            let Some(name) = declarator.child_by_field_name("name").map(|name| context.text(name)) else { continue };
            if !EMPTY_NAMES.contains(&name) || !declarator.child_by_field_name("value").is_some_and(|value| empty_string_literal(context, value)) {
                continue;
            }
            if !matches!(context.resolver.declared_type(node, Some(declarator)), Some(Type::Class(kind, _)) if kind == "java.lang.String") || context.suppressed("InlineTrivialConstant", node) {
                continue;
            }
            let Some(owner) = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, node) else { continue };
            fields.push((node, declarator, owner));
        }
    });
    if fields.is_empty() {
        return;
    }
    let mut uses: Vec<Vec<Node>> = vec![Vec::new(); fields.len()];
    walk(root, |node| {
        if !matches!(node.kind(), "identifier" | "field_access") || !super::values::value_name(node) {
            return;
        }
        let name = if node.kind() == "identifier" { context.text(node) } else { node.child_by_field_name("field").map(|part| context.text(part)).unwrap_or_default() };
        if !EMPTY_NAMES.contains(&name) {
            return;
        }
        let Some((declaring, field)) = field_of(context, node) else { return };
        for (at, (_, declarator, owner)) in fields.iter().enumerate() {
            if *owner == declaring.name && declarator.child_by_field_name("name").is_some_and(|part| context.text(part) == field.name) {
                uses[at].push(node);
            }
        }
    });
    for (at, (declaration, declarator, _)) in fields.iter().enumerate() {
        let mut fix = Fix::replace(declaration.start_byte(), declaration.end_byte(), "");
        for used in &uses[at] {
            fix = fix.and(used.start_byte(), used.end_byte(), "\"\"");
        }
        let Some(name) = declarator.child_by_field_name("name") else { continue };
        context.report_fixed("InlineTrivialConstant", *declaration, name.start_byte(), "Consider inlining this constant", &[fix]);
    }
}

const THROWABLE: &str = "Saving instances of Throwable in static fields is discouraged, prefer to create them on-demand when an exception is thrown";

fn throwable(context: &Context, kind: &Type) -> bool {
    matches!(kind, Type::Class(name, _) if context.resolver.index.is_subtype(name, "java.lang.Throwable"))
}

pub fn static_assignment_of_throwable(context: &Context, node: Node) {
    match node.kind() {
        "field_declaration" if has_modifier(node, "static") => {
            for declarator in declarators(node) {
                let Some(name) = declarator.child_by_field_name("name") else { continue };
                if declarator.child_by_field_name("value").is_none() {
                    continue;
                }
                let kind = context.resolver.declared_type(node, Some(declarator));
                if kind.is_some_and(|kind| throwable(context, &kind)) {
                    context.report_fixed("StaticAssignmentOfThrowable", node, name.start_byte(), THROWABLE, &[]);
                }
            }
        }
        "method_declaration" => {
            let Some(body) = node.child_by_field_name("body") else { return };
            scan_assignments(context, body, node);
        }
        _ => {}
    }
}

fn scan_assignments(context: &Context, node: Node, method: Node) {
    for part in children(node) {
        if matches!(part.kind(), "class_declaration" | "class_body" | "interface_declaration" | "enum_declaration" | "record_declaration") {
            continue;
        }
        if part.kind() == "assignment_expression" {
            check_assignment(context, part, method);
        }
        scan_assignments(context, part, method);
    }
}

fn check_assignment(context: &Context, assignment: Node, method: Node) {
    let (Some(left), Some(operator)) = (assignment.child_by_field_name("left"), assignment.child_by_field_name("operator")) else { return };
    if context.text(operator) != "=" {
        return;
    }
    let Some((_, field)) = field_of(context, left) else { return };
    if field.flags & flag::STATIC != 0 && throwable(context, &field.kind) {
        context.report_fixed("StaticAssignmentOfThrowable", method, operator.start_byte(), THROWABLE, &[]);
    }
}
