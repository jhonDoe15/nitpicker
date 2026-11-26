//! AssertSameIncompatible: `assertSame` and `isSameInstanceAs` on types that cannot be the same object.
use super::Context;
use super::call_match::static_on_class;
use super::argsel::{ASSERT_CLASSES, Invocation, argument_name, find_changes_with};
use super::argsel_heuristics::{creates_no_duplicate, not_named_by_comment};
use super::compat::{castable, pretty};
use super::consts::constant;
use super::fixes::Fix;
use super::hierarchy::has_annotation;
use crate::engine::source::ancestor;
use crate::java::types::expr::Call;
use crate::java::types::model::{Type, flag};
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use tree_sitter::Node;

const JUNIT: [&str; 3] = ["org.junit.Assert", "junit.framework.Assert", "junit.framework.TestCase"];

fn name_of<'f>(context: &'f Context, call: Node) -> &'f str {
    call.child_by_field_name("name").map_or("", |name| context.text(name))
}

pub fn assert_same_incompatible(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let name = name_of(context, call);
    let list = arguments(call);
    let (expected, actual, inverted) = if matches!(name, "assertSame" | "assertNotSame") && JUNIT.iter().any(|class| static_on_class(context, call, class, &[name])) {
        if list.len() < 2 {
            return;
        }
        (list[list.len() - 2], list[list.len() - 1], name == "assertNotSame")
    } else if matches!(name, "isSameInstanceAs" | "isNotSameInstanceAs") && truth_subject(context, call) {
        let Some(assert_that) = call.child_by_field_name("object").filter(|object| object.kind() == "method_invocation" && name_of(context, *object) == "assertThat") else { return };
        let inner = arguments(assert_that);
        if inner.len() != 1 || list.is_empty() {
            return;
        }
        (list[0], inner[0], name.contains("Not"))
    } else {
        return;
    };
    let (Some(actual_type), Some(expected_type)) = (context.resolver.type_of(actual), context.resolver.type_of(expected)) else { return };
    let (erased_actual, erased_expected) = (actual_type.erased(), expected_type.erased());
    if castable(context, &erased_actual, &erased_expected) || castable(context, &erased_expected, &erased_actual) {
        return;
    }
    let message = format!(
        "The types passed to this assertion are incompatible (this check will always {}): type `{}` is not compatible with `{}`",
        if inverted { "pass" } else { "fail" },
        pretty(&actual_type),
        pretty(&expected_type)
    );
    context.report_fixed("AssertSameIncompatible", call, preferred(context, call), &message, &[]);
}

fn truth_subject(context: &Context, call: Node) -> bool {
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    !resolved.method.is_static && receiver_class(context, call).is_some_and(|class| context.resolver.index.is_subtype(&class, "com.google.common.truth.Subject"))
}

const NAME: &str = "AssertEqualsArgumentOrderChecker";

fn enum_identifier(context: &Context, actual: Node) -> bool {
    matches!(actual.kind(), "identifier" | "field_access")
        && matches!(context.resolver.type_of(actual), Some(Type::Class(name, _)) if context.resolver.index.get(&name).is_some_and(|info| info.flags & flag::ENUM != 0))
}

/// `Matchers.ASSERT_METHOD` of the argument selection checks.
fn assert_call(context: &Context, node: Node, call: &Call) -> bool {
    if !call.method.is_static || !call.method.name.starts_with("assert") {
        return false;
    }
    let owner = if node.child_by_field_name("object").is_some() { call.receiver.erased().name() } else { call.declaring.clone() };
    if !ASSERT_CLASSES.contains(&owner.as_str()) {
        return false;
    }
    let formals: Vec<Type> = call.method.parameters.iter().map(Type::erased).collect();
    let shaped = match formals.len() {
        2 => formals[0] == formals[1],
        3 => formals[0] == Type::class("java.lang.String") && formals[1] == formals[2],
        _ => false,
    };
    let throwable = arguments(node).into_iter().any(|argument| matches!(context.resolver.type_of(argument), Some(kind @ Type::Class(..)) if context.resolver.index.is_subtype(&kind.name(), "java.lang.Throwable")));
    let template = ancestor(node, &["method_declaration"]).is_some_and(|method| has_annotation(context, method, "BeforeTemplate"));
    shaped && !throwable && !template
}

pub fn assert_equals_argument_order(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !node.child_by_field_name("name").is_some_and(|name| context.text(name).starts_with("assert")) {
        return;
    }
    let Some(call) = context.resolver.resolve_call(node) else { return };
    if !assert_call(context, node, &call) {
        return;
    }
    let list = arguments(node);
    let count = call.method.parameters.len();
    let names = &call.method.names;
    if names.len() > count || count <= 1 || list.len() < count || call.method.generic_parameters.len() < count {
        return;
    }
    let formal_names: Vec<String> = (0..count).map(|at| if names.len() == count { names[at].clone() } else { format!("arg{at}") }).collect();
    if formal_names.first().is_some_and(|first| first.starts_with("this$") && first.len() > 5 && first[5..].bytes().all(|digit| digit.is_ascii_digit())) {
        return;
    }
    let Some(comment_start) = node.child_by_field_name("name").map(|name| name.end_byte()) else { return };
    let formal_types = call.method.generic_parameters[..count].to_vec();
    let actuals = list[..count].to_vec();
    let inv = Invocation { node, call, formal_names, formal_types, arguments: list, actuals, comment_start, bound: None };
    let actual_names: Vec<String> = inv.actuals.iter().map(|argument| argument_name(context, *argument)).collect();
    let distance = |formal: usize, actual: usize| -> f64 {
        let (name, argument) = (&actual_names[actual], inv.actuals[actual]);
        let fixed = || constant(context, argument).is_some() || enum_identifier(context, argument);
        match inv.formal_names[formal].as_str() {
            "expected" if fixed() || name.starts_with("expected") => 0.0,
            "expected" => 1.0,
            "actual" if fixed() => 1.0,
            "actual" if name.starts_with("actual") => 0.0,
            "actual" => 1.0,
            _ if formal == actual => 0.0,
            _ => f64::INFINITY,
        }
    };
    let Some(changes) = find_changes_with(context, &inv, Some(&distance)) else { return };
    if changes.assigned.iter().sum::<f64>() >= changes.original.iter().sum::<f64>() {
        return;
    }
    if !creates_no_duplicate(context, &inv, &changes) || !not_named_by_comment(context, &inv, &changes) {
        return;
    }
    let mut commented = Fix::new();
    let mut permuted = Fix::new();
    for (formal, actual) in &changes.pairs {
        let target = inv.actuals[*formal];
        commented = commented.and(target.start_byte(), target.start_byte(), format!("/* {}= */", inv.formal_names[*formal]));
        permuted = permuted.and(target.start_byte(), target.end_byte(), context.text(inv.actuals[*actual]));
    }
    context.report_fixed(NAME, node, preferred(context, node), "Arguments are swapped in assertEquals-like call", &[permuted, commented]);
}
