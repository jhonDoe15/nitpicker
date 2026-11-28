//! LambdaFunctionalInterface: a private method takes `Function` of boxed numbers where a primitive specialisation exists.
use super::Context;
use super::array_calls::variable_bound;
use super::fixes::Fix;
use super::hierarchy::{declared_method, formals, overrides};
use super::method_call_checks::erased_subtype;
use super::naming::effectively_private;
use super::symbol_key::{declared_key, reference_key};
use crate::engine::source::{named_children, parent, walk};
use crate::java::types::model::Type;
use crate::java::types::scope::type_parameter;
use tree_sitter::Node;

const NAME: &str = "LambdaFunctionalInterface";
const MESSAGE: &str = "Use Java's utility functional interfaces instead of Function<A, B> for primitive types.";
const FUNCTION: &str = "java.util.function.Function";
const NUMBER: &str = "java.lang.Number";
const BOXES: [&str; 3] = ["java.lang.Double", "java.lang.Integer", "java.lang.Long"];

const METHOD_MAPPINGS: [(&str, &str); 15] = [
    ("Double,Double", "java.util.function.DoubleFunction<Double>"),
    ("Double,Integer", "java.util.function.DoubleToIntFunction"),
    ("Double,Long", "java.util.function.DoubleToLongFunction"),
    ("Double,T", "java.util.function.DoubleFunction<T>"),
    ("Integer,Integer", "java.util.function.IntFunction<Integer>"),
    ("Integer,Double", "java.util.function.IntToDoubleFunction"),
    ("Integer,Long", "java.util.function.IntToLongFunction"),
    ("Integer,T", "java.util.function.IntFunction<T>"),
    ("Long,Long", "java.util.function.LongFunction<Long>"),
    ("Long,Integer", "java.util.function.LongToIntFunction"),
    ("Long,Double", "java.util.function.LongToDoubleFunction"),
    ("Long,T", "java.util.function.LongFunction<T>"),
    ("T,Long", "java.util.function.ToLongFunction<T>"),
    ("T,Integer", "java.util.function.ToIntFunction<T>"),
    ("T,Double", "java.util.function.ToDoubleFunction<T>"),
];

const APPLY_MAPPINGS: [(&str, &str); 9] = [
    ("java.util.function.DoubleToIntFunction", "applyAsInt"),
    ("java.util.function.DoubleToLongFunction", "applyAsLong"),
    ("java.util.function.IntToDoubleFunction", "applyAsDouble"),
    ("java.util.function.IntToLongFunction", "applyAsLong"),
    ("java.util.function.LongToIntFunction", "applyAsInt"),
    ("java.util.function.LongToDoubleFunction", "applyAsDouble"),
    ("java.util.function.ToIntFunction<T>", "applyAsInt"),
    ("java.util.function.ToDoubleFunction<T>", "applyAsDouble"),
    ("java.util.function.ToLongFunction<T>", "applyAsLong"),
];

/// A type argument of a `Function` parameter as written.
enum Argument {
    Variable(String, Option<Type>),
    Known(Type),
    /// A wildcard, with its upper bound when it has one.
    Wildcard(Option<Type>),
    Other,
}

fn argument(context: &Context, node: Node) -> Argument {
    if node.kind() == "type_identifier" {
        let text = context.text(node);
        if type_parameter(context.file, node, text).is_some() {
            return Argument::Variable(text.to_string(), variable_bound(context, node, text));
        }
    }
    if node.kind() == "wildcard" {
        let lower = crate::engine::source::children(node).iter().any(|part| part.kind() == "super");
        let bound = named_children(node).into_iter().rev().find(|part| !part.kind().ends_with("comment")).and_then(|part| context.resolver.type_node(part));
        return Argument::Wildcard(if lower { None } else { bound });
    }
    match context.resolver.type_node(node) {
        Some(kind) if node.kind() != "annotated_type" => Argument::Known(kind),
        _ => Argument::Other,
    }
}

fn is_number(context: &Context, at: Node, kind: &Type) -> bool {
    match kind {
        Type::Bounded(true, _) => false,
        other => erased_subtype(context, at, other, NUMBER, 0),
    }
}

fn argument_is_number(context: &Context, at: Node, argument: &Argument) -> bool {
    match argument {
        Argument::Variable(_, Some(bound)) => is_number(context, at, bound),
        Argument::Variable(_, None) | Argument::Other => false,
        Argument::Known(kind) => is_number(context, at, kind),
        Argument::Wildcard(bound) => bound.as_ref().is_some_and(|kind| is_number(context, at, kind)),
    }
}

/// The type arguments of a parameter whose type is `Function<..>`, as written.
fn function_arguments<'t>(context: &Context, parameter: Node<'t>) -> Option<Vec<(Node<'t>, Argument)>> {
    let written = parameter.child_by_field_name("type")?;
    if parameter.kind() != "formal_parameter" || written.kind() != "generic_type" {
        return None;
    }
    let parts = named_children(written);
    let base = parts.first()?;
    if context.resolver.class_name(*base, context.text(*base)).as_deref() != Some(FUNCTION) {
        return None;
    }
    let arguments = parts.iter().find(|part| part.kind() == "type_arguments")?;
    Some(named_children(*arguments).into_iter().filter(|part| !part.kind().ends_with("comment")).map(|part| (part, argument(context, part))).collect())
}

fn is_function_of_numbers(context: &Context, parameter: Node) -> bool {
    function_arguments(context, parameter)
        .is_some_and(|arguments| arguments.len() == 2 && arguments.iter().any(|(node, found)| argument_is_number(context, *node, found)))
}

/// The key of the mapping table: the type arguments as `Type#toString` prints them, when they are boxes or a variable `T`.
fn mapping_key(arguments: &[(Node, Argument)]) -> Option<String> {
    let shown: Option<Vec<&str>> = arguments
        .iter()
        .map(|(_, found)| match found {
            Argument::Variable(name, _) if name == "T" => Some("T"),
            Argument::Known(Type::Class(name, shown)) if shown.is_empty() && BOXES.contains(&name.as_str()) => name.rsplit('.').next(),
            _ => None,
        })
        .collect();
    shown.map(|parts| parts.join(","))
}

fn mapped_function(context: &Context, parameter: Node) -> Option<&'static str> {
    let arguments = function_arguments(context, parameter)?;
    let key = mapping_key(&arguments)?;
    METHOD_MAPPINGS.iter().find(|(shown, _)| *shown == key).map(|(_, mapped)| *mapped)
}

/// Whether a lambda given to a call has a type `Function<..>` with a number among its arguments.
fn lambda_of_numbers(context: &Context, lambda: Node) -> bool {
    let Some(Type::Class(name, arguments)) = context.resolver.type_of(lambda) else { return false };
    name == FUNCTION && arguments.len() == 2 && arguments.iter().any(|found| is_number(context, lambda, found))
}

fn top_level_class(node: Node) -> Option<Node> {
    let mut found = None;
    let mut current = parent(node);
    while let Some(at) = current {
        if super::shape::is_class(at) {
            found = Some(at);
        }
        current = parent(at);
    }
    found
}

fn call_arguments(call: Node) -> Vec<Node> {
    super::shape::arguments(call)
}

/// Every call of the method inside its top-level class meets the conditions.
fn calls_meet_conditions(context: &Context, method: Node) -> bool {
    let Some((origin, declared)) = declared_method(context, method) else { return false };
    let Some(top) = top_level_class(method) else { return false };
    let constructor = method.kind() != "method_declaration";
    let mut calls: Vec<Node> = Vec::new();
    walk(top, |node| match node.kind() {
        "method_invocation" if !constructor && node.child_by_field_name("name").is_some_and(|name| context.text(name) == declared.name) => calls.push(node),
        "explicit_constructor_invocation" if constructor => calls.push(node),
        _ => {}
    });
    calls.into_iter().filter(|call| calls_method(context, *call, &origin.name, declared)).all(|call| {
        call_arguments(call).into_iter().any(|argument| argument.kind() == "lambda_expression" && lambda_of_numbers(context, argument))
    })
}

fn calls_method(context: &Context, call: Node, owner: &str, declared: &crate::java::types::model::Method) -> bool {
    let resolved = if call.kind() == "method_invocation" { context.resolver.resolve_call(call) } else { context.resolver.resolve_delegation(call) };
    resolved.is_some_and(|resolved| resolved.declaring == owner && resolved.method.name == declared.name && resolved.method.parameters == declared.parameters)
}

fn parameter_name<'a>(context: &'a Context, parameter: Node) -> Option<&'a str> {
    parameter.child_by_field_name("name").map(|name| context.text(name))
}

fn apply_fixes(context: &Context, method: Node, parameter: Node, mapped: &str, fix: Fix) -> Fix {
    let Some((_, applied)) = APPLY_MAPPINGS.iter().find(|(shown, _)| *shown == mapped) else { return fix };
    let Some(declared) = declared_key(context, parameter) else { return fix };
    let mut fix = fix;
    let mut selects: Vec<(usize, usize, String)> = Vec::new();
    walk(method, |node| {
        if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|name| context.text(name) != "apply") {
            return;
        }
        let Some(receiver) = node.child_by_field_name("object") else { return };
        if reference_key(context, receiver).is_some_and(|key| key == declared) {
            let name = parameter_name(context, parameter).unwrap_or_default();
            let end = node.child_by_field_name("name").map_or(node.end_byte(), |name| name.end_byte());
            selects.push((node.start_byte(), end, format!("{name}.{applied}")));
        }
    });
    for (start, end, text) in selects {
        fix = fix.and(start, end, text);
    }
    fix
}

pub fn lambda_functional_interface(context: &Context, method: Node) {
    if !matches!(method.kind(), "method_declaration" | "constructor_declaration") || !effectively_private(method) || overrides(context, method) {
        return;
    }
    let parameters: Vec<Node> = formals(method).into_iter().filter(|parameter| is_function_of_numbers(context, *parameter)).collect();
    if parameters.is_empty() || !calls_meet_conditions(context, method) {
        return;
    }
    let mut fix = Fix::new();
    for parameter in parameters {
        let Some(mapped) = mapped_function(context, parameter) else { continue };
        let function = mapped.rsplit('.').next().unwrap_or(mapped);
        let name = parameter_name(context, parameter).unwrap_or_default();
        fix = fix.and(parameter.start_byte(), parameter.end_byte(), format!("{function} {name}")).with_imports();
        fix = apply_fixes(context, method, parameter, mapped, fix);
    }
    let at = method.child_by_field_name("name").map_or(method.start_byte(), |name| name.start_byte());
    context.report_fixed(NAME, method, at, MESSAGE, &[fix]);
}
