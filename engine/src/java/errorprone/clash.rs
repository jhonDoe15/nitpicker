//! FunctionalInterfaceClash: overloads that take different functional interfaces with the same shape.
use super::hierarchy::{closure, declared_method, sub_signature, super_methods};
use super::shape::suppressed_any;
use super::Context;
use crate::engine::source::children;
use crate::java::types::index::TypeIndex;
use crate::java::types::model::{ClassInfo, Method, Type};
use std::collections::HashMap;
use tree_sitter::Node;

type Entry<'c> = (&'c ClassInfo, &'c Method);

fn same(a: &Entry, b: &Entry) -> bool {
    std::ptr::eq(a.1, b.1)
}

fn functional(index: &TypeIndex, kind: &Type) -> bool {
    matches!(kind, Type::Class(name, _) if index.functional_method(name).is_some())
}

fn has_functional(index: &TypeIndex, method: &Method) -> bool {
    method.generic_parameters.iter().any(|kind| functional(index, kind))
}

fn overrides(index: &TypeIndex, sub: &Entry, other: &Entry) -> bool {
    sub.1.name == other.1.name
        && !sub.1.is_static
        && !other.1.is_private
        && sub.0.name != other.0.name
        && index.is_subtype(&sub.0.name, &other.0.name)
        && sub_signature(index, sub.0, sub.1, other.0, other.1)
}

fn descriptor(kind: &Type) -> String {
    kind.erased().name()
}

fn signature_of(index: &TypeIndex, entry: &Entry) -> String {
    let parts: Vec<String> = entry
        .1
        .generic_parameters
        .iter()
        .map(|kind| {
            let Type::Class(name, _) = kind else { return descriptor(kind) };
            let Some((declaring, method)) = index.functional_method(name) else { return descriptor(kind) };
            let map = index.member_map(kind, &declaring.name);
            let given: Vec<String> = method.generic_parameters.iter().map(|formal| descriptor(&formal.substitute(&map))).collect();
            let returned = if given.is_empty() { descriptor(&method.generic_returns.substitute(&map)) } else { "_".to_string() };
            format!("({})->{returned}", given.join(","))
        })
        .collect();
    format!("{}({})", entry.1.name, parts.join(","))
}

fn widens(from: &str, to: &str) -> bool {
    const ORDER: [&str; 6] = ["byte", "short", "int", "long", "float", "double"];
    if from == to {
        return true;
    }
    if from == "char" {
        return ORDER.iter().position(|kind| *kind == to).is_some_and(|at| at >= 2);
    }
    match (ORDER.iter().position(|kind| *kind == from), ORDER.iter().position(|kind| *kind == to)) {
        (Some(a), Some(b)) => a < b,
        _ => false,
    }
}

fn params_subtype(index: &TypeIndex, a: &Method, b: &Method) -> bool {
    a.parameters.len() == b.parameters.len()
        && a.parameters.iter().zip(&b.parameters).all(|(x, y)| match (x, y) {
            (Type::Class(left, _), Type::Class(right, _)) => index.is_subtype(left, right),
            (Type::Primitive(left), Type::Primitive(right)) => widens(left, right),
            _ => x == y,
        })
}

fn simple_names(text: &str) -> String {
    let mut out = String::new();
    let mut token = String::new();
    for character in text.chars().chain(std::iter::once('\u{0}')) {
        if character.is_alphanumeric() || character == '.' || character == '_' || character == '$' {
            token.push(character);
            continue;
        }
        out.push_str(token.rsplit('.').next().unwrap_or(""));
        token.clear();
        if character != '\u{0}' {
            out.push(character);
            if character == ',' {
                out.push(' ');
            }
        }
    }
    out
}

fn pretty(origin: &str, entry: &Entry) -> String {
    let name = if entry.1.name == "<init>" {
        entry.0.name.rsplit('.').next().unwrap_or_default().to_string()
    } else if entry.0.name != origin {
        format!("{}.{}", entry.0.name.rsplit('.').next().unwrap_or_default(), entry.1.name)
    } else {
        entry.1.name.clone()
    };
    format!("{name}({})", simple_names(&entry.1.shown.replace(", ", ",")))
}

fn class_members<'t>(node: Node<'t>) -> Vec<Node<'t>> {
    let body = match node.kind() {
        "object_creation_expression" => children(node).into_iter().find(|part| part.kind() == "class_body"),
        _ => node.child_by_field_name("body"),
    };
    let Some(body) = body else { return Vec::new() };
    let mut found = Vec::new();
    for member in children(body) {
        match member.kind() {
            "method_declaration" | "constructor_declaration" => found.push(member),
            "enum_body_declarations" => found.extend(children(member).into_iter().filter(|part| matches!(part.kind(), "method_declaration" | "constructor_declaration"))),
            _ => {}
        }
    }
    found
}

fn non_interface_super(index: &TypeIndex, entry: &Entry) -> bool {
    super_methods(index, entry.0, entry.1).iter().any(|(owner, _)| !owner.is_interface)
}

const MESSAGE: &str = "When passing lambda arguments to this function, callers will need a cast to disambiguate with: ";

pub fn functional_interface_clash(context: &Context, node: Node) {
    if !matches!(node.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "object_creation_expression") {
        return;
    }
    let members = class_members(node);
    if members.is_empty() {
        return;
    }
    let index = context.resolver.index;
    let Some(origin) = context.resolver.scope.names.get(&node.id()).and_then(|name| index.get(name)) else { return };
    if !members.iter().any(|member| declared_method(context, *member).is_some_and(|(_, method)| has_functional(index, method))) {
        return;
    }
    let mut entries: Vec<Entry> = Vec::new();
    for name in std::iter::once(origin.name.clone()).chain(closure(index, &origin.name)) {
        let Some(info) = index.get(&name) else { continue };
        for method in &info.methods {
            if !has_functional(index, method) || (method.name == "<init>" && info.name != origin.name) {
                continue;
            }
            entries.push((info, method));
        }
    }
    let mut by_signature: HashMap<String, Vec<Entry>> = HashMap::new();
    for entry in &entries {
        let beaten = entries.iter().any(|other| {
            other.1.name == entry.1.name && !overrides(index, entry, other) && !same(entry, other) && other.1.parameters.len() == entry.1.parameters.len() && params_subtype(index, entry.1, other.1)
        });
        if !beaten {
            by_signature.entry(signature_of(index, entry)).or_default().push(*entry);
        }
    }
    for member in members {
        let Some((info, method)) = declared_method(context, member) else { continue };
        if !has_functional(index, method) {
            continue;
        }
        let own: Entry = (info, method);
        let mut clash = by_signature.remove(&signature_of(index, &own)).unwrap_or_default();
        clash.retain(|other| !same(other, &own));
        let mut worklist = vec![own];
        while !worklist.is_empty() {
            let current = worklist.remove(0);
            let (overridden, rest): (Vec<Entry>, Vec<Entry>) = clash.into_iter().partition(|other| overrides(index, &current, other));
            worklist.extend(overridden);
            clash = rest;
        }
        if clash.is_empty() {
            continue;
        }
        if non_interface_super(index, &own) && clash.iter().any(|other| non_interface_super(index, other)) {
            continue;
        }
        if suppressed_any(context, &["FunctionalInterfaceClash"], member) {
            continue;
        }
        let mut lines: Vec<String> = clash.iter().map(|other| format!("\n    {}", pretty(&origin.name, other))).collect();
        lines.sort();
        let at = member.child_by_field_name("name").map_or(member.start_byte(), |name| name.start_byte());
        context.report_fixed("FunctionalInterfaceClash", member, at, &format!("{MESSAGE}{}", lines.concat()), &[]);
    }
}
