//! Reading patterns of DumbMethods, measured on test code:
//! - NP_IMMEDIATE_DEREFERENCE_OF_READLINE: a `readLine()` returning `String` (of any class) whose result is at once
//!   the receiver of a call javac writes against `String` with no arguments (`trim()`, `length()`, `hashCode()`, not
//!   `getClass()`, which is written against `Object`, nor a call that first loads an argument); priority 2, once per
//!   method.
//! - DMI_CALLING_NEXT_FROM_HASNEXT: an instance `hasNext()` returning `boolean` that calls `next()` on `this`, where
//!   that `next()` returns `Object` after erasure (not a covariant `String next()`); priority 2, once per method,
//!   placed on the class's `next()`.
use super::super::super::idioms::Compiled;
use super::super::super::{Context, names, place};
use super::super::found::{Found, Findings};
use super::randoms::{arguments, call_line};
use crate::java::types::expr::unwrap;
use tree_sitter::Node;

pub const READLINE: &str = "NP_IMMEDIATE_DEREFERENCE_OF_READLINE";
pub const HASNEXT: &str = "DMI_CALLING_NEXT_FROM_HASNEXT";
pub const PATTERNS: &[&str] = &[READLINE, HASNEXT];

fn named<'a>(context: &'a Context, node: Node) -> &'a str {
    node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

fn read_line(context: &Context, node: Node) -> bool {
    let mut node = unwrap(node);
    while node.kind() == "cast_expression" {
        let Some(value) = node.child_by_field_name("value") else { return false };
        node = unwrap(value);
    }
    if node.kind() != "method_invocation" || named(context, node) != "readLine" || !arguments(node).is_empty() {
        return false;
    }
    context.resolver.resolve_call(node).is_some_and(|call| !call.method.is_static && call.method.returns.name() == "java.lang.String")
}

pub fn check<'a>(context: &Context<'a>, own: &str, method: &Compiled<'a>, node: Node<'a>, found: &mut Findings<'a>) {
    if node.kind() != "method_invocation" || !context.wants(PATTERNS) || !arguments(node).is_empty() {
        return;
    }
    let label = &method.label;
    if node.child_by_field_name("object").is_some_and(|object| read_line(context, object)) {
        let on_string = context.resolver.resolve_call(node).is_some_and(|call| call.declaring == "java.lang.String");
        if on_string {
            let message = format!("Immediate dereference of the result of readLine() in {label}");
            found.add(Found { pattern: READLINE, node, line: call_line(context, node), priority: 2, message, place: None, arguments: vec![label.clone()] });
        }
        return;
    }
    if named(context, node) != "next" || !calls_on_this(context, own, node) || !has_next(context, method) {
        return;
    }
    let returns_object = context.resolver.resolve_call(node).is_some_and(|call| !call.method.is_static && call.method.returns.erased().name() == "java.lang.Object");
    if returns_object {
        let message = format!("{label} invokes next()");
        let place = Some(place::function(&format!("{}.next()", names::binary(context, own))));
        found.add(Found { pattern: HASNEXT, node, line: call_line(context, node), priority: 2, message, place, arguments: vec![label.clone(), "next()".to_string()] });
    }
}

/// Whether a call is on `this`: `this`, `Own.this` naming the class itself, or no receiver for a method the class
/// has (not one of a class around it).
fn calls_on_this(context: &Context, own: &str, node: Node) -> bool {
    match node.child_by_field_name("object") {
        None => context.resolver.resolve_call(node).is_some_and(|call| call.declaring == own || context.resolver.index.is_subtype(own, &call.declaring)),
        Some(object) if object.kind() == "this" => true,
        Some(object) => {
            let qualified = object.kind() == "field_access" && object.child_by_field_name("field").is_some_and(|field| field.kind() == "this");
            let simple = own.rsplit('.').next().unwrap_or(own);
            qualified && object.child_by_field_name("object").is_some_and(|class| context.text(class).rsplit('.').next() == Some(simple))
        }
    }
}

fn has_next(context: &Context, method: &Compiled) -> bool {
    let member = method.member;
    if method.lambda || member.kind() != "method_declaration" || crate::java::helpers::has_modifier(member, "static") {
        return false;
    }
    let named_has_next = member.child_by_field_name("name").is_some_and(|name| context.text(name) == "hasNext");
    let no_parameters = member.child_by_field_name("parameters").is_some_and(|list| crate::engine::source::named_children(list).is_empty());
    let boolean = member.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "boolean");
    named_has_next && no_parameters && boolean
}
