//! InconsistentCapitalization: a parameter named like a field but for its capitalization.
use super::fixes::Fix;
use super::finals::{rename_variable, Local};
use super::Context;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::expr::Binding;
use tree_sitter::Node;

const CLASSES: [&str; 4] = ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration"];

fn is_class(node: Node) -> bool {
    CLASSES.contains(&node.kind()) || node.kind() == "class_body" && parent(node).is_some_and(|up| matches!(up.kind(), "object_creation_expression" | "enum_constant"))
}

fn members<'t>(class: Node<'t>) -> Vec<Node<'t>> {
    let body = if class.kind() == "class_body" { Some(class) } else { class.child_by_field_name("body") };
    let Some(body) = body else { return Vec::new() };
    let mut out = Vec::new();
    for member in children(body) {
        if member.kind() == "enum_body_declarations" {
            out.extend(children(member));
        } else {
            out.push(member);
        }
    }
    out
}

/// The names of the fields that count, in declaration order.
fn field_names(context: &Context, class: Node) -> Vec<String> {
    let interface = class.kind() == "interface_declaration";
    let mut names = Vec::new();
    let mut add = |name: &str, is_static: bool| {
        if !(is_static && name == name.to_ascii_uppercase()) {
            names.push(name.to_string());
        }
    };
    if class.kind() == "record_declaration" {
        for parameter in class.child_by_field_name("parameters").map(named_children).unwrap_or_default() {
            if let Some(name) = parameter.child_by_field_name("name") {
                add(context.text(name), false);
            }
        }
    }
    for member in members(class) {
        if !matches!(member.kind(), "field_declaration" | "constant_declaration") {
            continue;
        }
        let is_static = interface || has_modifier(member, "static");
        for declarator in declarators(member) {
            if let Some(name) = declarator.child_by_field_name("name") {
                add(context.text(name), is_static);
            }
        }
    }
    names
}

fn parameter_names<'t>(list: Node<'t>) -> Vec<Node<'t>> {
    named_children(list)
        .into_iter()
        .filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter"))
        .filter_map(|part| part.child_by_field_name("name").or_else(|| children(part).into_iter().find(|inner| inner.kind() == "variable_declarator").and_then(|d| d.child_by_field_name("name"))))
        .collect()
}

/// Each parameter of a method, constructor or lambda in the class, with the node that holds it.
fn parameters<'t>(class: Node<'t>) -> Vec<(Node<'t>, Node<'t>)> {
    let mut found = Vec::new();
    walk(class, |node| {
        if !matches!(node.kind(), "method_declaration" | "constructor_declaration" | "lambda_expression") {
            return;
        }
        let Some(list) = node.child_by_field_name("parameters") else { return };
        match list.kind() {
            "formal_parameters" => found.extend(parameter_names(list).into_iter().map(|name| (name, node))),
            "inferred_parameters" => found.extend(named_children(list).into_iter().filter(|name| name.kind() == "identifier").map(|name| (name, node))),
            "identifier" => found.push((list, node)),
            _ => {}
        }
    });
    found
}

fn qualification(context: &Context, parameter: Node, class: Node, own: &str, simple: &str) -> String {
    let mut current = parent(parameter);
    while let Some(node) = current {
        if node.id() == class.id() {
            break;
        }
        if is_class(node) {
            let inner = super::parts::enclosing_class(context, parameter);
            if inner.is_some_and(|inner| context.resolver.index.is_subtype(&inner, own)) {
                return "super.".to_string();
            }
            return format!("{simple}.this.");
        }
        current = parent(node);
    }
    "this.".to_string()
}

fn is_reference(node: Node) -> bool {
    let Some(above) = parent(node) else { return false };
    match above.kind() {
        "method_invocation" => above.child_by_field_name("name").is_none_or(|written| written.id() != node.id()),
        "field_access" => above.child_by_field_name("field").is_none_or(|written| written.id() != node.id()),
        "variable_declarator" => above.child_by_field_name("value").is_some_and(|written| written.id() == node.id()),
        "formal_parameter" | "method_declaration" | "constructor_declaration" | "scoped_identifier" | "labeled_statement" | "break_statement" | "continue_statement" | "annotation" | "marker_annotation" | "spread_parameter" => false,
        _ => true,
    }
}

fn fix_for(context: &Context, class: Node, own: &str, simple: &str, name: Node, holder: Node, field: &str) -> Fix {
    let local = Local { name, declaration: name, initialized: true, scope: holder };
    let mut fix = rename_variable(context, &local, context.text(name), field, true);
    let qualified = format!("{}{field}", qualification(context, name, class, own, simple));
    walk(holder, |node| {
        if node.kind() != "identifier" || context.text(node) != field || !is_reference(node) {
            return;
        }
        if matches!(context.resolver.binding(node, field), Some(Binding::Field(_, info, found)) if info.name == own && found.name == field) {
            fix = std::mem::take(&mut fix).and(node.start_byte(), node.end_byte(), &qualified);
        }
    });
    fix
}

pub fn inconsistent_capitalization(context: &Context, node: Node) {
    if !is_class(node) {
        return;
    }
    let fields = field_names(context, node);
    if fields.is_empty() {
        return;
    }
    let Some(own) = members(node).first().and_then(|member| super::parts::enclosing_class(context, *member)) else { return };
    let simple = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    for (name, holder) in parameters(node) {
        let written = context.text(name);
        let lower = written.to_ascii_lowercase();
        let Some(field) = fields.iter().find(|field| field.to_ascii_lowercase() == lower) else { continue };
        if field == written {
            continue;
        }
        let fix = fix_for(context, node, &own, simple, name, holder, field);
        let message = format!("Found the field '{field}' with the same name as the parameter '{written}' but with different capitalization.");
        context.report_fixed("InconsistentCapitalization", node, name.start_byte(), &message, &[fix]);
    }
}
