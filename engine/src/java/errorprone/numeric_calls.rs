//! LongFloatConversion, MathAbsoluteNegative, MultipleUnaryOperatorsInMethodCall and NegativeCharLiteral.
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::owners::{is_descendant, receiver_name};
use super::parts::{arguments, name_text, open_paren, preferred};
use super::symbol_key::same_declared_symbol;
use super::target::target_type;
use super::Context;
use crate::java::types::model::Type;
use tree_sitter::Node;

fn is_call(node: Node) -> bool {
    matches!(node.kind(), "method_invocation" | "explicit_constructor_invocation")
}

pub fn long_float_conversion(context: &Context, node: Node) {
    if !is_call(node) {
        return;
    }
    for argument in arguments(node) {
        if context.resolver.type_of(argument) != Some(Type::Primitive("long")) || target_type(context, argument) != Some(Type::Primitive("float")) {
            continue;
        }
        let message = "Conversion from long to float may lose precision; use an explicit cast to float if this was intentional";
        context.report_fixed("LongFloatConversion", argument, preferred(argument), message, &[Fix::new().insert(argument.start_byte(), "(float) ")]);
    }
}

const HASH_CODE_CLASSES: [&str; 8] = [
    "java.lang.Long", "java.lang.Integer", "java.lang.Double", "java.lang.Float",
    "com.google.common.primitives.Longs", "com.google.common.primitives.Ints", "com.google.common.primitives.Floats", "com.google.common.primitives.Doubles",
];

fn instance_no_arguments(context: &Context, call: Node, owner: &str, names: &[&str]) -> bool {
    arguments(call).is_empty()
        && names.contains(&name_text(context, call))
        && receiver_name(context, call, false).is_some_and(|found| is_descendant(context, &found, &[owner]))
}

fn possibly_negative(context: &Context, value: Node) -> bool {
    value.kind() == "method_invocation"
        && (static_on_class_any(context, value, &HASH_CODE_CLASSES, "hashCode")
            || static_on_class(context, value, "java.lang.System", &["identityHashCode"])
            || instance_no_arguments(context, value, "java.util.Random", &["nextInt", "nextLong"])
            || instance_no_arguments(context, value, "java.util.UUID", &["getLeastSignificantBits", "getMostSignificantBits"])
            || instance_no_arguments(context, value, "java.lang.Object", &["hashCode"])
            || instance_no_arguments(context, value, "com.google.common.hash.HashCode", &["asInt", "asLong", "padToLong"]))
}

fn static_on_class_any(context: &Context, call: Node, owners: &[&str], name: &str) -> bool {
    owners.iter().any(|owner| static_on_class(context, call, owner, &[name]))
}

pub fn math_absolute_negative(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !static_on_class(context, node, "java.lang.Math", &["abs"]) {
        return;
    }
    let Some(first) = arguments(node).first().copied() else { return };
    if possibly_negative(context, first) {
        let message = "Math.abs() does not always give a non-negative result. Please consider other methods for positive numbers, such as IntMath.saturatedAbs() or Math.floorMod().";
        context.report_fixed("MathAbsoluteNegative", node, preferred(node), message, &[]);
    }
}

pub fn multiple_unary_operators_in_method_call(context: &Context, node: Node) {
    if !is_call(node) {
        return;
    }
    let operands: Vec<Node> = arguments(node)
        .into_iter()
        .filter(|argument| argument.kind() == "update_expression")
        .filter_map(|argument| crate::engine::source::named_children(argument).into_iter().find(|part| !part.kind().ends_with("comment")))
        .collect();
    let repeated = operands.iter().enumerate().any(|(at, first)| operands[..at].iter().any(|earlier| same_declared_symbol(context, *earlier, *first)));
    if repeated {
        let message = "Avoid having multiple unary operators acting on the same variable in a method call";
        context.report_fixed("MultipleUnaryOperatorsInMethodCall", node, open_paren(node), message, &[]);
    }
}

/// The value javac gives an integer literal: a decimal literal after `-` is folded into it.
fn literal_value(context: &Context, expression: Node) -> Option<i64> {
    let (literal, negative) = match expression.kind() {
        "unary_expression" if context.text(expression.child_by_field_name("operator")?) == "-" => {
            let operand = expression.child_by_field_name("operand")?;
            (operand.kind() == "decimal_integer_literal").then_some((operand, true))?
        }
        _ => (expression, false),
    };
    let text: String = context.text(literal).chars().filter(|c| *c != '_').collect();
    let long = text.ends_with(['l', 'L']);
    let digits = text.trim_end_matches(['l', 'L']);
    let magnitude = match literal.kind() {
        "decimal_integer_literal" => digits.parse::<u64>().ok()?,
        "hex_integer_literal" => u64::from_str_radix(&digits[2..], 16).ok()?,
        "binary_integer_literal" => u64::from_str_radix(&digits[2..], 2).ok()?,
        "octal_integer_literal" => u64::from_str_radix(digits.trim_start_matches('0'), 8).ok().or((digits.trim_start_matches('0').is_empty()).then_some(0))?,
        _ => return None,
    };
    let value = match (literal.kind(), long) {
        ("decimal_integer_literal", _) => magnitude as i64,
        (_, true) => magnitude as i64,
        _ => i64::from(magnitude as u32 as i32),
    };
    Some(if negative { -value } else { value })
}

pub fn negative_char_literal(context: &Context, node: Node) {
    if node.kind() != "cast_expression" || node.child_by_field_name("type").is_none_or(|kind| context.resolver.type_node(kind) != Some(Type::Primitive("char"))) {
        return;
    }
    let Some(value) = node.child_by_field_name("value") else { return };
    let Some(literal) = literal_value(context, value).filter(|literal| *literal < 0) else { return };
    let cast = u64::from(literal as u16);
    let replacement = if cast == u64::from(u16::MAX) { "Character.MAX_VALUE".to_string() } else { format!("Character.MAX_VALUE - {}", u64::from(u16::MAX) - cast) };
    let message = "Casting a negative signed literal to an (unsigned) char might be misleading.";
    context.report_fixed("NegativeCharLiteral", node, preferred(node), message, &[Fix::replace(node.start_byte(), node.end_byte(), replacement)]);
}
