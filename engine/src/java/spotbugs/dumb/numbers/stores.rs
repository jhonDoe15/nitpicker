//! Which stores of a local variable reach a use, as SpotBugs tracks values in locals.
use super::super::super::Context;
use super::super::super::observed::{BODIES, always_before};
use super::values::operator;
use crate::engine::source::{ancestor, named_children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::Binding;
use tree_sitter::Node;

const DEPTH: usize = 6;

const LOOPS: &[&str] = &["while_statement", "do_statement", "for_statement", "enhanced_for_statement"];

fn loop_start(usage: Node, store: Node, body: Node) -> Option<usize> {
    let mut above = parent(usage);
    let mut start = None;
    while let Some(node) = above.filter(|node| node.id() != body.id()) {
        if LOOPS.contains(&node.kind()) && node.end_byte() >= store.end_byte() {
            start = Some(node.start_byte());
        }
        above = parent(node);
    }
    start
}

/// The stores a local variable gets before a use, from the last one that always runs, and those later in a loop
/// around the use: the declarator or assignment itself, so that a compound assignment keeps its operator.
pub fn stores<'t>(context: &Context, usage: Node<'t>, name: &str) -> Vec<Node<'t>> {
    let Some(body) = ancestor(usage, BODIES) else { return Vec::new() };
    let mut found: Vec<(usize, Node)> = Vec::new();
    walk(body, |node| {
        let writes = match node.kind() {
            "variable_declarator" => node.child_by_field_name("name").is_some_and(|declared| context.text(declared) == name) && node.child_by_field_name("value").is_some(),
            "assignment_expression" => node.child_by_field_name("left").is_some_and(|left| left.kind() == "identifier" && context.text(left) == name),
            "update_expression" => crate::engine::source::named_children(node).iter().any(|part| part.kind() == "identifier" && context.text(*part) == name),
            _ => false,
        };
        let at = if node.end_byte() <= usage.start_byte() { Some(node.start_byte()) } else { loop_start(usage, node, body) };
        if let Some(at) = at.filter(|_| writes) {
            found.push((at, node));
        }
    });
    found.sort_by_key(|(at, _)| *at);
    let found: Vec<Node> = found.into_iter().map(|(_, node)| node).collect();
    let first = found.iter().rposition(|store| store.end_byte() <= usage.start_byte() && always_before(*store, usage, body)).unwrap_or(0);
    found[first..].to_vec()
}

pub fn local(context: &Context, node: Node) -> bool {
    node.kind() == "identifier" && matches!(context.resolver.binding(node, context.text(node)), Some(Binding::Local(_)))
}

/// Whether every value a local holds at a use has a property; a store `x op= v` is judged as `x op v`.
pub fn held(context: &Context, node: Node, depth: usize, test: &dyn Fn(Node, usize) -> bool) -> bool {
    if depth > DEPTH || !local(context, node) {
        return false;
    }
    let held = stores(context, node, context.text(node));
    !held.is_empty() && held.iter().all(|store| match store.kind() {
        "variable_declarator" => store.child_by_field_name("value").is_some_and(|value| test(value, depth + 1)),
        "assignment_expression" if operator(context, *store) == "=" => store.child_by_field_name("right").is_some_and(|value| test(value, depth + 1)),
        _ => test(*store, depth + 1),
    })
}

/// Whether a field read in a constructor, an initializer or a field initializer was given a value by an initializer
/// that runs before it.
pub fn initialized(context: &Context, node: Node) -> bool {
    let Some((_, field)) = super::super::super::fields::field_key(context, node) else { return false };
    let mut at = parent(node);
    while let Some(around) = at {
        let class = parent(around).filter(|class| class.kind() == "class_body");
        let wanted = match around.kind() {
            "lambda_expression" | "method_declaration" | "class_body" => return false,
            "static_initializer" => Some(true),
            "constructor_declaration" => Some(false),
            "block" if class.is_some() => Some(false),
            "field_declaration" if class.is_some() => Some(has_modifier(around, "static")),
            _ => None,
        };
        if let (Some(statics), Some(class)) = (wanted, class) {
            let anywhere = around.kind() == "constructor_declaration";
            return declarators(class).into_iter().any(|(declaration, declarator)| {
                let named = declarator.child_by_field_name("name").is_some_and(|name| context.text(name) == field);
                let early = anywhere || declarator.end_byte() <= node.start_byte();
                named && early && declarator.child_by_field_name("value").is_some() && has_modifier(declaration, "static") == statics
            });
        }
        at = parent(around);
    }
    false
}

fn declarators<'t>(class: Node<'t>) -> Vec<(Node<'t>, Node<'t>)> {
    let fields = named_children(class).into_iter().filter(|member| member.kind() == "field_declaration");
    fields.flat_map(|field| named_children(field).into_iter().filter(|part| part.kind() == "variable_declarator").map(move |part| (field, part))).collect()
}
