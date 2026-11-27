//! The out of bounds patterns of DumbMethods: an index, offset or length known to fall outside an array or string
//! of known size, measured on test code. Every check has a range of allowed values: below it the finding carries
//! the lowest allowed value, above it the highest, and when the range is empty (an empty array or string, an
//! offset past the end) it carries neither. An unknown size counts as `Integer.MAX_VALUE`, so only negative values
//! break it, and sizes minus offsets wrap as `int` arithmetic does. Each finding is reported once per method,
//! pattern, value, broken bound and called method, priority 2.
mod arrays;
mod fields;
pub mod known;
mod strings;

use super::super::Context;
use super::found::{Found, Findings};
use super::numbers::compares::int_text;
use super::numbers::values::local_value;
use crate::java::helpers::has_modifier;
use crate::java::types::expr::unwrap;
use crate::engine::source::parent;
use known::Known;
use tree_sitter::Node;

pub const INDEX: &str = "RANGE_ARRAY_INDEX";
pub const OFFSET: &str = "RANGE_ARRAY_OFFSET";
pub const LENGTH: &str = "RANGE_ARRAY_LENGTH";
pub const STRING: &str = "RANGE_STRING_INDEX";
pub const PATTERNS: &[&str] = &[INDEX, OFFSET, LENGTH, STRING];

/// Which side of a range a value broke.
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Broke {
    Low(i32),
    High(i32),
    Empty,
}

/// How a value falls outside `low..=high`, if it does.
pub fn outside(value: i32, low: i32, high: i32) -> Option<Broke> {
    if high < low {
        Some(Broke::Empty)
    } else if value < low {
        Some(Broke::Low(low))
    } else if value > high {
        Some(Broke::High(high))
    } else {
        None
    }
}

/// A number as SpotBugs prints it in these messages.
pub fn shown(value: i32) -> String {
    int_text(i64::from(value))
}

/// Whether javac leaves the code out: inside the branch of an `if` or `?:` its constant condition never takes.
pub fn dropped(context: &Context, node: Node) -> bool {
    let mut inner = node;
    while let Some(above) = parent(inner) {
        if matches!(above.kind(), "method_declaration" | "constructor_declaration" | "lambda_expression" | "class_body") {
            return false;
        }
        let branches = match above.kind() {
            "if_statement" => Some(("consequence", "alternative")),
            "ternary_expression" => Some(("consequence", "alternative")),
            _ => None,
        };
        if let Some((yes, no)) = branches
            && let Some(taken) = above.child_by_field_name("condition").and_then(|condition| constant_condition(context, condition))
        {
            let side = if taken { no } else { yes };
            if above.child_by_field_name(side).is_some_and(|branch| branch.id() == inner.id()) {
                return true;
            }
        }
        inner = above;
    }
    false
}

/// A condition javac folds: a constant expression, or a `final` local holding one.
fn constant_condition(context: &Context, condition: Node) -> Option<bool> {
    if let Some(taken) = context.resolver.constant_boolean(condition) {
        return Some(taken);
    }
    let value = local_value(context, unwrap(condition))?;
    let declaration = parent(value).and_then(parent).filter(|declaration| declaration.kind() == "local_variable_declaration")?;
    has_modifier(declaration, "final").then(|| context.resolver.constant_boolean(value)).flatten()
}

pub struct Out<'a> {
    pub pattern: &'static str,
    pub node: Node<'a>,
    pub line: usize,
    pub value: i32,
    pub broke: Broke,
    pub message: String,
    pub place: Option<String>,
    pub arguments: Vec<String>,
    pub called: String,
}

pub fn add<'a>(found: &mut Findings<'a>, out: Out<'a>) {
    let detail = format!("{}|{:?}|{}", out.value, out.broke, out.called);
    let Out { pattern, node, line, message, place, arguments, .. } = out;
    found.add_keyed(Found { pattern, node, line, priority: 2, message, place, arguments }, detail);
}

pub fn check<'a>(context: &Context<'a>, known: &Known<'_, 'a>, own: &str, node: Node<'a>, found: &mut Findings<'a>) {
    if !context.wants(PATTERNS) || !matches!(node.kind(), "array_access" | "method_invocation" | "object_creation_expression") || dropped(context, node) {
        return;
    }
    match node.kind() {
        "array_access" => arrays::index(context, known, node, found),
        "method_invocation" | "object_creation_expression" => {
            arrays::call(context, known, own, node, found);
            strings::call(context, known, own, node, found);
        }
        _ => {}
    }
}
