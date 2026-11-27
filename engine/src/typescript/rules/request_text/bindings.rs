//! `request-bindings.mts`: request text bound to a name, and the assignments that trim it again.
use super::super::request_inputs::bindings::{decorator_call, decorators_of, element_name, is_from_package, parameter_name};
use super::super::request_inputs::calls::{is_request, transport_source, unwrapped};
use super::super::request_inputs::nest::{parameter_type, transport_of};
use super::super::request_inputs::order::is_assignment_pattern;
use super::super::request_inputs::tree::{is_pa, member_text, name_of, string_like, Tree, T};
use crate::typescript::rules::support::view::Node;

const REQUEST_TEXT_SOURCES: [&str; 2] = ["query string", "multipart form"];

pub struct Binding<'v> {
    pub name: String,
    pub field: String,
    pub anchor: Node<'v>,
}

fn peel_once<'v>(tree: &Tree<'v>, node: T<'v>) -> Option<T<'v>> {
    if node.level > 0 {
        return Some(node.with_level(node.level - 1));
    }
    let node = node.node;
    match node.kind() {
        "TSNonNullExpression" | "TSAsExpression" => tree.field(node, "expression"),
        "LogicalExpression" if matches!(node.text("operator").as_deref(), Some("??" | "||")) => tree.field(node, "left"),
        "CallExpression" => {
            let callee = tree.field(node, "callee")?.bare()?;
            let string = callee.is("Identifier") && callee.name().as_deref() == Some("String");
            if string { tree.fields(node, "arguments").first().copied().flatten() } else { None }
        }
        _ => None,
    }
}

fn peeled<'v>(tree: &Tree<'v>, expression: T<'v>) -> T<'v> {
    let mut current = expression;
    while let Some(next) = peel_once(tree, current) {
        current = next;
    }
    current
}

fn is_bag(tree: &Tree, node: Option<T>) -> bool {
    let Some(node) = node else { return false };
    let base = unwrapped(tree, node).node;
    if is_pa(base) && member_text(base).as_deref() == Some("body") {
        return tree.field(base, "object").is_some_and(is_request);
    }
    transport_source(tree, Some(node)).as_deref() == Some("query string")
}

fn hono_query(tree: &Tree, call: Node) -> bool {
    let Some(callee) = tree.field(call, "callee").and_then(T::bare).filter(|callee| is_pa(*callee)) else { return false };
    let owner = tree.field(callee, "object").and_then(T::bare).filter(|owner| is_pa(*owner));
    call.nodes("arguments").len() == 1 && member_text(callee).as_deref() == Some("query") && owner.is_some_and(|owner| member_text(owner).as_deref() == Some("req"))
}

pub fn is_raw_request_text(tree: &Tree, expression: T) -> bool {
    let Some(node) = peeled(tree, expression).bare() else { return false };
    if node.is("CallExpression") {
        return hono_query(tree, node);
    }
    node.is("MemberExpression") && is_bag(tree, tree.field(node, "object"))
}

fn is_string_type(tree: &Tree, start: Option<T>) -> bool {
    let Some(start) = start else { return false };
    let parts = if start.is("TSUnionType") { tree.fields(start.node, "types").into_iter().flatten().collect() } else { vec![start] };
    let present: Vec<&T> = parts.iter().filter(|part| !part.is("TSUndefinedKeyword")).collect();
    present.len() == 1 && present[0].is("TSStringKeyword")
}

fn nest_binding<'v>(tree: &Tree<'v>, parameter: Node<'v>) -> Option<Binding<'v>> {
    let arguments = match transport_of(tree, parameter, true) {
        Some(transport) if REQUEST_TEXT_SOURCES.contains(&transport.source.as_str()) => transport.arguments,
        _ => {
            let body = decorators_of(parameter).into_iter().any(|decorator| {
                let call = decorator_call(tree, decorator);
                call.name.as_deref() == Some("Body") && call.base.is_some() && is_from_package(tree, call.base, &["@nestjs/common"])
            });
            if !body {
                return None;
            }
            Vec::new()
        }
    };
    let name = parameter_name(parameter).filter(|name| name.is("Identifier"))?.name()?.into_owned();
    let field = string_like(arguments.first().copied())?;
    is_string_type(tree, parameter_type(tree, parameter)).then_some(Binding { name, field, anchor: parameter })
}

fn pattern_bindings<'v>(tree: &Tree<'v>, pattern: Node<'v>) -> Vec<Binding<'v>> {
    pattern.nodes("properties").into_iter().filter_map(|element| {
        let name = element_name(element).filter(|name| name.is("Identifier"))?;
        let defaulted = element.is("Property") && element.node("value").is_some_and(|value| value.is("AssignmentPattern"));
        if defaulted {
            return None;
        }
        let name = name.name()?.into_owned();
        let property = (element.is("Property") && !element.flag("shorthand")).then(|| if element.flag("computed") { None } else { name_of(tree.field(element, "key")) }).flatten();
        Some(Binding { field: property.unwrap_or_else(|| name.clone()), name, anchor: element })
    }).collect()
}

pub fn declared_bindings<'v>(tree: &Tree<'v>, node: Node<'v>) -> Vec<Binding<'v>> {
    if node.is("VariableDeclarator") {
        let (Some(id), Some(init)) = (node.node("id"), tree.field(node, "init")) else { return Vec::new() };
        if id.is("Identifier") && is_raw_request_text(tree, init) {
            let name = id.name().map(|name| name.into_owned()).unwrap_or_default();
            return vec![Binding { field: name.clone(), name, anchor: node }];
        }
        if id.is("ObjectPattern") && is_bag(tree, Some(peeled(tree, init))) {
            return pattern_bindings(tree, id);
        }
        return Vec::new();
    }
    if super::super::request_inputs::nest::is_parameter(node) { nest_binding(tree, node).into_iter().collect() } else { Vec::new() }
}

/// `/\b(?:trim|strip)\w*\s*\(/u`.
fn trims(text: &str) -> bool {
    let word = |character: char| character.is_ascii_alphanumeric() || character == '_';
    text.char_indices().any(|(at, _)| {
        let before = text[..at].chars().next_back();
        let rest = &text[at..];
        let Some(after) = rest.strip_prefix("trim").or_else(|| rest.strip_prefix("strip")) else { return false };
        if before.is_some_and(word) {
            return false;
        }
        let after = after.trim_start_matches(word);
        after.trim_start_matches(crate::typescript::rules::html_text::parts::is_js_space).starts_with('(')
    })
}

pub fn is_trimming_assignment(tree: &Tree, node: Node, name: &str) -> bool {
    let assignment = match node.kind() {
        "AssignmentExpression" => node.text("operator").as_deref() == Some("="),
        "AssignmentPattern" => is_assignment_pattern(node) && node.parent().is_none_or(|parent| !(parent.is("Property") && parent.flag("shorthand"))),
        _ => false,
    };
    let left = tree.field(node, "left").and_then(T::bare).filter(|left| left.start() == node.start());
    assignment && left.is_some_and(|left| left.is("Identifier") && left.name().as_deref() == Some(name)) && tree.field(node, "right").is_some_and(|right| trims(tree.text(right)))
}
