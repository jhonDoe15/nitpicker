//! Checks on the types that member signatures name.
use super::Context;
use super::hierarchy::{formals, simple_name};
use super::members::is_method;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::flag;
use crate::java::types::scope::{TYPE_DECLARATIONS, declared_name, enclosing_type, type_parameter};
use tree_sitter::Node;

/// Whether the class or a class around it is private, local or anonymous.
fn hidden_class(context: &Context, name: &str) -> bool {
    let index = context.resolver.index;
    let mut current = name;
    while let Some(info) = index.get(current) {
        let last = current.rsplit('.').next().unwrap_or_default();
        if info.flags & flag::PRIVATE != 0 || last.starts_with(|first: char| first.is_ascii_digit()) {
            return true;
        }
        let Some((outer, _)) = current.rsplit_once('.') else { break };
        current = outer;
    }
    false
}

fn injected(context: &Context, declaration: Node) -> bool {
    crate::java::helpers::modifiers(declaration)
        .map(children)
        .unwrap_or_default()
        .into_iter()
        .filter(|part| matches!(part.kind(), "annotation" | "marker_annotation"))
        .filter_map(|annotation| annotation.child_by_field_name("name"))
        .filter(|name| context.text(*name).ends_with("Inject"))
        .filter_map(|name| context.resolver.class_name(name, context.text(name)))
        .any(|class| matches!(class.as_str(), "com.google.inject.Inject" | "javax.inject.Inject" | "jakarta.inject.Inject"))
}

/// The uses of hidden classes in a type as written, in the order javac's scanner meets them: where and which class.
fn uses(context: &Context, node: Node, found: &mut Vec<(usize, String)>) {
    let last_dot = |node: Node| children(node).into_iter().filter(|part| part.kind() == ".").next_back().map_or(node.start_byte(), |dot| dot.start_byte());
    let mut check = |written: Node, at: usize| {
        let text: String = context.text(written).split_whitespace().collect();
        let plain = !text.contains(['<', '@']);
        if let Some(name) = Some(text).filter(|_| plain).and_then(|text| context.resolver.class_name(written, &text)).filter(|name| hidden_class(context, name)) {
            found.push((at, name));
        }
    };
    match node.kind() {
        "type_identifier" | "identifier" => {
            if type_parameter(context.file, node, context.text(node)).is_none() {
                check(node, node.start_byte());
            }
        }
        "scoped_type_identifier" | "scoped_identifier" => {
            check(node, last_dot(node));
            let parts = named_children(node);
            let count = parts.len();
            for part in parts.into_iter().take(count.saturating_sub(1)) {
                uses(context, part, found);
            }
        }
        "annotation" | "marker_annotation" => {
            if let Some(name) = node.child_by_field_name("name") {
                uses(context, name, found);
            }
        }
        "type_parameter" => {
            for part in named_children(node).into_iter().filter(|part| !matches!(part.kind(), "type_identifier" | "identifier")) {
                uses(context, part, found);
            }
        }
        _ => {
            for part in named_children(node) {
                uses(context, part, found);
            }
        }
    }
}

pub fn exposed_private_type(context: &Context, node: Node) {
    let field = matches!(node.kind(), "field_declaration" | "constant_declaration");
    let class = TYPE_DECLARATIONS.contains(&node.kind());
    if !(field || class || is_method(node)) || has_modifier(node, "private") || injected(context, node) {
        return;
    }
    let scope = context.resolver.scope;
    let owner = if class { declared_name(context.file, scope, node) } else { enclosing_type(context.file, scope, node) };
    if owner.as_deref().is_none_or(|owner| hidden_class(context, owner)) {
        return;
    }
    let mut found = Vec::new();
    if field {
        if let Some(written) = node.child_by_field_name("type") {
            uses(context, written, &mut found);
        }
    } else if class {
        for part in children(node).into_iter().filter(|part| matches!(part.kind(), "superclass" | "super_interfaces" | "extends_interfaces")) {
            uses(context, part, &mut found);
        }
        if let Some(list) = node.child_by_field_name("type_parameters") {
            uses(context, list, &mut found);
        }
    } else {
        if let Some(written) = node.child_by_field_name("type") {
            uses(context, written, &mut found);
        }
        let record = Some(node).filter(|node| node.kind() == "compact_constructor_declaration").and_then(parent).and_then(parent);
        for parameter in formals(record.unwrap_or(node)) {
            for part in named_children(parameter).into_iter().filter(|part| part.kind() != "modifiers" && Some(*part) != parameter.child_by_field_name("name")) {
                if part.kind() != "variable_declarator" {
                    uses(context, part, &mut found);
                }
            }
        }
        for part in children(node).into_iter().filter(|part| part.kind() == "throws") {
            uses(context, part, &mut found);
        }
        let list = node.child_by_field_name("type_parameters").or_else(|| children(node).into_iter().find(|part| part.kind() == "type_parameters"));
        if let Some(list) = list {
            uses(context, list, &mut found);
        }
    }
    let Some(at) = found.first().map(|(at, _)| *at) else { return };
    let mut classes: Vec<&str> = Vec::new();
    let mut seen: Vec<&String> = Vec::new();
    for (_, name) in &found {
        if !seen.contains(&name) {
            seen.push(name);
            classes.push(simple_name(name));
        }
    }
    let owner_name = owner.as_deref().map(simple_name).unwrap_or_default();
    let names: Vec<&str> = if field {
        declarators(node).into_iter().filter_map(|declarator| declarator.child_by_field_name("name")).map(|name| context.text(name)).collect()
    } else if node.kind() == "method_declaration" || node.kind() == "annotation_type_element_declaration" || class {
        node.child_by_field_name("name").map(|name| context.text(name)).into_iter().collect()
    } else {
        vec![owner_name]
    };
    for name in names {
        let message = format!("Signature of non-private member '{}' should not reference private classes: {}", name, classes.join(", "));
        context.report("ExposedPrivateType", node, at, &message);
    }
}
