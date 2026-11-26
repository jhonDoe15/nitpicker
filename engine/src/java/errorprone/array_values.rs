//! ArrayToString and ArrayHashCode: array values used where their contents were meant.
use super::Context;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::positions::{arguments, preferred};
use crate::java::types::model::Type;
use tree_sitter::Node;

const TO_STRING_MESSAGE: &str = "Calling toString on an array does not provide useful information";
const HASH_MESSAGE: &str = "hashcode method on array does not hash array contents";

fn array_of(context: &Context, node: Node) -> Option<Type> {
    context.resolver.type_of(node).filter(|kind| matches!(kind, Type::Array(_)))
}

fn nested(kind: &Type) -> bool {
    matches!(kind, Type::Array(element) if matches!(**element, Type::Array(_)))
}

fn exact_class(context: &Context, call: Node, name: &str) -> bool {
    context.resolver.resolve_call(call).is_some_and(|resolved| resolved.receiver.erased().name() == name)
}

/// Whether the call is `name` on a descendant of the class, with the single parameter type that is listed.
fn on(context: &Context, call: Node, owner: &str, names: &[&str], parameter: &str) -> bool {
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    names.contains(&name) && context.resolver.matches_sig(call, &format!("{owner}#{name}({parameter})"))
}

/// Whether a call of the expression `getStackTrace()` on a throwable.
fn stack_trace<'t>(context: &Context, expression: Node<'t>) -> Option<Node<'t>> {
    let object = expression.child_by_field_name("object").filter(|_| expression.kind() == "method_invocation")?;
    let named = expression.child_by_field_name("name").is_some_and(|name| context.text(name) == "getStackTrace");
    (named && context.resolver.matches_sig(expression, "java.lang.Throwable#getStackTrace()")).then_some(object)
}

fn to_string_fix(context: &Context, replaced: Node, stringified: Node, kind: &Type) -> Fix {
    let mut fix = Fix::new();
    if let Some(object) = stack_trace(context, stringified) {
        let name = qualify_type(context, replaced, "com.google.common.base.Throwables", &mut fix);
        return fix.and(replaced.start_byte(), replaced.end_byte(), format!("{name}.getStackTraceAsString({})", context.text(object)));
    }
    let name = qualify_type(context, replaced, "java.util.Arrays", &mut fix);
    let method = if nested(kind) { "deepToString" } else { "toString" };
    fix.and(replaced.start_byte(), replaced.end_byte(), format!("{name}.{method}({})", context.text(stringified)))
}

fn report_array(context: &Context, replaced: Node, stringified: Node, explicit: bool) {
    let Some(kind) = array_of(context, stringified) else { return };
    let fix = if explicit { to_string_fix(context, replaced, stringified, &kind) } else { to_string_fix(context, stringified, stringified, &kind) };
    context.report_fixed("ArrayToString", stringified, preferred(context, stringified), TO_STRING_MESSAGE, &[fix]);
}

fn print_string(context: &Context, call: Node) -> bool {
    on(context, call, "java.io.PrintStream", &["print", "println"], "java.lang.Object")
        || (on(context, call, "java.lang.StringBuilder", &["append"], "java.lang.Object") && exact_class(context, call, "java.lang.StringBuilder"))
}

fn string_format(context: &Context, call: Node) -> bool {
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    match name {
        "format" => context.resolver.matches_sig(call, "java.lang.String#format(_*)"),
        "formatted" => context.resolver.matches_sig(call, "java.lang.String#formatted(_*)") && exact_class(context, call, "java.lang.String"),
        _ => false,
    }
}

fn varargs_element(context: &Context, call: Node, argument: Node, list: &[Node]) -> bool {
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    if !resolved.method.varargs {
        return false;
    }
    let count = resolved.method.parameters.len();
    let index = list.iter().position(|part| part.id() == argument.id()).unwrap_or_default();
    if index + 1 < count {
        return false;
    }
    if list.len() > count {
        return true;
    }
    let formal = resolved.method.parameters.last().cloned();
    match (context.resolver.type_of(argument), formal) {
        (Some(kind @ Type::Array(_)), Some(formal)) => !context.resolver.assignable(&kind, &formal, true),
        _ => true,
    }
}

fn joiner(context: &Context, call: Node, list: &[Node]) {
    if !context.resolver.matches_sig(call, "com.google.common.base.Joiner#join(_*)") {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if resolved.method.varargs {
        for argument in list {
            let count = resolved.method.parameters.len();
            let last = list.len() == count && list.last().is_some_and(|part| part.id() == argument.id());
            match context.resolver.type_of(*argument) {
                Some(Type::Array(element)) if last => {
                    if matches!(*element, Type::Array(_)) {
                        report_array(context, *argument, *argument, false);
                    }
                }
                _ => report_array(context, *argument, *argument, false),
            }
        }
    } else if resolved.method.parameters.len() == 1 && resolved.method.parameters[0].name() == "java.lang.Iterable" {
        let Some(argument) = list.first() else { return };
        let element = context.resolver.type_of(*argument).and_then(|kind| context.resolver.index.arguments_as(&kind, "java.lang.Iterable")).and_then(|found| found.into_iter().next());
        if matches!(element, Some(Type::Array(_))) {
            report_array_value(context, *argument);
        }
    }
}

fn report_array_value(context: &Context, argument: Node) {
    context.report_fixed("ArrayToString", argument, preferred(context, argument), TO_STRING_MESSAGE, &[]);
}

pub fn array_to_string(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => array_to_string_call(context, node),
        "binary_expression" => {
            let plus = node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "+");
            if plus && matches!(context.resolver.type_of(node), Some(Type::Class(name, _)) if name == "java.lang.String") {
                for side in ["left", "right"].iter().filter_map(|field| node.child_by_field_name(field)) {
                    report_array(context, side, side, false);
                }
            }
        }
        "method_reference" => to_string_reference(context, node),
        "assignment_expression" => {
            let plus = node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "+=");
            let target = node.child_by_field_name("left").and_then(|left| context.resolver.type_of(left));
            if plus && matches!(target, Some(Type::Class(name, _)) if name == "java.lang.String") {
                if let Some(right) = node.child_by_field_name("right") {
                    report_array(context, right, right, false);
                }
            }
        }
        _ => {}
    }
}

fn to_string_reference(context: &Context, reference: Node) {
    let Some(name) = crate::engine::source::children(reference).last().map(|name| context.text(*name)) else { return };
    if !matches!(name, "toString" | "valueOf") {
        return;
    }
    let Some(expected) = context.resolver.expected(reference) else { return };
    let Type::Class(target, _) = &expected else { return };
    let index = context.resolver.index;
    let Some((declaring, function)) = index.functional_method(target) else { return };
    let map = index.member_map(&expected, &declaring.name);
    let taken: Vec<Type> = function.generic_parameters.iter().map(|kind| kind.substitute(&map)).collect();
    let Some(first @ Type::Array(_)) = taken.first().cloned() else { return };
    let Some((_, owner, method, _)) = context.resolver.reference_method(reference, &taken) else { return };
    let listed = (name == "toString" && method.parameters.is_empty())
        || (name == "valueOf" && owner.name == "java.lang.String" && method.parameters.len() == 1 && method.parameters[0].name() == "java.lang.Object");
    if !listed {
        return;
    }
    let mut fix = Fix::new();
    let class = qualify_type(context, reference, "java.util.Arrays", &mut fix);
    let method = if nested(&first) { "deepToString" } else { "toString" };
    let fix = fix.and(reference.start_byte(), reference.end_byte(), format!("{class}::{method}"));
    context.report_fixed("ArrayToString", reference, reference.start_byte(), TO_STRING_MESSAGE, &[fix]);
}

fn array_to_string_call(context: &Context, call: Node) {
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return };
    let list = arguments(call);
    if matches!(name, "print" | "println" | "append") && print_string(context, call) {
        for argument in &list {
            report_array(context, *argument, *argument, false);
        }
    }
    if name == "valueOf" && context.resolver.matches_sig(call, "java.lang.String#valueOf(java.lang.Object)") {
        for argument in &list {
            report_array(context, call, *argument, true);
        }
    }
    if name == "toString" && list.is_empty() {
        if let Some(object) = call.child_by_field_name("object").filter(|object| object.kind() != "super") {
            report_array(context, call, object, true);
        }
    }
    if matches!(name, "format" | "formatted") && string_format(context, call) {
        for argument in &list {
            if varargs_element(context, call, *argument, &list) {
                report_array(context, *argument, *argument, false);
            }
        }
    }
    if name == "join" {
        joiner(context, call, &list);
    }
}

fn hash_call_kind(context: &Context, call: Node) -> Option<&'static str> {
    let name = call.child_by_field_name("name").map(|name| context.text(name))?;
    match name {
        "hashCode" if context.resolver.matches_sig(call, "java.util.Objects#hashCode(_*)") => Some("jdk7"),
        "hashCode" if context.resolver.matches_sig(call, "com.google.common.base.Objects#hashCode(_*)") => Some("varargs"),
        "hash" if context.resolver.matches_sig(call, "java.util.Objects#hash(_*)") => Some("varargs"),
        "hashCode" => Some("instance"),
        _ => None,
    }
}

fn rewrite(context: &Context, argument: Node) -> Option<String> {
    let kind = array_of(context, argument)?;
    let method = if nested(&kind) { "deepHashCode" } else { "hashCode" };
    Some(format!("Arrays.{method}({})", context.text(argument)))
}

pub fn array_hash_code(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(kind) = hash_call_kind(context, call) else { return };
    let list = arguments(call);
    let mut fix = Fix::new();
    match kind {
        "jdk7" => {
            if let Some(text) = list.first().and_then(|first| rewrite(context, *first)) {
                fix = fix.and(call.start_byte(), call.end_byte(), text);
            }
        }
        "instance" => {
            let object = call.child_by_field_name("object").filter(|object| object.kind() != "super");
            if let (true, Some(text)) = (list.is_empty(), object.and_then(|object| rewrite(context, object))) {
                fix = fix.and(call.start_byte(), call.end_byte(), text);
            }
        }
        _ => {
            if !list.iter().any(|argument| array_of(context, *argument).is_some()) {
                return;
            }
            if let [only] = list.as_slice() {
                let element = match array_of(context, *only) {
                    Some(Type::Array(element)) => *element,
                    _ => return,
                };
                if matches!(element, Type::Primitive(_) | Type::Array(_)) {
                    fix = fix.and(call.start_byte(), call.end_byte(), rewrite(context, *only).unwrap_or_default());
                }
            } else {
                for argument in &list {
                    if let Some(text) = rewrite(context, *argument) {
                        fix = fix.and(argument.start_byte(), argument.end_byte(), text);
                    }
                }
            }
        }
    }
    if fix == Fix::new() {
        return;
    }
    context.report_fixed("ArrayHashCode", call, preferred(context, call), HASH_MESSAGE, &[fix.with_imports()]);
}

