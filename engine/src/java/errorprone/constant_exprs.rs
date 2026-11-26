//! AttemptedNegativeZero, ErroneousBitwiseExpression, ComplexBooleanConstant and NarrowingCompoundAssignment.
use super::consts::{constant, Const};
use super::fixes::Fix;
use super::nodes::position;
use super::target::target_type;
use super::Context;
use crate::engine::source::named_children;
use crate::java::types::model::Type;
use tree_sitter::Node;

fn operator_of<'c>(context: &'c Context, node: Node) -> &'c str {
    node.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default()
}

fn is_zero(value: &Option<Const>) -> bool {
    matches!(value, Some(Const::Int(0)) | Some(Const::Long(0)))
}

pub fn attempted_negative_zero(context: &Context, node: Node) {
    if node.kind() != "unary_expression" || operator_of(context, node) != "-" {
        return;
    }
    let Some(operand) = node.child_by_field_name("operand") else { return };
    if !is_zero(&constant(context, operand)) {
        return;
    }
    let replacement = match target_type(context, node) {
        Some(Type::Primitive("double")) => "-0.0",
        Some(Type::Primitive("float")) => "-0.0f",
        _ => return,
    };
    let fix = Fix::replace(node.start_byte(), node.end_byte(), replacement);
    context.report_fixed("AttemptedNegativeZero", node, position(node), "-0 is the same as 0. For the floating-point negative zero, use -0.0.", &[fix]);
}

pub fn erroneous_bitwise_expression(context: &Context, node: Node) {
    if node.kind() != "binary_expression" || operator_of(context, node) != "&" {
        return;
    }
    let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    if !is_zero(&constant(context, node)) {
        return;
    }
    let fix = Fix::replace(left.end_byte(), right.start_byte(), " | ");
    context.report_fixed("ErroneousBitwiseExpression", node, position(node), "This expression evaluates to 0. If this isn't an error, consider expressing it as a literal 0.", &[fix]);
}

/// javac's parser reads `-` before a nonzero decimal integer literal as one literal.
pub fn is_negated_literal(context: &Context, node: Node) -> bool {
    node.kind() == "unary_expression"
        && node.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "-")
        && node.child_by_field_name("operand").is_some_and(|operand| {
            operand.kind() == "decimal_integer_literal" && !context.text(operand).trim_end_matches(['l', 'L']).replace('_', "").trim_start_matches('0').is_empty()
        })
}

fn is_literal(context: &Context, node: Node) -> bool {
    node.kind().ends_with("_literal") || matches!(node.kind(), "true" | "false") || is_negated_literal(context, node)
}

/// The boolean a literal or a negated literal stands for.
fn bool_value(context: &Context, node: Node) -> Option<bool> {
    match node.kind() {
        "true" => Some(true),
        "false" => Some(false),
        "unary_expression" if operator_of(context, node) == "!" => bool_value(context, node.child_by_field_name("operand")?).map(|value| !value),
        _ => None,
    }
}

fn complex_value(context: &Context, node: Node) -> Option<bool> {
    let (left, right) = (node.child_by_field_name("left")?, node.child_by_field_name("right")?);
    if is_literal(context, left) && is_literal(context, right) {
        return match (constant(context, node), constant(context, left), constant(context, right)) {
            (Some(Const::Bool(value)), _, _) => Some(value),
            (None, Some(Const::Str(a)), Some(Const::Str(b))) => match operator_of(context, node) {
                "==" => Some(a == b),
                "!=" => Some(a != b),
                _ => None,
            },
            _ => None,
        };
    }
    let (lhs, rhs) = (bool_value(context, left), bool_value(context, right));
    match operator_of(context, node) {
        "&&" | "&" => match (lhs, rhs) {
            (Some(a), Some(b)) => Some(a && b),
            _ if lhs == Some(false) || rhs == Some(false) => Some(false),
            _ => None,
        },
        "||" | "|" => match (lhs, rhs) {
            (Some(a), Some(b)) => Some(a || b),
            _ if lhs == Some(true) || rhs == Some(true) => Some(true),
            _ => None,
        },
        _ => None,
    }
}

pub fn complex_boolean_constant(context: &Context, node: Node) {
    if node.kind() != "binary_expression" {
        return;
    }
    let Some(value) = complex_value(context, node) else { return };
    let fix = Fix::replace(node.start_byte(), node.end_byte(), value.to_string());
    let message = format!("This expression always evaluates to `{value}`, prefer a boolean literal for clarity.");
    context.report_fixed("ComplexBooleanConstant", node, position(node), &message, &[fix]);
}

fn widens(from: &str, to: &str) -> bool {
    const ORDER: &[&str] = &["byte", "short", "int", "long", "float", "double"];
    let place = |name: &str| ORDER.iter().position(|known| *known == name);
    match (if from == "char" { Some(1) } else { place(from) }, place(to)) {
        (Some(a), Some(b)) => a < b && !(from == "char" && to == "short"),
        _ => false,
    }
}

fn precedence(context: &Context, node: Node) -> Option<u8> {
    match node.kind() {
        "ternary_expression" => Some(1),
        "binary_expression" => Some(match operator_of(context, node) {
            "*" | "/" | "%" => 11,
            "+" | "-" => 10,
            "<<" | ">>" | ">>>" => 9,
            "<" | "<=" | ">" | ">=" => 8,
            "==" | "!=" => 7,
            "&" => 6,
            "^" => 5,
            "|" => 4,
            "&&" => 3,
            "||" => 2,
            _ => return None,
        }),
        _ => None,
    }
}

fn twiddling_constant_bits_ok(context: &Context, variable: &Type, expression: Node) -> bool {
    let shift = match variable {
        Type::Primitive("byte") => 8,
        Type::Primitive("short") => 16,
        _ => return false,
    };
    let value = match constant(context, expression) {
        Some(Const::Int(value)) => i64::from(value),
        Some(Const::Long(value)) => value,
        _ => return false,
    };
    let shifted = value >> shift;
    shifted == 0 || shifted == -1
}

fn fits(name: &str, value: i64) -> bool {
    match name {
        "byte" => (-128..=127).contains(&value),
        "short" => (-32768..=32767).contains(&value),
        "char" => (0..=65535).contains(&value),
        _ => false,
    }
}

/// The type of an expression, with the narrow-constant rule for conditionals (JLS 15.25).
fn expression_type(context: &Context, node: Node) -> Option<Type> {
    let mut node = node;
    while node.kind() == "parenthesized_expression" {
        node = named_children(node).into_iter().find(|part| !part.kind().ends_with("comment"))?;
    }
    if node.kind() == "ternary_expression" {
        let (first, second) = (node.child_by_field_name("consequence")?, node.child_by_field_name("alternative")?);
        let (a, b) = (expression_type(context, first)?, expression_type(context, second)?);
        let narrow = |kind: &Type, other: Node, other_type: &Type| match (kind, other_type, constant(context, other)) {
            (Type::Primitive(name), Type::Primitive("int"), Some(Const::Int(value))) if fits(name, i64::from(value)) => Some(kind.clone()),
            _ => None,
        };
        if let Some(found) = narrow(&a, second, &b).or_else(|| narrow(&b, first, &a)) {
            return Some(found);
        }
    }
    context.resolver.type_of(node)
}

pub fn narrowing_compound_assignment(context: &Context, node: Node) {
    if node.kind() != "assignment_expression" {
        return;
    }
    let operator = operator_of(context, node);
    let Some(base) = operator.strip_suffix('=').filter(|base| !base.is_empty()) else { return };
    let (Some(variable), Some(expression)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    let Some(Type::Primitive(lhs)) = context.resolver.type_of(variable) else { return };
    let Some(rhs) = expression_type(context, expression) else { return };
    let source = match rhs.clone().unboxed_or_same() {
        Type::Primitive(source) => source,
        _ => return,
    };
    if source == lhs || widens(source, lhs) {
        return;
    }
    if base == ">>" || matches!(base, "&" | "^" | "|") && twiddling_constant_bits_ok(context, &Type::Primitive(lhs), expression) {
        return;
    }
    let (var, expr) = (context.text(variable), context.text(expression));
    let wanted = match base {
        "*" | "/" | "%" => 11,
        "+" | "-" => 10,
        "<<" | ">>>" => 9,
        "&" => 6,
        "^" => 5,
        _ => 4,
    };
    let wrapped = if precedence(context, expression).is_some_and(|found| found <= wanted) { format!("({expr})") } else { expr.to_string() };
    let replacement = format!("{var} = ({lhs}) ({var} {base} {wrapped})");
    let message = format!("Compound assignments from {} to {lhs} hide lossy casts", super::compat::pretty(&rhs));
    let fix = Fix::replace(node.start_byte(), node.end_byte(), replacement);
    context.report_fixed("NarrowingCompoundAssignment", node, position(node), &message, &[fix]);
}
