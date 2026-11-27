//! When SpotBugs loses a lock it holds by a field of a value that changes each time round a loop. Measured on
//! SpotBugs 4.9.8: a `lock()` on `v.f`, where `v` comes from a value carried from one round of an enclosing loop to
//! the next (the index of an array, a local the loop assigns, the hidden index of a for-each over an array), is not
//! released by an `unlock()` on `v.f` reached through the head of another loop inside that one. A for-each over an
//! `Iterable`, a constant index, a field, a parameter or a call with fixed arguments gives the same value each round.
use super::super::Context;
use crate::engine::source::{parent, walk};
use crate::java::flow::cfg::unwrap;
use crate::java::types::expr::Binding;
use crate::java::types::model::Type;
use tree_sitter::Node;

const LOOPS: &[&str] = &["for_statement", "enhanced_for_statement", "while_statement", "do_statement"];
const BOUNDS: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "lambda_expression", "class_body"];

/// Whether an `unlock()` at `close` misses the lock that `lock()` at `open` took.
pub fn parted(context: &Context, open: Node, close: Node) -> bool {
    let Some(base) = field_base(open) else { return false };
    let mut current = parent(open);
    while let Some(at) = current {
        if BOUNDS.contains(&at.kind()) {
            return false;
        }
        if LOOPS.contains(&at.kind()) && repeats(context, at) && varies(context, base, at, 0) && crossed(context, at, open, close) {
            return true;
        }
        current = parent(at);
    }
    false
}

/// The value whose field the call is made on: `v` of `v.f.lock()`.
fn field_base(call: Node) -> Option<Node> {
    let object = unwrap(call.child_by_field_name("object")?);
    if object.kind() != "field_access" {
        return None;
    }
    let base = unwrap(object.child_by_field_name("object")?);
    (!matches!(base.kind(), "this" | "super")).then_some(base)
}

/// Whether a loop inside `outer`, in the same body, starts after `open` and lies on a way from it to `close`.
fn crossed(context: &Context, outer: Node, open: Node, close: Node) -> bool {
    let mut found = false;
    walk(outer, |node| {
        let inside = node.id() != outer.id() && LOOPS.contains(&node.kind()) && same_body(node, outer);
        if !found && inside && node.start_byte() >= open.end_byte() {
            found = leads(context, node, close);
        }
    });
    found
}

/// Whether the code goes on from a loop to `close`: `close` is in it, or follows it in the same sequence of
/// statements with only statements that can end normally on the way.
fn leads(context: &Context, inner: Node, close: Node) -> bool {
    if within(close, Some(inner)) {
        return true;
    }
    if close.start_byte() < inner.end_byte() {
        return false;
    }
    let completes = |node: Node| crate::java::spotbugs::methods::notify::ends::completes(context, node);
    let mut current = inner;
    while let Some(above) = parent(current) {
        if within(close, Some(above)) {
            return match above.kind() {
                "if_statement" | "switch_block" | "block" | "switch_block_statement_group" | "constructor_body" => {
                    sequence_to(&completes, above, current, close)
                }
                _ => true,
            };
        }
        if matches!(above.kind(), "block" | "switch_block_statement_group" | "constructor_body") && !sequence_to(&completes, above, current, close) {
            return false;
        }
        current = above;
    }
    false
}

/// Whether every statement of `sequence` after `from`, up to the one holding `close`, can end normally.
fn sequence_to(completes: &dyn Fn(Node) -> bool, sequence: Node, from: Node, close: Node) -> bool {
    if sequence.kind() == "if_statement" {
        return false;
    }
    let mut cursor = sequence.walk();
    let parts: Vec<Node> = sequence.named_children(&mut cursor).collect();
    let after = parts.iter().filter(|part| part.start_byte() >= from.end_byte());
    for part in after {
        if within(close, Some(*part)) {
            return true;
        }
        if part.kind() != "switch_label" && !completes(*part) {
            return false;
        }
    }
    sequence.kind() != "switch_block"
}

/// Whether no lambda or class lies between a node and a statement around it.
fn same_body(node: Node, around: Node) -> bool {
    let mut current = parent(node);
    while let Some(at) = current {
        if at.id() == around.id() {
            return true;
        }
        if matches!(at.kind(), "lambda_expression" | "class_body") {
            return false;
        }
        current = parent(at);
    }
    false
}

/// Whether a loop can go round again: its body can end normally or a `continue` takes it back to its head.
fn repeats(context: &Context, outer: Node) -> bool {
    let Some(inner) = body(outer) else { return false };
    if crate::java::spotbugs::methods::notify::ends::completes(context, inner) {
        return true;
    }
    let mut found = false;
    walk(inner, |node| {
        if node.kind() != "continue_statement" || !same_body(node, outer) {
            return;
        }
        let label = node.named_child(0).filter(|label| label.kind() == "identifier").map(|label| context.text(label));
        let mut current = parent(node);
        while let Some(at) = current {
            let named = at.kind() == "labeled_statement" && at.named_child(0).is_some_and(|name| Some(context.text(name)) == label);
            if named || (label.is_none() && LOOPS.contains(&at.kind())) {
                found |= at.id() == outer.id() || named && at.named_child(1).is_some_and(|looped| looped.id() == outer.id());
                break;
            }
            current = parent(at);
        }
    });
    found
}

/// Whether a value can differ between two rounds of `outer`.
fn varies(context: &Context, value: Node, outer: Node, depth: usize) -> bool {
    if depth > 8 {
        return false;
    }
    let mut found = false;
    walk(value, |node| {
        if found || node.kind() != "identifier" || !local(context, node) {
            return;
        }
        let name = context.text(node);
        found = match declaration(context, node, name) {
            Some(declared) if within(declared, body(outer)) => assigned(context, outer, name).into_iter().any(|value| varies(context, value, outer, depth + 1)),
            Some(declared) if each_over_array(context, declared, outer) => true,
            _ => !assigned(context, outer, name).is_empty() || updated(context, outer, name),
        };
    });
    found
}

fn local(context: &Context, node: Node) -> bool {
    let named = parent(node).is_none_or(|above| !(above.kind() == "field_access" && above.child_by_field_name("field").is_some_and(|field| field.id() == node.id())));
    named && matches!(context.resolver.binding(node, context.text(node)), Some(Binding::Local(_)))
}

fn body(outer: Node) -> Option<Node> {
    outer.child_by_field_name("body")
}

fn within(node: Node, around: Option<Node>) -> bool {
    around.is_some_and(|around| node.start_byte() >= around.start_byte() && node.end_byte() <= around.end_byte())
}

/// The for-each variable of `outer` when it walks an array, whose hidden index changes each round.
fn each_over_array(context: &Context, declared: Node, outer: Node) -> bool {
    let named = outer.kind() == "enhanced_for_statement" && outer.child_by_field_name("name").is_some_and(|name| name.id() == declared.id());
    named && outer.child_by_field_name("value").and_then(|walked| context.resolver.type_of(walked)).is_some_and(|kind| matches!(kind, Type::Array(..)))
}

/// The name node that declares a local seen at `usage`: the nearest such declaration before it in a scope around it.
fn declaration<'t>(context: &Context, usage: Node<'t>, name: &str) -> Option<Node<'t>> {
    let mut top = usage;
    while let Some(above) = parent(top) {
        top = above;
        if BOUNDS.contains(&above.kind()) {
            break;
        }
    }
    let mut best: Option<Node<'t>> = None;
    walk(top, |node| {
        let named = match node.kind() {
            "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "enhanced_for_statement" => node.child_by_field_name("name"),
            _ => None,
        };
        let Some(named) = named.filter(|named| context.text(*named) == name && named.start_byte() <= usage.start_byte()) else { return };
        let scope = if node.kind() == "variable_declarator" { parent(node).and_then(parent) } else { Some(node) };
        let reaches = scope.is_some_and(|scope| within(usage, Some(scope)) || node.kind() == "formal_parameter");
        if reaches && best.is_none_or(|known| known.start_byte() < named.start_byte()) {
            best = Some(named);
        }
    });
    best
}

/// The values `outer` gives a local, its declaration's included.
fn assigned<'t>(context: &Context, outer: Node<'t>, name: &str) -> Vec<Node<'t>> {
    let mut values = Vec::new();
    walk(outer, |node| {
        let (target, value) = match node.kind() {
            "variable_declarator" => (node.child_by_field_name("name"), node.child_by_field_name("value")),
            "assignment_expression" => (node.child_by_field_name("left").map(unwrap), node.child_by_field_name("right")),
            _ => return,
        };
        if let (Some(target), Some(value)) = (target, value)
            && target.kind() == "identifier"
            && context.text(target) == name
        {
            values.push(value);
        }
    });
    values
}

/// Whether `outer` changes a local with `++` or `--`.
fn updated(context: &Context, outer: Node, name: &str) -> bool {
    let mut found = false;
    walk(outer, |node| {
        let target = (node.kind() == "update_expression").then(|| node.named_child(0)).flatten().map(unwrap);
        found |= target.is_some_and(|target| target.kind() == "identifier" && context.text(target) == name);
    });
    found
}
