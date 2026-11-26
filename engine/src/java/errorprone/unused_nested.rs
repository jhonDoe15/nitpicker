//! UnusedNestedClass: a private or local class that nothing outside its own body uses.
use super::Context;
use super::boxed::effectively_private;
use super::fix_helpers::replace_including_comments;
use super::keep::{CLASSES, should_keep};
use crate::engine::source::{children, walk};
use crate::java::types::expr::Binding;
use std::collections::HashSet;
use tree_sitter::Node;

const MESSAGE: &str = "This nested class is unused, and can be removed.";
const TYPES: [&str; 5] = ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];
const MEMBERS: [&str; 3] = ["method_declaration", "variable_declarator", "enum_constant"];

fn ignored(context: &Context, class: Node) -> bool {
    let name = class.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let suppressed = context.suppress_strings(class).iter().any(|word| matches!(word.as_str(), "UnusedNestedClass" | "unused" | "all"));
    suppressed || should_keep(context, class, CLASSES) || name.to_lowercase().starts_with("unused")
}

fn candidates<'t>(context: &Context, node: Node<'t>, found: &mut Vec<Node<'t>>) {
    for part in children(node) {
        if TYPES.contains(&part.kind()) {
            if ignored(context, part) {
                continue;
            }
            if effectively_private(part) {
                found.push(part);
            }
        }
        candidates(context, part, found);
    }
}

/// Every name declared inside a candidate: members, constants and member classes.
fn declared_names<'f>(context: &'f Context, classes: &[Node]) -> HashSet<&'f str> {
    let mut names = HashSet::new();
    for class in classes {
        if let Some(name) = class.child_by_field_name("name") {
            names.insert(context.text(name));
        }
        walk(*class, |part| {
            if MEMBERS.contains(&part.kind()) || TYPES.contains(&part.kind()) {
                if let Some(name) = part.child_by_field_name("name") {
                    names.insert(context.text(name));
                }
            }
        });
    }
    names
}

fn mark(context: &Context, at: Node, class: &str, used: &mut HashSet<String>) {
    let within = super::super::types::scope::enclosing_types(context.resolver.scope, at);
    let mut current = class.to_string();
    loop {
        if !within.contains(&current) {
            used.insert(current.clone());
        }
        match current.rsplit_once('.') {
            Some((outer, _)) if context.resolver.index.has(outer) => current = outer.to_string(),
            _ => break,
        }
    }
}

fn scan_use(context: &Context, node: Node, names: &HashSet<&str>, used: &mut HashSet<String>) {
    let up = crate::engine::source::parent(node);
    match node.kind() {
        "method_invocation" => {
            let Some(name) = node.child_by_field_name("name").filter(|name| names.contains(context.text(*name))) else { return };
            let _ = name;
            if let Some(resolved) = context.resolver.resolve_call(node) {
                mark(context, node, &resolved.declaring, used);
            }
        }
        "identifier" | "type_identifier" => {
            let text = context.text(node);
            if !names.contains(text) || up.is_some_and(|up| matches!(up.kind(), "scoped_type_identifier" | "scoped_identifier" | "method_invocation")) {
                return;
            }
            if up.is_some_and(|up| up.kind() == "field_access" && up.child_by_field_name("field") == Some(node)) {
                return;
            }
            if node.kind() == "identifier" {
                if let Some(Binding::Field(_, declaring, _)) = context.resolver.binding(node, text) {
                    mark(context, node, &declaring.name, used);
                    return;
                }
            }
            if let Some(class) = context.resolver.class_name(node, text).filter(|class| context.resolver.index.has(class)) {
                mark(context, node, &class, used);
            }
        }
        "scoped_type_identifier" | "scoped_identifier" | "field_access" => {
            let last = children(node).into_iter().rev().find(|part| part.is_named() && !part.kind().ends_with("comment"));
            let Some(last) = last.filter(|last| names.contains(context.text(*last))) else { return };
            if node.kind() == "field_access" {
                if let Some((declaring, _)) = super::lookup::field_of(context, node) {
                    mark(context, node, &declaring.name, used);
                    return;
                }
            }
            let written: String = context.text(node).split_whitespace().collect();
            if let Some(class) = context.resolver.class_name(node, &written).filter(|class| context.resolver.index.has(class)) {
                mark(context, node, &class, used);
            }
        }
        _ => {}
    }
}

fn keyword(class: Node) -> usize {
    children(class).into_iter().find(|part| !part.is_named() && matches!(part.kind(), "class" | "interface" | "enum" | "record" | "@interface")).map_or(class.start_byte(), |word| word.start_byte())
}

pub fn unused_nested_class(context: &Context, root: Node) {
    let mut found = Vec::new();
    candidates(context, root, &mut found);
    if found.is_empty() {
        return;
    }
    let names = declared_names(context, &found);
    let mut used = HashSet::new();
    walk(root, |node| scan_use(context, node, &names, &mut used));
    for class in found {
        let Some(name) = context.resolver.scope.names.get(&class.id()) else { continue };
        if used.contains(name) {
            continue;
        }
        let fix = replace_including_comments(context, class, "");
        let sentence = super::fixes::sentence(&context.file.text, &[fix]);
        context.report_always("UnusedNestedClass", keyword(class), &format!("{MESSAGE}{sentence}"));
    }
}
