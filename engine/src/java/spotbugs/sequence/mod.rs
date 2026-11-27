//! Patterns that follow the code of one compiled method in the order it runs: DMI_RANDOM_USED_ONLY_ONCE (of
//! DumbMethods) and IC_SUPERCLASS_USES_SUBCLASS_DURING_INITIALIZATION (of FindPuzzlers, see `initialization`).
//! Measured for DMI_RANDOM_USED_ONLY_ONCE: once a method has run `new java.util.Random(...)` or
//! `new java.security.SecureRandom(...)` (the constructor itself, not a subclass), every later call that javac writes
//! against one of those two classes is reported, whatever object it is made on, until the method runs any other
//! constructor or a `super.` call (another `invokespecial`); methods of `Object` and the stream methods `ints`,
//! `longs` and `doubles` do not count. One finding per method and called method, at its first call
//! in code order, priority 1. The SARIF place is the called method.
mod initialization;

use super::idioms::{Compiled, called, compiled};
use super::{Context, names};
use crate::engine::source::{ancestor, children, parent};
use crate::java::types::model::Type;
use crate::java::types::scope::{TYPE_DECLARATIONS, enclosing_types};
use std::collections::HashSet;
use tree_sitter::Node;

pub const RANDOM_ONCE: &str = "DMI_RANDOM_USED_ONLY_ONCE";
pub use initialization::PATTERN as SUBCLASS_IN_INIT;

const GENERATORS: &[&str] = &["java.util.Random", "java.security.SecureRandom"];
const SKIPPED: &[&str] = &["toString", "hashCode", "equals", "getClass", "wait", "notify", "notifyAll", "clone", "finalize", "ints", "longs", "doubles"];

/// Where a node's instruction runs in its method: after its operands, and a `for` loop's update after its body.
pub fn runs_at(node: Node) -> (usize, usize) {
    let mut current = node;
    while let Some(above) = parent(current) {
        let mut cursor = above.walk();
        let update = above.kind() == "for_statement" && above.children_by_field_name("update", &mut cursor).any(|update| update.id() == current.id());
        if update {
            let body = above.child_by_field_name("body").map_or(above.end_byte(), |body| body.end_byte());
            return (body, node.end_byte());
        }
        if matches!(above.kind(), "lambda_expression" | "class_body" | "method_declaration" | "constructor_declaration") {
            break;
        }
        current = above;
    }
    (node.end_byte(), 0)
}

/// The member of a class body that holds a node: javac runs `super(...)` or `this(...)`, then field initializers,
/// then the rest of a constructor's code.
fn member_of(node: Node) -> Option<Node> {
    let mut current = node;
    loop {
        let above = parent(current)?;
        if matches!(above.kind(), "class_body" | "enum_body" | "enum_body_declarations" | "interface_body") {
            return Some(current);
        }
        current = above;
    }
}

fn creates_generator(context: &Context, node: Node) -> bool {
    if node.kind() != "object_creation_expression" || children(node).iter().any(|part| part.kind() == "class_body") {
        return false;
    }
    let made = node.child_by_field_name("type").and_then(|written| context.resolver.type_node(written));
    made.is_some_and(|made| GENERATORS.contains(&made.erased().name().as_str()))
}

/// The class javac writes into a call: the declared type of the receiver, the class itself without one.
fn written_owner(context: &Context, call: Node) -> Option<String> {
    let object = call.child_by_field_name("object")?;
    if matches!(object.kind(), "this" | "super") {
        return None;
    }
    match context.resolver.type_of(object)?.erased() {
        Type::Class(class, _) => Some(class),
        _ => None,
    }
}

/// The generator class a receiver is known to be: what a `new` right there makes, through casts and parentheses.
fn made_here(context: &Context, object: Node) -> Option<String> {
    let mut current = object;
    while matches!(current.kind(), "parenthesized_expression" | "cast_expression") {
        current = if current.kind() == "cast_expression" { current.child_by_field_name("value")? } else { current.named_child(0)? };
    }
    if !creates_generator(context, current) {
        return None;
    }
    current.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)).map(|made| made.erased().name())
}

fn generator_call(context: &Context, node: Node) -> Option<String> {
    if node.kind() != "method_invocation" {
        return None;
    }
    let name = context.text(node.child_by_field_name("name")?);
    if SKIPPED.contains(&name) {
        return None;
    }
    let owner = written_owner(context, node).filter(|owner| GENERATORS.contains(&owner.as_str()))?;
    let call = context.resolver.resolve_call(node)?;
    let owner = node.child_by_field_name("object").and_then(|object| made_here(context, object)).unwrap_or(owner);
    (!call.method.is_static).then(|| called(context, &owner, name, &call.method.parameters))
}

fn random_once(context: &Context, methods: &[Compiled]) {
    for method in methods {
        if !method.nodes.iter().any(|node| creates_generator(context, *node)) {
            continue;
        }
        let mut parts: Vec<usize> = Vec::new();
        let mut events: Vec<((usize, (usize, usize)), Node)> = Vec::new();
        for node in &method.nodes {
            let root = member_of(*node).map_or(0, |root| root.id());
            let part = parts.iter().position(|seen| *seen == root).unwrap_or_else(|| {
                parts.push(root);
                parts.len() - 1
            });
            let first = node.kind() == "explicit_constructor_invocation" || ancestor(*node, &["explicit_constructor_invocation"]).is_some();
            let part = if first { 0 } else { part + 1 };
            if matches!(node.kind(), "object_creation_expression" | "method_invocation" | "explicit_constructor_invocation") {
                events.push(((part, runs_at(*node)), *node));
            }
        }
        events.sort_by_key(|(at, _)| *at);
        let events: Vec<&Node> = events.iter().map(|(_, node)| node).collect();
        let mut created = false;
        let mut seen = HashSet::new();
        for node in events {
            if creates_generator(context, *node) {
                created = true;
                continue;
            }
            let special = node.child_by_field_name("object").is_some_and(|object| object.kind() == "super");
            if matches!(node.kind(), "object_creation_expression" | "explicit_constructor_invocation") || special {
                created = false;
                continue;
            }
            let Some(target) = generator_call(context, *node).filter(|_| created) else { continue };
            if !seen.insert(target.clone()) {
                continue;
            }
            let line = node.child_by_field_name("arguments").map_or_else(|| context.line(*node), |arguments| context.line(arguments));
            let class = enclosing_types(context.resolver.scope, *node).into_iter().next();
            let shown = class.as_deref().map(|class| names::binary(context, class)).unwrap_or_default();
            let package = names::package_of(&shown).to_string();
            let message = format!("Random object created and used only once in {}", method.label);
            let place = format!("function:{target}|{package}@{shown}");
            context.report_listed(RANDOM_ONCE, *node, line, message, place, 1, vec![method.label.clone()]);
        }
    }
}

pub fn sequence<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(&[RANDOM_ONCE, SUBCLASS_IN_INIT]) {
        return;
    }
    let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"));
    if !(TYPE_DECLARATIONS.contains(&class.kind()) || body.is_some()) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let methods = compiled(context, &own, class);
    if context.wants(&[RANDOM_ONCE]) {
        random_once(context, &methods);
    }
    if context.wants(&[SUBCLASS_IN_INIT]) && TYPE_DECLARATIONS.contains(&class.kind()) {
        initialization::check(context, &own, &methods);
    }
}
