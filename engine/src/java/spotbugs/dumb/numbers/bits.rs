//! The bit operations of DumbMethods, measured on test code; each once per method and message, on the line in
//! effect at the operation:
//! - BIT_IOR_OF_SIGNED_BYTE / BIT_ADD_OF_SIGNED_BYTE: `|` or `+` (also `|=`, `+=`) of a signed byte and a value
//!   whose low 8 bits are clear (see `values`), in either order; priority 1 on `long`, 2 on `int`.
//! - INT_VACUOUS_BIT_OPERATION: `x & -1` on an `int`, `x | 0` or `x ^ 0` on an `int` or `long`, the constant
//!   written second (also `&=`, `|=`, `^=`); `long & -1L` is not reported. The value is named by its local
//!   variable (through copies), otherwise by the file and line; a value read from a field is not reported;
//!   priority 2.
//! - INT_BAD_REM_BY_1: `x % 1` on an `int` (also `%=`); priority 1.
use super::super::super::Context;
use super::super::found::{Found, Findings};
use super::source::{Source, source};
use super::values::{binary_operator, low_clear, operands, primitive, signed_byte, whole};
use crate::java::spotbugs::place;
use crate::java::types::expr::unwrap;
use crate::java::spotbugs::taint::lines::after;
use tree_sitter::Node;

pub const IOR: &str = "BIT_IOR_OF_SIGNED_BYTE";
pub const ADD: &str = "BIT_ADD_OF_SIGNED_BYTE";
pub const VACUOUS: &str = "INT_VACUOUS_BIT_OPERATION";
pub const REM: &str = "INT_BAD_REM_BY_1";

/// Whether a signed byte meets a value with clear low bits; a compound assignment's variable is judged by the
/// values it holds before.
fn joins(context: &Context, node: Node) -> bool {
    let Some((left, right)) = operands(node) else { return false };
    (signed_byte(context, right, 0) && low_clear(context, left, 0)) || (signed_byte(context, left, 0) && low_clear(context, right, 0))
}

fn file_line(context: &Context, line: usize) -> String {
    let file = context.file.path.rsplit(['/', '\\']).next().unwrap_or_default();
    format!("{file}:[line {line}]")
}

pub fn check<'a>(context: &Context<'a>, node: Node<'a>, label: &str, found: &mut Findings<'a>) {
    let compound = node.kind() == "assignment_expression";
    if !(node.kind() == "binary_expression" || compound && !binary_operator(context, node).is_empty()) {
        return;
    }
    let operator = binary_operator(context, node);
    let Some(kind) = primitive(context, node).filter(|kind| matches!(*kind, "int" | "long")) else { return };
    let Some((left, right)) = operands(node) else { return };
    if whole(context, node).is_some() {
        return;
    }
    let line = || after(context, node);
    let add = |found: &mut Findings<'a>, pattern, priority, message: String, place: Option<String>, arguments: Vec<String>| {
        found.add(Found { pattern, node, line: line(), priority, message, place, arguments });
    };
    match operator {
        "|" | "+" if context.wants(&[IOR, ADD]) && joins(context, node) => {
            let (pattern, word) = if operator == "|" { (IOR, "OR") } else { (ADD, "add") };
            let priority = if kind == "long" { 1 } else { 2 };
            add(found, pattern, priority, format!("Bitwise {word} of signed byte value computed in {label}"), None, vec![label.to_string()]);
        }
        "%" if kind == "int" && whole(context, right) == Some(1) && context.wants(&[REM]) => {
            add(found, REM, 1, format!("Integer remainder modulo 1 computed in {label}"), None, vec![label.to_string()]);
        }
        _ => {}
    }
    let constant = whole(context, right);
    let vacuous = match (operator, kind) {
        ("&", "int") => constant == Some(-1),
        ("|" | "^", _) => constant == Some(0),
        _ => false,
    };
    let assigned_constant = unwrap(left).kind() == "assignment_expression" && unwrap(left).child_by_field_name("right").is_some_and(|value| whole(context, value).is_some());
    if !vacuous || !context.wants(&[VACUOUS]) || whole(context, left).is_some() || assigned_constant {
        return;
    }
    let op = format!("{}{}", &kind[..1], match operator {
        "&" => "and",
        "|" => "or",
        _ => "xor",
    });
    let (name, place) = match source(context, left, 0) {
        Source::Field(..) if operator == "&" => return,
        Source::Local(name) => (name.clone(), Some(place::variable(label, &name))),
        _ => (file_line(context, line()), None),
    };
    add(found, VACUOUS, 2, format!("Vacuous {op} operation on {name} in {label}"), place, vec![op, name, label.to_string()]);
}
