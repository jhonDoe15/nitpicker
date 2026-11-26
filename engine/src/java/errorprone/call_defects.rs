//! Checks on calls that do nothing useful or lose information: JUnit, Mockito, `Math.round`, `Collections.nCopies`, `getAnnotation`.
use super::call_match::{instance_on_exact_class, static_on_class};
use super::fixes::Fix;
use super::lookup::same_variable;
use super::parts::arguments;
use super::shape::preferred;
use super::Context;
use crate::engine::source::parent;
use crate::java::types::model::{flag, Type};
use tree_sitter::Node;

fn named(context: &Context, call: Node, names: &[&str]) -> bool {
    call.kind() == "method_invocation" && call.child_by_field_name("name").is_some_and(|name| names.contains(&context.text(name)))
}

pub fn junit_assert_same(context: &Context, node: Node) {
    if !named(context, node, &["assertSame"]) || !["org.junit.Assert", "junit.framework.Assert"].iter().any(|class| static_on_class(context, node, class, &["assertSame"])) {
        return;
    }
    let args = arguments(node);
    let same = match args.len() {
        2 => same_variable(context, args[0], args[1]),
        3 => same_variable(context, args[1], args[2]),
        _ => false,
    };
    if same {
        context.report_fixed("JUnitAssertSameCheck", node, preferred(node), "An object is tested for reference equality to itself using JUnit library.", &[]);
    }
}

fn widens(from: &str, to: &str) -> bool {
    from == to
        || matches!(
            (from, to),
            ("byte", "short" | "int" | "long" | "float" | "double")
                | ("short" | "char", "int" | "long" | "float" | "double")
                | ("int", "long" | "float" | "double")
                | ("long", "float" | "double")
                | ("float", "double")
        )
}

fn convertible(kinds: &[Type], to: &str) -> bool {
    kinds.iter().all(|kind| matches!(kind.clone().unboxed_or_same(), Type::Primitive(from) if widens(from, to)))
}

pub fn lossy_primitive_compare(context: &Context, node: Node) {
    if !named(context, node, &["compare"]) || !["java.lang.Float", "java.lang.Double"].iter().any(|class| static_on_class(context, node, class, &["compare"])) {
        return;
    }
    let kinds: Option<Vec<Type>> = arguments(node).into_iter().map(|argument| context.resolver.type_of(argument)).collect();
    let Some(kinds) = kinds else { return };
    let replacement = if convertible(&kinds, "byte") || convertible(&kinds, "char") || convertible(&kinds, "short") {
        return;
    } else if convertible(&kinds, "int") {
        if !static_on_class(context, node, "java.lang.Float", &["compare"]) {
            return;
        }
        "Integer.compare"
    } else if convertible(&kinds, "long") {
        "Long.compare"
    } else {
        return;
    };
    let Some(name) = node.child_by_field_name("name") else { return };
    let fix = Fix::replace(node.start_byte(), name.end_byte(), replacement);
    context.report_fixed("LossyPrimitiveCompare", node, preferred(node), "Using an unnecessarily-wide comparison method can lead to lossy comparison", &[fix]);
}

/// `ASTHelpers.requiresParentheses` for an argument of `call`; unary operators look at the parent of the call.
fn requires_parentheses(context: &Context, argument: Node, call: Node) -> bool {
    match argument.kind() {
        "identifier" | "this" | "field_access" | "method_invocation" | "array_access" | "parenthesized_expression" | "object_creation_expression" | "method_reference" | "lambda_expression" => false,
        "unary_expression" => {
            let cast = parent(call).filter(|up| up.kind() == "cast_expression");
            let reference = cast.and_then(|up| up.child_by_field_name("type")).is_some_and(|written| !matches!(context.resolver.type_node(written), Some(Type::Primitive(_))));
            reference && argument.child_by_field_name("operator").is_some_and(|operator| matches!(context.text(operator), "+" | "-"))
        }
        "update_expression" => false,
        kind if kind.ends_with("_literal") || matches!(kind, "true" | "false") => false,
        _ => true,
    }
}

pub fn math_round_int_long(context: &Context, node: Node) {
    if !named(context, node, &["round"]) || !static_on_class(context, node, "java.lang.Math", &["round"]) {
        return;
    }
    let Some(argument) = arguments(node).first().copied() else { return };
    let Some(kind) = context.resolver.type_of(argument).map(|kind| kind.name()) else { return };
    let source = context.text(argument);
    let fix = match kind.as_str() {
        "int" | "java.lang.Integer" if requires_parentheses(context, argument, node) => {
            Fix::new().insert(node.start_byte(), "(").and(node.start_byte(), node.end_byte(), source).insert(node.end_byte(), ")")
        }
        "int" | "java.lang.Integer" => Fix::replace(node.start_byte(), node.end_byte(), source),
        "long" | "java.lang.Long" => Fix::new()
            .insert(node.start_byte(), "Ints.saturatedCast(")
            .and(node.start_byte(), node.end_byte(), source)
            .insert(node.end_byte(), ")")
            .with_imports(),
        _ => return,
    };
    context.report_fixed("MathRoundIntLong", node, preferred(node), "Math.round(Integer) results in truncation", &[fix]);
}

pub fn misleading_empty_varargs(context: &Context, node: Node) {
    if !named(context, node, &["thenThrow", "doThrow"]) || !arguments(node).is_empty() {
        return;
    }
    if context.resolver.matches_sig(node, "org.mockito.stubbing.OngoingStubbing#thenThrow(_*)") || static_on_class(context, node, "org.mockito.Mockito", &["doThrow"]) {
        let message = "`thenThrow` with no arguments is a no-op, despite reading like it makes the mock throw.";
        context.report_fixed("MisleadingEmptyVarargs", node, preferred(node), message, &[]);
    }
}

pub fn mockito_usage(context: &Context, node: Node) {
    if !named(context, node, &["when", "verify"]) || !static_on_class(context, node, "org.mockito.Mockito", &["when", "verify"]) {
        return;
    }
    let Some(statement) = parent(node).filter(|up| up.kind() == "expression_statement") else { return };
    let args = arguments(node);
    let Some(mock) = args.first().copied() else { return };
    let verify = node.child_by_field_name("name").is_some_and(|name| context.text(name) == "verify");
    let mut fixes = Vec::new();
    if verify && mock.kind() == "method_invocation" {
        let (Some(name), Some(receiver)) = (node.child_by_field_name("name"), mock.child_by_field_name("object")) else { return };
        let select = &context.file.text[node.start_byte()..name.end_byte()];
        let mode = args.get(1).map(|mode| format!(", {}", context.text(*mode))).unwrap_or_default();
        let call = &context.text(mock)[context.text(receiver).len()..];
        fixes.push(Fix::replace(node.start_byte(), node.end_byte(), format!("{select}({}{mode}){call}", context.text(receiver))));
    }
    if verify && args.get(1).is_some_and(|mode| named(context, *mode, &["never"]) && static_on_class(context, *mode, "org.mockito.Mockito", &["never"]) && arguments(*mode).is_empty()) {
        fixes.push(Fix::replace(node.start_byte(), node.end_byte(), format!("verifyZeroInteractions({})", context.text(mock))).with_imports());
    }
    fixes.push(Fix::replace(statement.start_byte(), statement.end_byte(), ""));
    let message = format!("Missing method call for {} here", context.text(node));
    context.report_fixed("MockitoUsage", node, preferred(node), &message, &fixes);
}

pub fn n_copies_of_char(context: &Context, node: Node) {
    if !named(context, node, &["nCopies"]) || !static_on_class(context, node, "java.util.Collections", &["nCopies"]) {
        return;
    }
    let args = arguments(node);
    let [count, item] = args.as_slice() else { return };
    let unboxed = |argument: Node| context.resolver.type_of(argument).map(Type::unboxed_or_same);
    if unboxed(*item) == Some(Type::Primitive("int")) && unboxed(*count) == Some(Type::Primitive("char")) {
        let fix = Fix::replace(count.start_byte(), count.end_byte(), context.text(*item)).and(item.start_byte(), item.end_byte(), context.text(*count));
        let message = "The first argument to nCopies is the number of copies, and the second is the item to copy";
        context.report_fixed("NCopiesOfChar", node, preferred(node), message, &[fix]);
    }
}

pub fn non_runtime_annotation(context: &Context, node: Node) {
    if !named(context, node, &["getAnnotation"]) || !instance_on_exact_class(context, node, "java.lang.Class", &["getAnnotation"]) {
        return;
    }
    if context.resolver.resolve_call(node).is_none_or(|call| call.method.parameters.len() != 1 || call.method.parameters[0].name() != "java.lang.Class") {
        return;
    }
    let Some(argument) = arguments(node).first().copied() else { return };
    let Some(Type::Class(_, shown)) = context.resolver.type_of(argument) else { return };
    let [Type::Class(annotation, _)] = shown.as_slice() else { return };
    if annotation == "java.lang.annotation.Annotation" {
        return;
    }
    let Some(info) = context.resolver.index.get(annotation) else { return };
    let policy = if info.flags & flag::RUNTIME_RETENTION != 0 {
        return;
    } else if info.flags & flag::SOURCE_RETENTION != 0 {
        "SOURCE"
    } else {
        "CLASS"
    };
    let simple = annotation.rsplit('.').next().unwrap_or(annotation);
    let message = format!("Calling getAnnotation on an annotation that is not retained at runtime; {simple} has {policy} retention");
    context.report_fixed("NonRuntimeAnnotation", node, preferred(node), &message, &[]);
}
