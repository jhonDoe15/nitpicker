//! SelfAssertion: Truth or JUnit assertions given the same expression twice.
use super::already_pure::Constants;
use super::call_match::static_on_class;
use super::owners::{is_descendant, receiver_name};
use super::parts::{arguments, preferred};
use super::symbol_key::same_symbol;
use super::Context;
use crate::java::types::model::Type;
use tree_sitter::Node;

const TRUTH_EQUAL: [&str; 5] = ["isEqualTo", "isSameInstanceAs", "containsExactlyElementsIn", "containsAtLeastElementsIn", "areEqualTo"];
const TRUTH_NOT_EQUAL: [&str; 2] = ["isNotEqualTo", "isNotSameInstanceAs"];
const JUNIT: [&str; 3] = ["org.junit.Assert", "junit.framework.Assert", "junit.framework.TestCase"];

fn name_of<'f>(context: &'f Context, call: Node) -> &'f str {
    call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

fn instance_named(context: &Context, call: Node, names: &[&str]) -> bool {
    names.contains(&name_of(context, call)) && context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static)
}

fn junit_named(context: &Context, call: Node, names: &[&str]) -> bool {
    JUNIT.iter().any(|owner| static_on_class(context, call, owner, names))
}

fn assert_that(context: &Context, call: Node) -> bool {
    if call.kind() != "method_invocation" {
        return false;
    }
    match name_of(context, call) {
        "assertThat" => context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.is_static),
        "that" => receiver_name(context, call, false).is_some_and(|owner| is_descendant(context, &owner, &["com.google.common.truth.TestVerb", "com.google.common.truth.StandardSubjectBuilder"])),
        _ => false,
    }
}

fn same_expression(context: &Context, first: Node, second: Node) -> bool {
    if same_symbol(context, first, second) {
        return true;
    }
    let constants = Constants::new(context);
    constants.expression(first).is_some_and(|left| constants.expression(second).is_some_and(|right| left.key == right.key))
}

fn truth_same_arguments(context: &Context, call: Node, args: &[Node]) -> bool {
    let Some(receiver) = call.child_by_field_name("object") else { return false };
    if !assert_that(context, receiver) {
        return false;
    }
    let inner = arguments(receiver);
    let ([inner], [outer]) = (inner.as_slice(), args) else { return false };
    same_expression(context, *inner, *outer)
}

fn junit_same_arguments(context: &Context, args: &[Node]) -> bool {
    let string_first = args.len() > 2 && matches!(context.resolver.type_of(args[0]), Some(Type::Class(name, _)) if name == "java.lang.String");
    let (expected, actual) = if string_first { (1, 2) } else { (0, 1) };
    match (args.get(expected), args.get(actual)) {
        (Some(expected), Some(actual)) => same_expression(context, *expected, *actual),
        _ => false,
    }
}

pub fn self_assertion(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let args = arguments(node);
    if args.is_empty() {
        return;
    }
    let name = name_of(context, node);
    let outcome = if (instance_named(context, node, &TRUTH_EQUAL) && truth_same_arguments(context, node, &args))
        || (junit_named(context, node, &["assertEquals", "assertArrayEquals"]) && junit_same_arguments(context, &args))
    {
        "passes"
    } else if (instance_named(context, node, &TRUTH_NOT_EQUAL) && truth_same_arguments(context, node, &args))
        || (junit_named(context, node, &["assertNotEquals"]) && junit_same_arguments(context, &args))
    {
        "fails"
    } else {
        return;
    };
    let message = format!(
        "You are passing identical arguments to the {name} method, so this assertion always {outcome}. THIS IS LIKELY A BUG! If you are trying to test the correctness of an equals() implementation, use EqualsTester instead."
    );
    context.report_fixed("SelfAssertion", node, preferred(node), &message, &[]);
}
