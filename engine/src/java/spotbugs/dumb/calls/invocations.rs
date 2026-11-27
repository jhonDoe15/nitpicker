//! Calls with suspicious constant arguments, of DumbMethods and DumbMethodInvocations, measured on test code;
//! each once per method and message:
//! - DMI_BIGDECIMAL_CONSTRUCTED_FROM_DOUBLE: `new BigDecimal(double)` of a constant whose `Double.toString` has
//!   no exponent, at most 8 characters and a value the double does not hold exactly; priority 2.
//! - DMI_LONG_BITS_TO_DOUBLE_INVOKED_ON_INT: `Double.longBitsToDouble` of a value that is not a `long` before
//!   widening; priority 1, placed on the called method.
//! - DM_INVALID_MIN_MAX: `Math.min(a, Math.max(b, x))` with constants `a < b`, or `Math.max(b, Math.min(a, x))`
//!   with `b > a`, the constants on either side and the inner call possibly in a local; priority 1.
//! - DMI_CONSTANT_DB_PASSWORD / DMI_EMPTY_DB_PASSWORD: `DriverManager.getConnection(url, user, password)` with a
//!   constant password, empty or not; priority 2.
//! - DMI_HARDCODED_ABSOLUTE_FILENAME: `new File(String)` of a constant starting with `/`, two backslashes or a
//!   drive letter and a colon, but not `/tmp`, `/proc`, `/etc/` or `/dev/`; priority 1 when it holds `/home`,
//!   else 2.
//! - DMI_USELESS_SUBSTRING / DMI_MISLEADING_SUBSTRING: `substring(0)` written against `String`, or
//!   `StringBuilder` and `StringBuffer`; priority 2.
//! Calls are on the line of their `(`, `new` on the line javac gives it.
use super::super::super::Context;
use super::super::super::idioms::encoding::written_owner;
use super::super::super::taint::lines::line as invoke_line;
use super::super::found::{Found, Findings};
use super::super::numbers::source::called_place;
use super::super::numbers::values::{folded, operator, primitive, stores, text_constant, whole};
use super::randoms::{arguments, call_line, static_of};
use crate::java::types::constant::Constant;
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub const BIG_DECIMAL: &str = "DMI_BIGDECIMAL_CONSTRUCTED_FROM_DOUBLE";
pub const LONG_BITS: &str = "DMI_LONG_BITS_TO_DOUBLE_INVOKED_ON_INT";
pub const MIN_MAX: &str = "DM_INVALID_MIN_MAX";
pub const CONSTANT_PASSWORD: &str = "DMI_CONSTANT_DB_PASSWORD";
pub const EMPTY_PASSWORD: &str = "DMI_EMPTY_DB_PASSWORD";
pub const ABSOLUTE_FILE: &str = "DMI_HARDCODED_ABSOLUTE_FILENAME";
pub const USELESS_SUBSTRING: &str = "DMI_USELESS_SUBSTRING";
pub const MISLEADING_SUBSTRING: &str = "DMI_MISLEADING_SUBSTRING";
const FILES: &[&str] = &["java.io.File", "java.io.FileInputStream", "java.io.FileOutputStream", "java.io.FileReader", "java.io.FileWriter", "java.io.RandomAccessFile"];
pub const PATTERNS: &[&str] = &[BIG_DECIMAL, LONG_BITS, MIN_MAX, CONSTANT_PASSWORD, EMPTY_PASSWORD, ABSOLUTE_FILE, USELESS_SUBSTRING, MISLEADING_SUBSTRING];

/// `Double.toString` of a double between 10^-3 and 10^7, where it writes no exponent.
fn java_text(value: f64) -> Option<String> {
    let size = value.abs();
    if !(1e-3..1e7).contains(&size) {
        return None;
    }
    Some(decimal(format!("{value}")))
}

/// Whether a decimal text names a value a double holds exactly: its digits are a multiple of 5 to the power of
/// the number of decimals.
fn exact(text: &str) -> bool {
    let digits = text.trim_start_matches('-');
    let (whole, fraction) = digits.split_once('.').unwrap_or((digits, ""));
    let fraction = fraction.trim_end_matches('0');
    let Ok(number) = format!("{whole}{fraction}").parse::<u128>() else { return false };
    5u128.checked_pow(fraction.len() as u32).is_some_and(|power| number % power == 0)
}

fn number_text(value: Constant) -> Option<(f64, String)> {
    match value {
        Constant::Int(value) => Some((f64::from(value), value.to_string())),
        Constant::Long(value) => Some((value as f64, value.to_string())),
        Constant::Char(value) => Some((f64::from(value), value.to_string())),
        Constant::Float(value) => Some((f64::from(value), decimal(format!("{value}")))),
        Constant::Double(value) => Some((value, decimal(format!("{value}")))),
        Constant::Bool(_) => None,
    }
}

/// A floating point number as Java prints it, with at least one decimal.
fn decimal(text: String) -> String {
    if text.contains(['.', 'e', 'N', 'i']) { text } else { format!("{text}.0") }
}

fn math_call<'t>(context: &Context, node: Node<'t>) -> Option<(&'static str, Vec<Node<'t>>)> {
    let node = unwrap(node);
    let held = if node.kind() == "identifier" {
        let [store] = stores(context, node, context.text(node))[..] else { return None };
        match store.kind() {
            "variable_declarator" => store.child_by_field_name("value"),
            "assignment_expression" if operator(context, store) == "=" => store.child_by_field_name("right"),
            _ => None,
        }
        .map(unwrap)?
    } else {
        node
    };
    let name = match held.child_by_field_name("name").map(|name| context.text(name)) {
        Some("min") => "min",
        Some("max") => "max",
        _ => return None,
    };
    let listed = arguments(held);
    (held.kind() == "method_invocation" && listed.len() == 2 && static_of(context, held).as_deref() == Some("java.lang.Math")).then_some((name, listed))
}

/// The constant argument of a two-argument call and the other one.
fn split<'t>(context: &Context, listed: &[Node<'t>]) -> Option<(Constant, Node<'t>)> {
    let constant = |node: Node| folded(context, node);
    match (constant(listed[0]), constant(listed[1])) {
        (Some(value), None) => Some((value, listed[1])),
        (None, Some(value)) => Some((value, listed[0])),
        _ => None,
    }
}

/// The other kind of call inside `node`, looking through calls of the same kind with a constant bound.
fn opposite<'t>(context: &Context, node: Node<'t>, outer: &str, depth: usize) -> Option<Vec<Node<'t>>> {
    let (inner, listed) = math_call(context, node)?;
    if inner != outer {
        return Some(listed);
    }
    let (_, other) = split(context, &listed).filter(|_| depth < 4)?;
    opposite(context, other, outer, depth + 1)
}

fn always(context: &Context, node: Node) -> Option<String> {
    let (outer, listed) = math_call(context, node).filter(|_| node.kind() == "method_invocation")?;
    let (bound, other) = split(context, &listed)?;
    let inner_listed = opposite(context, other, outer, 0)?;
    let (inner_bound, _) = split(context, &inner_listed)?;
    let ((outer_value, text), (inner_value, _)) = (number_text(bound)?, number_text(inner_bound)?);
    let wrong = match outer {
        "min" => outer_value < inner_value,
        _ => outer_value > inner_value,
    };
    let promoted = context.resolver.resolve_call(node).and_then(|call| call.method.parameters.first().cloned());
    let text = match promoted {
        Some(Type::Primitive("double")) => decimal(format!("{outer_value}")),
        Some(Type::Primitive("float")) => decimal(format!("{}", outer_value as f32)),
        Some(Type::Primitive("long")) => format!("{}", outer_value as i64),
        _ => text,
    };
    wrong.then_some(text)
}

fn absolute(path: &str) -> Option<u8> {
    let bytes = path.as_bytes();
    let drive = bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':';
    let rooted = path.starts_with('/') || path.starts_with("\\\\") || drive;
    let skipped = ["/tmp", "/proc", "/etc/", "/dev/"].iter().any(|prefix| path.starts_with(prefix));
    (rooted && !skipped).then(|| if path.contains("/home") { 1 } else { 2 })
}

pub fn check<'a>(context: &Context<'a>, own: &str, node: Node<'a>, label: &str, found: &mut Findings<'a>) {
    if !context.wants(PATTERNS) {
        return;
    }
    let listed = arguments(node);
    let mut add = |pattern, priority, line, message: String, place: Option<String>, arguments: Vec<String>| {
        found.add(Found { pattern, node, line, priority, message, place, arguments });
    };
    if node.kind() == "object_creation_expression" {
        let Some(call) = context.resolver.resolve_constructor(node) else { return };
        match (call.declaring.as_str(), &call.method.parameters[..]) {
            ("java.math.BigDecimal", [Type::Primitive("double")]) => {
                let [argument] = listed[..] else { return };
                let Some(Constant::Double(value)) = folded(context, argument) else { return };
                let Some(text) = java_text(value).filter(|text| text.len() <= 8 && !exact(text)) else { return };
                let place = Some(called_place(context, node, "java.math.BigDecimal.valueOf(double)"));
                add(BIG_DECIMAL, 2, invoke_line(context, node), format!("BigDecimal constructed from {text} in {label}"), place, vec![text, label.to_string()]);
            }
            (class, [Type::Class(parameter, _), ..]) if parameter == "java.lang.String" && FILES.contains(&class) => {
                let first = listed.first().copied();
                let Some(priority) = first.and_then(|first| text_constant(context, first)).as_deref().and_then(absolute) else { return };
                add(ABSOLUTE_FILE, priority, invoke_line(context, node), format!("Hard coded reference to an absolute pathname in {label}"), None, vec![label.to_string()]);
            }
            _ => {}
        }
        return;
    }
    if node.kind() != "method_invocation" {
        return;
    }
    let line = call_line(context, node);
    let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    match (name, &listed[..]) {
        ("get" | "of", [first, ..]) if matches!(static_of(context, node).as_deref(), Some("java.nio.file.Paths" | "java.nio.file.Path")) => {
            let Some(priority) = text_constant(context, *first).as_deref().and_then(absolute) else { return };
            add(ABSOLUTE_FILE, priority, line, format!("Hard coded reference to an absolute pathname in {label}"), None, vec![label.to_string()]);
        }
        ("longBitsToDouble", [argument]) if static_of(context, node).as_deref() == Some("java.lang.Double") => {
            let mut value = unwrap(*argument);
            if value.kind() == "cast_expression" {
                value = value.child_by_field_name("value").map(unwrap).unwrap_or(value);
            }
            let widened = primitive(context, value).is_some_and(|kind| !matches!(kind, "long" | "float" | "double"));
            if widened && folded(context, value).is_none() {
                let place = Some(called_place(context, node, "Double.longBitsToDouble(long)"));
                add(LONG_BITS, 1, line, format!("Double.longBitsToDouble invoked on an int in {label}"), place, vec![label.to_string()]);
            }
        }
        ("min" | "max", _) => {
            if let Some(text) = always(context, node) {
                add(MIN_MAX, 1, line, format!("Incorrect combination of Math.max and Math.min: this code always returns {text}"), None, vec![text]);
            }
        }
        ("getConnection", [_, _, password]) if static_of(context, node).as_deref() == Some("java.sql.DriverManager") => {
            match text_constant(context, *password).as_deref() {
                Some("") => add(EMPTY_PASSWORD, 2, line, format!("Empty database password in {label}"), None, vec![label.to_string()]),
                Some(_) => add(CONSTANT_PASSWORD, 2, line, format!("Hardcoded constant database password in {label}"), None, vec![label.to_string()]),
                None => {}
            }
        }
        ("substring", [start]) if whole(context, *start) == Some(0) => match written_owner(context, own, node).as_deref() {
            Some("java.lang.String") => {
                add(USELESS_SUBSTRING, 2, line, format!("{label} invokes substring(0), which returns the original value"), None, vec![label.to_string()]);
            }
            Some("java.lang.StringBuilder" | "java.lang.StringBuffer") => {
                let message = format!("{label} invokes substring(0), which might be misleading because it returns the entire String");
                add(MISLEADING_SUBSTRING, 2, line, message, None, vec![label.to_string()]);
            }
            _ => {}
        },
        _ => {}
    }
}
