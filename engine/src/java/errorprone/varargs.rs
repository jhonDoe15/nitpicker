//! Checks on call arguments: arrays written out for varargs, comparators that box.
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::parts::{arguments, name_text, new_keyword, open_paren};
use super::Context;
use crate::engine::source::{named_children, parent};
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
use tree_sitter::Node;

fn same_method_around(context: &Context, call: Node, declaring: &str, name: &str) -> bool {
    let mut current = parent(call);
    while let Some(node) = current {
        match node.kind() {
            "method_declaration" | "constructor_declaration" => {
                let own = if node.kind() == "method_declaration" { node.child_by_field_name("name").map(|written| context.text(written)) } else { Some("<init>") };
                let owner = super::parts::enclosing_class(context, node);
                if own == Some(name) && owner.as_deref() == Some(declaring) {
                    return true;
                }
            }
            "method_invocation" | "object_creation_expression" => {
                let other = if node.kind() == "method_invocation" { context.resolver.resolve_call(node) } else { context.resolver.call_formals(node).map(|(call, _)| call) };
                if other.is_some_and(|other| other.declaring == declaring && other.method.name == name) {
                    return true;
                }
            }
            _ => {}
        }
        current = parent(node);
    }
    false
}

pub fn explicit_array_for_varargs(context: &Context, node: Node) {
    if !matches!(node.kind(), "method_invocation" | "object_creation_expression") {
        return;
    }
    let args = arguments(node);
    let Some(last) = args.last().copied() else { return };
    if last.kind() != "array_creation_expression" {
        return;
    }
    let resolved = if node.kind() == "method_invocation" { context.resolver.resolve_call(node) } else { context.resolver.call_formals(node).map(|(call, _)| call) };
    let Some(call) = resolved else { return };
    if !call.method.varargs || call.method.parameters.len() != args.len() {
        return;
    }
    if same_method_around(context, node, &call.declaring, &call.method.name) {
        return;
    }
    if matches!(context.resolver.type_of(last), Some(Type::Array(element)) if matches!(*element, Type::Array(_))) {
        return;
    }
    let initializer = last.child_by_field_name("value");
    let Some(initializer) = initializer else {
        let dimensions: Vec<Node> = named_children(last).into_iter().filter(|part| part.kind() == "dimensions_expr").collect();
        let [only] = dimensions.as_slice() else { return };
        let Some(expression) = only.named_child(0).filter(|inner| !inner.kind().ends_with("comment")) else { return };
        let Some(Const::Int(count)) = constant(context, expression) else { return };
        let replacement = vec!["null"; count.max(0) as usize].join(", ");
        let fix = Fix::replace(last.start_byte(), last.end_byte(), replacement);
        context.report_fixed("ExplicitArrayForVarargs", last, super::parts::new_keyword(last), "Avoid explicit array creation for varargs", &[fix]);
        return;
    };
    let elements: Vec<Node> = named_children(initializer).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let fix = match (elements.first(), elements.last()) {
        (Some(first), Some(end)) => {
            Fix::replace(last.start_byte(), first.start_byte(), "").and(end.end_byte(), last.end_byte(), "")
        }
        _ if args.len() == 1 => Fix::replace(last.start_byte(), last.end_byte(), ""),
        _ => {
            let before = args[args.len() - 2];
            Fix::replace(before.end_byte(), last.end_byte(), "")
        }
    };
    let at = if node.kind() == "method_invocation" { open_paren(node) } else { new_keyword(node) };
    context.report_fixed("ExplicitArrayForVarargs", node, at, "Avoid explicit array creation for varargs", &[fix]);
}

fn suffix(kind: &Type) -> Option<&'static str> {
    match kind {
        Type::Primitive("int" | "byte" | "short" | "char") => Some("Int"),
        Type::Primitive("long") => Some("Long"),
        Type::Primitive("double" | "float") => Some("Double"),
        _ => None,
    }
}

fn result_type(context: &Context, key: Node) -> Option<Type> {
    let key = unwrap(key);
    match key.kind() {
        "method_reference" => {
            let (_, _, method, _) = context.resolver.reference_method(key, &[])?;
            Some(method.returns.clone())
        }
        "lambda_expression" => {
            let body = key.child_by_field_name("body")?;
            if body.kind() != "block" {
                return context.resolver.type_of(body);
            }
            let statements: Vec<Node> = named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
            match statements.as_slice() {
                [only] if only.kind() == "return_statement" => context.resolver.type_of(only.named_child(0)?),
                _ => None,
            }
        }
        _ => None,
    }
}

const COMPARATOR: &str = "java.util.Comparator";

pub fn boxing_comparator(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let name = name_text(context, node);
    if !matches!(name, "comparing" | "thenComparing") || node.child_by_field_name("type_arguments").is_some() {
        return;
    }
    let Some(call) = context.resolver.resolve_call(node) else { return };
    let comparing = name == "comparing" && call.method.is_static && call.declaring == COMPARATOR;
    let then = name == "thenComparing"
        && !call.method.is_static
        && call.method.parameters.len() == 1
        && call.method.parameters[0].name() == "java.util.function.Function"
        && context.resolver.index.is_subtype(&call.receiver.name(), COMPARATOR);
    if !comparing && !then {
        return;
    }
    let Some(argument) = super::parts::only_argument(node) else { return };
    let Some(suffix) = result_type(context, argument).as_ref().and_then(suffix) else { return };
    let Some(written) = node.child_by_field_name("name") else { return };
    let mut fix = Fix::replace(written.start_byte(), written.end_byte(), format!("{name}{suffix}"));
    if comparing && node.child_by_field_name("object").is_none() {
        fix = fix.with_imports();
    }
    context.report_fixed("BoxingComparator", node, open_paren(node), "Comparator.comparing unnecessarily boxes numerical primitives", &[fix]);
}
