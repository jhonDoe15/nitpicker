//! Checks on numeric conversions: a long passed where a double is expected, a calculation narrower than its target.
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::parts::{arguments, preferred};
use super::target::target_type;
use super::Context;
use crate::java::types::model::Type;
use tree_sitter::Node;

/// `SuggestedFixes.castTree`.
pub fn cast_tree(context: &Context, expression: Node, to: &str) -> String {
    let wrap = matches!(expression.kind(), "binary_expression" | "assignment_expression" | "instanceof_expression" | "ternary_expression");
    let source = context.text(expression);
    if wrap { format!("({to}) ({source})") } else { format!("({to}) {source}") }
}

pub fn long_double_conversion(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    for argument in arguments(node) {
        if context.resolver.type_of(argument) != Some(Type::Primitive("long")) {
            continue;
        }
        if let Some(Const::Long(value)) = constant(context, argument) {
            if value == (value as f64) as i64 {
                continue;
            }
        }
        if target_type(context, argument) == Some(Type::Primitive("double")) {
            let fix = Fix::replace(argument.start_byte(), argument.end_byte(), cast_tree(context, argument, "double"));
            context.report_fixed(
                "LongDoubleConversion",
                argument,
                preferred(argument),
                "Conversion from long to double may lose precision; use an explicit cast to double if this was intentional",
                &[fix],
            );
        }
    }
}

fn literal(node: Node) -> bool {
    node.kind().ends_with("_literal") || matches!(node.kind(), "true" | "false")
}

fn force_literal(context: &Context, literal: Node, target: &str) -> String {
    let source = context.text(literal);
    let trimmed = source.strip_suffix(['L', 'l', 'F', 'f', 'D', 'd']).unwrap_or(source);
    let suffix = match target {
        "long" => "L",
        "float" => "f",
        _ => ".0",
    };
    format!("{trimmed}{suffix}")
}

fn force_type(context: &Context, tree: Node, target: &str) -> Fix {
    let (Some(left), Some(right)) = (tree.child_by_field_name("left"), tree.child_by_field_name("right")) else { return Fix::new() };
    if literal(right) {
        return Fix::replace(right.start_byte(), right.end_byte(), force_literal(context, right, target));
    }
    if literal(left) {
        return Fix::replace(left.start_byte(), left.end_byte(), force_literal(context, left, target));
    }
    Fix::replace(right.start_byte(), right.end_byte(), format!("(({target}) {})", context.text(right)))
}

fn integral(kind: &Type) -> bool {
    matches!(kind, Type::Primitive("byte" | "short" | "char" | "int" | "long"))
}

fn whole(value: &Const) -> Option<i64> {
    match value {
        Const::Int(number) => Some(i64::from(*number)),
        Const::Long(number) => Some(*number),
        Const::Char(number) => Some(i64::from(*number)),
        _ => None,
    }
}

pub fn narrow_calculation(context: &Context, node: Node) {
    if node.kind() != "binary_expression" {
        return;
    }
    let Some(operator) = node.child_by_field_name("operator") else { return };
    let operator_text = context.text(operator);
    if !matches!(operator_text, "/" | "*") {
        return;
    }
    let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    let (Some(left_type), Some(right_type)) = (context.resolver.type_of(left), context.resolver.type_of(right)) else { return };
    let Some(Type::Primitive(target)) = target_type(context, node) else { return };
    if operator_text == "/" {
        if !integral(&left_type) || !integral(&right_type) || !matches!(target, "float" | "double") {
            return;
        }
        if let (Some(a), Some(b)) = (constant(context, left).as_ref().and_then(whole), constant(context, right).as_ref().and_then(whole)) {
            if b != 0 && a.wrapping_div(b).wrapping_mul(b) == a {
                return;
            }
        }
        let message = "This division will discard the fractional part of the result, despite being assigned to a float.";
        context.report_fixed("NarrowCalculation", node, operator.start_byte(), message, &[force_type(context, node, target)]);
    } else if left_type == Type::Primitive("int") && right_type == Type::Primitive("int") && target == "long" {
        if let (Some(Const::Int(a)), Some(Const::Int(b))) = (constant(context, left), constant(context, right)) {
            let product = i64::from(a) * i64::from(b);
            if product == i64::from(product as i32) {
                return;
            }
        }
        let message = "This product of integers could overflow before being implicitly cast to a long.";
        context.report_fixed("NarrowCalculation", node, operator.start_byte(), message, &[force_type(context, node, target)]);
    }
}
