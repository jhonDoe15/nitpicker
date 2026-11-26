//! ImplementAssertionWithChaining: a Truth subject tests and fails by hand where `check(...)` would do.
use super::Context;
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::lookup::field_of;
use super::method_call_checks::erased_subtype;
use super::odd_calls::receiver_class;
use super::shape::{arguments, parts, stripped};
use crate::java::types::model::{OBJECT, Type};
use tree_sitter::Node;

const NAME: &str = "ImplementAssertionWithChaining";
const MESSAGE: &str = "Prefer check(...), which usually generates more readable failure messages.";
const SUBJECT: &str = "com.google.common.truth.Subject";

fn on_subject(context: &Context, call: Node) -> bool {
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    !resolved.method.is_static && receiver_class(context, call).is_some_and(|class| context.resolver.index.is_subtype(&class, SUBJECT))
}

/// A single call of a `fail*` method of the subject, with the braces around it taken off.
fn is_call_to_fail(context: &Context, statement: Node) -> bool {
    let mut then = statement;
    while then.kind() == "block" {
        let inside = parts(then);
        if inside.len() != 1 {
            return false;
        }
        then = inside[0];
    }
    if then.kind() != "expression_statement" {
        return false;
    }
    let Some(call) = parts(then).first().copied().filter(|call| call.kind() == "method_invocation") else { return false };
    let named = call.child_by_field_name("name").is_some_and(|name| context.text(name).starts_with("fail"));
    call.child_by_field_name("object").is_none() && named && on_subject(context, call)
}

fn equals_like(context: &Context, call: Node) -> bool {
    if call.kind() != "method_invocation" {
        return false;
    }
    if static_on_class(context, call, "com.google.common.base.Objects", &["equal"]) || static_on_class(context, call, "java.util.Objects", &["equals"]) {
        return true;
    }
    let named = call.child_by_field_name("name").is_some_and(|name| context.text(name) == "equals");
    named && context.resolver.resolve_call(call).is_some_and(|resolved| {
        !resolved.method.is_static && matches!(resolved.method.parameters.as_slice(), [Type::Class(parameter, _)] if parameter == OBJECT)
    })
}

fn is_enum(context: &Context, expression: Node) -> bool {
    context.resolver.type_of(expression).is_some_and(|kind| erased_subtype(context, expression, &kind, "java.lang.Enum", 0))
}

fn is_primitive(context: &Context, expression: Node) -> bool {
    matches!(context.resolver.type_of(expression), Some(Type::Primitive(_)))
}

fn actual_and_expected<'t>(context: &Context, condition: Node<'t>) -> Option<(Node<'t>, Node<'t>)> {
    match condition.kind() {
        "unary_expression" if condition.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "!") => {
            let call = stripped(condition.child_by_field_name("operand")?);
            if !equals_like(context, call) {
                return None;
            }
            let args = arguments(call);
            if args.len() == 2 {
                return Some((args[0], args[1]));
            }
            Some((call.child_by_field_name("object")?, *args.first()?))
        }
        "binary_expression" if condition.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "!=") => {
            let (left, right) = (condition.child_by_field_name("left")?, condition.child_by_field_name("right")?);
            let both_primitives = is_primitive(context, left) && is_primitive(context, right);
            if !both_primitives && !(is_enum(context, left) && is_enum(context, right)) {
                return None;
            }
            Some((left, right))
        }
        _ => None,
    }
}

fn is_actual_method(context: &Context, expression: Node) -> bool {
    if expression.kind() != "method_invocation" || !arguments(expression).is_empty() {
        return false;
    }
    let named = expression.child_by_field_name("name").is_some_and(|name| matches!(context.text(name), "actual" | "getSubject"));
    named && on_subject(context, expression)
}

fn refers_to_field_named_actual(context: &Context, expression: Node) -> bool {
    field_of(context, expression).is_some_and(|(_, field)| field.name == "actual")
}

/// `makeCheckDescription`: the quoted chain of calls on the actual value, like `"foo().bar()"`.
fn check_description(context: &Context, actual: Node) -> Option<String> {
    if actual.kind() != "method_invocation" {
        return None;
    }
    let mut names: Vec<String> = Vec::new();
    let mut invocation = actual;
    loop {
        let expression = invocation.child_by_field_name("object")?;
        if !arguments(invocation).is_empty() {
            return None;
        }
        names.insert(0, format!("{}()", context.text(invocation.child_by_field_name("name")?)));
        if is_actual_method(context, expression) || refers_to_field_named_actual(context, expression) {
            return Some(format!("\"{}\"", names.join(".")));
        }
        if expression.kind() != "method_invocation" {
            return None;
        }
        invocation = expression;
    }
}

pub fn implement_assertion_with_chaining(context: &Context, node: Node) {
    if node.kind() != "if_statement" || node.child_by_field_name("alternative").is_some() {
        return;
    }
    let (Some(then), Some(condition)) = (node.child_by_field_name("consequence"), node.child_by_field_name("condition")) else { return };
    if !is_call_to_fail(context, then) {
        return;
    }
    let Some((actual, expected)) = actual_and_expected(context, stripped(condition)) else { return };
    let Some(description) = check_description(context, actual) else { return };
    let text = format!("check({description}).that({}).isEqualTo({});", context.text(actual), context.text(expected));
    let fix = Fix::replace(node.start_byte(), node.end_byte(), text);
    context.report_fixed(NAME, node, node.start_byte(), MESSAGE, &[fix]);
}
