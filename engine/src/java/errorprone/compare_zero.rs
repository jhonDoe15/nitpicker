//! CompareToZero: the result of `compareTo` or `compare` tested against something other than zero.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::{named_children, parent};
use tree_sitter::Node;

const SUMMARY: &str = "The result of #compareTo or #compare should only be compared to 0. It is an implementation detail whether a given type returns strictly the values {-1, 0, +1} or others.";
const SUGGEST_IMPROVEMENT: &str = "It is generally more robust (and readable) to compare the result of #compareTo/#compare to 0. Although the suggested replacement is identical in this case, we'd suggest it for consistency.";

const STATIC_COMPARE: &[&str] = &[
    "com.google.common.primitives.Booleans", "com.google.common.primitives.Chars", "com.google.common.primitives.Doubles",
    "com.google.common.primitives.Floats", "com.google.common.primitives.Ints", "com.google.common.primitives.Longs",
    "com.google.common.primitives.Shorts", "com.google.common.primitives.SignedBytes", "com.google.common.primitives.UnsignedBytes",
    "com.google.common.primitives.UnsignedInts", "com.google.common.primitives.UnsignedLongs", "com.google.protobuf.util.Durations",
    "com.google.protobuf.util.Timestamps", "java.lang.Boolean", "java.lang.Byte", "java.lang.Character", "java.lang.Double",
    "java.lang.Float", "java.lang.Integer", "java.lang.Long", "java.lang.Short", "java.util.Objects",
];

fn is_compare(context: &Context, call: Node) -> bool {
    let name = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    match name {
        "compareTo" => context.resolver.matches_sig(call, "java.lang.Comparable#compareTo(_*)"),
        "compare" => {
            context.resolver.matches_sig(call, "java.util.Comparator#compare(_*)")
                || STATIC_COMPARE.iter().any(|owner| context.resolver.matches_sig(call, &format!("{owner}#compare(_*)")))
        }
        _ => false,
    }
}

fn digits(text: &str) -> Option<i64> {
    let text = text.replace('_', "");
    if text.ends_with(['l', 'L']) {
        return None;
    }
    let lower = text.to_ascii_lowercase();
    if let Some(rest) = lower.strip_prefix("0x") {
        return i64::from_str_radix(rest, 16).ok().filter(|value| *value <= 0xFFFF_FFFF).map(|value| value as u32 as i32 as i64);
    }
    if let Some(rest) = lower.strip_prefix("0b") {
        return i64::from_str_radix(rest, 2).ok().filter(|value| *value <= 0xFFFF_FFFF).map(|value| value as u32 as i32 as i64);
    }
    if lower.len() > 1 && lower.starts_with('0') {
        return i64::from_str_radix(&lower[1..], 8).ok().filter(|value| *value <= 0xFFFF_FFFF).map(|value| value as u32 as i32 as i64);
    }
    lower.parse::<i64>().ok().filter(|value| *value <= 2_147_483_648)
}

/// The value of an `int` constant expression made of literals and operators.
pub fn int_constant(context: &Context, node: Node) -> Option<i32> {
    match node.kind() {
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => {
            digits(context.text(node)).and_then(|value| i32::try_from(value).ok().or(if value == 2_147_483_648 { Some(i32::MIN) } else { None }))
        }
        "parenthesized_expression" => named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")).and_then(|inner| int_constant(context, inner)),
        "unary_expression" => {
            let operand = named_children(node).into_iter().find(|part| !part.kind().ends_with("comment") && part.kind() != "-" && part.kind() != "+")?;
            let operator = node.child(0).map(|part| context.text(part))?;
            if operator == "-" && matches!(operand.kind(), "decimal_integer_literal") && digits(context.text(operand)) == Some(2_147_483_648) {
                return Some(i32::MIN);
            }
            let value = int_constant(context, operand)?;
            match operator {
                "-" => Some(value.wrapping_neg()),
                "+" => Some(value),
                "~" => Some(!value),
                _ => None,
            }
        }
        "binary_expression" => {
            let left = int_constant(context, node.child_by_field_name("left")?)?;
            let right = int_constant(context, node.child_by_field_name("right")?)?;
            match context.text(node.child_by_field_name("operator")?) {
                "+" => Some(left.wrapping_add(right)),
                "-" => Some(left.wrapping_sub(right)),
                "*" => Some(left.wrapping_mul(right)),
                "/" if right != 0 => Some(left.wrapping_div(right)),
                "%" if right != 0 => Some(left.wrapping_rem(right)),
                _ => None,
            }
        }
        "identifier" | "field_access" => {
            let (declaring, field) = super::lookup::field_of(context, node)?;
            if field.flags & crate::java::types::model::flag::FINAL == 0 || field.kind != crate::java::types::model::Type::Primitive("int") {
                return None;
            }
            let (_, declarator) = super::lookup::field_declarator(context, context.file.tree.root_node(), &declaring.name, &field.name)?;
            if declarator.start_byte() == node.start_byte() {
                return None;
            }
            int_constant(context, declarator.child_by_field_name("value")?)
        }
        "cast_expression" => {
            let written = node.child_by_field_name("type")?;
            if context.text(written) != "int" {
                return None;
            }
            int_constant(context, node.child_by_field_name("value")?)
        }
        _ => None,
    }
}

fn reversed_kind(operator: &str) -> Option<&'static str> {
    match operator {
        "<" => Some(">"),
        "<=" => Some(">="),
        ">" => Some("<"),
        ">=" => Some("<="),
        _ => None,
    }
}

fn report(context: &Context, binary: Node, comparator: Node, replacement: &str, message: &str) {
    let fix = Fix::replace(binary.start_byte(), binary.end_byte(), format!("{} {replacement} 0", context.text(comparator)));
    let at = binary.child_by_field_name("operator").map_or(binary.start_byte(), |operator| operator.start_byte());
    context.report_fixed("CompareToZero", binary, at, message, &[fix]);
}

fn visit_binary(context: &Context, binary: Node, child: Node) {
    let (Some(left), Some(right), Some(operator)) = (binary.child_by_field_name("left"), binary.child_by_field_name("right"), binary.child_by_field_name("operator")) else { return };
    let operator = context.text(operator);
    let reversed = right == child;
    let (comparator, other) = if reversed { (right, left) } else { (left, right) };
    let at = binary.child_by_field_name("operator").map_or(binary.start_byte(), |operator| operator.start_byte());
    if operator == "+" || operator == "-" {
        let string = matches!(context.resolver.type_of(other), Some(crate::java::types::model::Type::Class(name, _)) if name == "java.lang.String");
        if !(operator == "+" && string) {
            context.report_fixed("CompareToZero", binary, at, SUMMARY, &[]);
        }
        return;
    }
    let Some(constant) = int_constant(context, other) else { return };
    if constant == 0 {
        return;
    }
    if operator == "==" {
        report(context, binary, comparator, if constant < 0 { "<" } else { ">" }, SUMMARY);
        return;
    }
    let kind = if reversed {
        match reversed_kind(operator) {
            Some(kind) => kind,
            None => return,
        }
    } else {
        operator
    };
    if (kind == ">" || kind == "!=") && constant == -1 {
        report(context, binary, comparator, ">=", SUMMARY);
    } else if (kind == "<" || kind == "!=") && constant == 1 {
        report(context, binary, comparator, "<=", SUMMARY);
    } else if kind == "<=" && constant == -1 {
        report(context, binary, comparator, "<", SUGGEST_IMPROVEMENT);
    } else if kind == ">=" && constant == 1 {
        report(context, binary, comparator, ">", SUGGEST_IMPROVEMENT);
    } else if matches!(operator, "==" | "!=" | "<" | "<=" | ">" | ">=") {
        context.report_fixed("CompareToZero", binary, at, SUMMARY, &[]);
    }
}

pub fn compare_to_zero(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !is_compare(context, node) {
        return;
    }
    let mut child = node;
    let Some(mut up) = parent(node) else { return };
    while up.kind() == "parenthesized_expression" {
        child = up;
        let Some(next) = parent(up) else { return };
        up = next;
    }
    if up.kind() == "binary_expression" {
        visit_binary(context, up, child);
    }
}
