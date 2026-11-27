//! Calls of test and precondition helpers that cannot do what they are for, of DumbMethods, measured on test code;
//! a constant is a string constant or a class literal, also through a local holding one:
//! - DMI_DOH: Guava's `Preconditions.checkNotNull` with a constant to check (unless exactly one other argument
//!   follows and it is not constant), `assertNotNull(Object)` of a constant, `assertNotNull(String, Object)` with
//!   both constant, written against `org.junit.Assert` or `junit.framework.Assert` (not a subclass such as
//!   `TestCase`); priority 2, placed on the called method.
//! - DMI_ARGUMENTS_WRONG_ORDER: `checkNotNull(constant, value)` and `assertNotNull(value, constant)`; priority 2,
//!   placed where the value comes from.
//! - DMI_VACUOUS_CALL_TO_EASYMOCK_METHOD: `EasyMock.verify`, `replay`, `reset`, `resetToDefault`, `resetToNice` or
//!   `resetToStrict` given no mocks, or `new Object[0]` written in the call; priority 2, once per method and call.
//!
//! Every call is reported, also twice in one method.
use super::super::super::idioms::called;
use super::super::super::Context;
use super::super::found::{Found, Findings};
use super::super::numbers::source::{called_place, placed, source};
use super::super::numbers::values::{local_value, primitive, whole};
use super::randoms::{arguments, call_line};
use crate::engine::source::{children, named_children};
use crate::java::types::expr::{Receiver, unwrap};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_types;
use tree_sitter::Node;

pub const DOH: &str = "DMI_DOH";
pub const WRONG_ORDER: &str = "DMI_ARGUMENTS_WRONG_ORDER";
pub const EASYMOCK: &str = "DMI_VACUOUS_CALL_TO_EASYMOCK_METHOD";
pub const PATTERNS: &[&str] = &[DOH, WRONG_ORDER, EASYMOCK];

const ASSERTS: &[&str] = &["org.junit.Assert", "junit.framework.Assert"];
const PRECONDITIONS: &str = "com.google.common.base.Preconditions";
const EASYMOCK_CLASS: &str = "org.easymock.EasyMock";
const MOCK_CALLS: &[&str] = &["verify", "replay", "reset", "resetToDefault", "resetToNice", "resetToStrict"];

fn constant(context: &Context, node: Node, depth: usize) -> bool {
    let node = unwrap(node);
    if context.resolver.constant_string(node).is_some() || node.kind() == "class_literal" {
        return true;
    }
    depth < 4 && local_value(context, node).is_some_and(|value| constant(context, value, depth + 1))
}

/// The class a static call names in the class file: the written qualifier, the class around the call that
/// inherits the method, or the class a static import names.
fn written_class(context: &Context, node: Node, declaring: &str) -> Option<String> {
    if let Some(object) = node.child_by_field_name("object") {
        return match context.resolver.receiver(object)? {
            Receiver::Static(class) => Some(class),
            Receiver::Value(Type::Class(class, _)) => Some(class),
            Receiver::Value(_) => None,
        };
    }
    let around = enclosing_types(context.resolver.scope, node);
    let inherits = around.into_iter().find(|class| context.resolver.index.is_subtype(class, declaring));
    Some(inherits.unwrap_or_else(|| declaring.to_string()))
}

/// Where SpotBugs says a value passed as an argument comes from, a boxed primitive being the boxing call.
fn value_place(context: &Context, node: Node, label: &str) -> String {
    if let Some(kind) = primitive(context, node).filter(|_| !matches!(context.resolver.type_of(node), Some(Type::Class(..)))) {
        let boxed = match kind {
            "int" => "Integer".to_string(),
            "char" => "Character".to_string(),
            other => format!("{}{}", other[..1].to_uppercase(), &other[1..]),
        };
        return called_place(context, node, &format!("{boxed}.valueOf({kind})"));
    }
    placed(context, node, label, &source(context, node, 0))
}

/// `name(A, B)` of `pkg.Class.name(A, B)`.
fn name_and_signature(full: &str) -> &str {
    let open = full.find('(').unwrap_or(full.len());
    &full[full[..open].rfind('.').map_or(0, |dot| dot + 1)..]
}

fn empty_array(context: &Context, node: Node) -> bool {
    let node = unwrap(node);
    if node.kind() != "array_creation_expression" {
        return false;
    }
    if let Some(values) = node.child_by_field_name("value") {
        return named_children(values).into_iter().all(|part| part.kind().ends_with("comment"));
    }
    let sizes: Vec<Node> = children(node).into_iter().filter(|part| part.kind() == "dimensions_expr").collect();
    matches!(sizes[..], [size] if size.named_child(0).is_some_and(|size| whole(context, size) == Some(0)))
}

pub fn check<'a>(context: &Context<'a>, node: Node<'a>, label: &str, found: &mut Findings<'a>) {
    if node.kind() != "method_invocation" || !context.wants(PATTERNS) {
        return;
    }
    let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
    if !matches!(name, "checkNotNull" | "assertNotNull") && !MOCK_CALLS.contains(&name) {
        return;
    }
    let Some(call) = context.resolver.resolve_call(node).filter(|call| call.method.is_static) else { return };
    let Some(class) = written_class(context, node, &call.declaring) else { return };
    let listed = arguments(node);
    let line = call_line(context, node);
    let full = called(context, &class, name, &call.method.parameters);
    let short = name_and_signature(&full).to_string();
    let doh = || {
        let message = format!("D'oh! A nonsensical invocation of {short} in {label}");
        context.report_listed(DOH, node, line, message, called_place(context, node, &full), 2, vec![short.clone(), label.to_string()]);
    };
    let wrong = |value: Node| {
        let message = format!("Arguments in wrong order for invocation of {name} in {label}");
        context.report_listed(WRONG_ORDER, node, line, message, value_place(context, value, label), 2, vec![name.to_string(), label.to_string()]);
    };
    match (class.as_str(), name, &listed[..]) {
        (PRECONDITIONS, "checkNotNull", [first, rest @ ..]) if constant(context, *first, 0) => match rest {
            [second] if !constant(context, *second, 0) => wrong(*second),
            _ => doh(),
        },
        (owner, "assertNotNull", [only]) if ASSERTS.contains(&owner) && constant(context, *only, 0) => doh(),
        (owner, "assertNotNull", [first, second]) if ASSERTS.contains(&owner) && constant(context, *second, 0) => {
            if constant(context, *first, 0) { doh() } else { wrong(*first) }
        }
        (EASYMOCK_CLASS, _, mocks) if MOCK_CALLS.contains(&name) && (mocks.is_empty() || matches!(mocks, [only] if empty_array(context, *only))) => {
            let message = format!("Useless/vacuous call to {full} in {label}");
            let place = Some(called_place(context, node, &full));
            found.add(Found { pattern: EASYMOCK, node, line, priority: 2, message, place, arguments: vec![full.clone(), label.to_string()] });
        }
        _ => {}
    }
}
