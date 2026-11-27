//! The comparisons of DumbMethods with a constant, measured on test code; each once per method and message, on
//! the line in effect at the comparison, the constant on either side unless said otherwise:
//! - INT_VACUOUS_COMPARISON: an `int` `<= MAX_VALUE`, `> MAX_VALUE`, `>= MIN_VALUE` or `< MIN_VALUE` of
//!   `Integer`; priority 2. `long` comparisons are not looked at.
//! - INT_BAD_COMPARISON_WITH_INT_VALUE: an `int` with a `long` constant outside the `int` range; priority 2 for
//!   2^31 and -2^31-1, else 1.
//! - INT_BAD_COMPARISON_WITH_SIGNED_BYTE: a signed byte with an `int` constant above 127 or below -128, or with
//!   127 by `>` or `<=`; priority 2 below -128, for 127, and for 128 by `>=` or `<`, else 1.
//! - INT_BAD_COMPARISON_WITH_NONNEGATIVE_VALUE: a nonnegative value with a negative `int` constant (priority 1),
//!   or by `< 0` or `>= 0` with the 0 written second (priority 2).
//! A constant is printed as `hexadecimal` says. The place of a bad comparison is the value's local variable, field
//! or called method, else the method.
use super::super::super::Context;
use super::super::found::{Found, Findings};
use super::source::{placed, source};
use super::values::{nonnegative, operator, primitive, signed_byte, whole};
use crate::java::types::expr::unwrap;
use crate::java::spotbugs::taint::lines::after;
use tree_sitter::Node;

pub const VACUOUS: &str = "INT_VACUOUS_COMPARISON";
pub const INT_VALUE: &str = "INT_BAD_COMPARISON_WITH_INT_VALUE";
pub const SIGNED_BYTE: &str = "INT_BAD_COMPARISON_WITH_SIGNED_BYTE";
pub const NONNEGATIVE: &str = "INT_BAD_COMPARISON_WITH_NONNEGATIVE_VALUE";
pub const PATTERNS: &[&str] = &[VACUOUS, INT_VALUE, SIGNED_BYTE, NONNEGATIVE];

fn flipped(operator: &str) -> &str {
    match operator {
        "<" => ">",
        ">" => "<",
        "<=" => ">=",
        ">=" => "<=",
        other => other,
    }
}

/// Whether SpotBugs prints a constant in hexadecimal, as measured: at most three different hexadecimal digits, not a
/// negative value starting `ff`, and for an `int` 65535 or a size of at least 131071.
fn hexadecimal(value: i64, long: bool) -> bool {
    let hex = if long { format!("{:x}", value as u64) } else { format!("{:x}", value as i32 as u32) };
    let mut digits: Vec<char> = hex.chars().collect();
    digits.sort_unstable();
    digits.dedup();
    let shown = digits.len() <= 3 && !(value < 0 && hex.starts_with("ff"));
    shown && (long || value == 0xffff || value.unsigned_abs() >= 0x1_ffff)
}

/// A `long` constant as SpotBugs prints it.
fn long_text(value: i64) -> String {
    if hexadecimal(value, true) { format!("0x{:x}L", value as u64) } else { format!("{value}L") }
}

/// An `int` constant as SpotBugs prints it.
pub fn int_text(value: i64) -> String {
    if hexadecimal(value, false) { format!("0x{:x}", value as i32 as u32) } else { value.to_string() }
}

fn byte_priority(operator: &str, constant: i64) -> Option<u8> {
    match (operator, constant) {
        (">" | "<=", 127) => Some(2),
        (">=" | "<", 128) => Some(2),
        (_, value) if value < -128 => Some(2),
        (_, value) if value > 127 => Some(1),
        _ => None,
    }
}

pub fn check<'a>(context: &Context<'a>, node: Node<'a>, label: &str, found: &mut Findings<'a>) {
    let written = operator(context, node);
    if node.kind() != "binary_expression" || !matches!(written, "==" | "!=" | "<" | "<=" | ">" | ">=") || !context.wants(PATTERNS) {
        return;
    }
    let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    let (value, constant, second, op) = match (whole(context, left), whole(context, right)) {
        (None, Some(constant)) => (left, constant, right, written),
        (Some(constant), None) => (right, constant, left, flipped(written)),
        _ => return,
    };
    let long = primitive(context, second) == Some("long");
    let narrow = |node: Node| matches!(primitive(context, node), Some("int" | "short" | "char" | "byte"));
    let widened = unwrap(value).kind() == "cast_expression" && unwrap(value).child_by_field_name("value").is_some_and(narrow);
    let mut add = |pattern, priority, message: String, arguments: Vec<String>| {
        let place = (pattern != VACUOUS).then(|| placed(context, node, label, &source(context, value, 0)));
        found.add(Found { pattern, node, line: after(context, node), priority, message, place, arguments });
    };
    if long {
        let int = matches!(primitive(context, value), Some("int" | "short" | "char"));
        if (int || widened) && (constant > i64::from(i32::MAX) || constant < i64::from(i32::MIN)) {
            let priority = if constant == 1 << 31 || constant == -(1 << 31) - 1 { 2 } else { 1 };
            let text = long_text(constant);
            add(INT_VALUE, priority, format!("Bad comparison of int with {text} in {label}"), vec![text, label.to_string()]);
        }
        return;
    }
    let max = constant == i64::from(i32::MAX) && matches!(op, "<=" | ">");
    let min = constant == i64::from(i32::MIN) && matches!(op, ">=" | "<");
    if narrow(value) && (max || min) {
        add(VACUOUS, 2, format!("Vacuous comparison of integer value {label}"), vec![label.to_string()]);
    }
    if signed_byte(context, value, 0) {
        if let Some(priority) = byte_priority(op, constant) {
            let text = int_text(constant);
            add(SIGNED_BYTE, priority, format!("Bad comparison of signed byte with {text} in {label}"), vec![text, label.to_string()]);
        }
        return;
    }
    if nonnegative(context, value, 0) {
        let zero = constant == 0 && second.id() == right.id() && matches!(op, "<" | ">=");
        if constant < 0 || zero {
            let priority = if zero { 2 } else { 1 };
            let message = format!("Bad comparison of nonnegative value with {constant} in {label}");
            add(NONNEGATIVE, priority, message, vec![constant.to_string(), label.to_string()]);
        }
    }
}
