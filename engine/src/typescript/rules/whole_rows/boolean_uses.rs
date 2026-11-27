//! `isBooleanUse` and `isCountTest`: a value read only as a yes or no, or a count only compared with zero or one.
use crate::typescript::rules::query_rows::loaded::outer_of;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::writes::syntax::unwrapped;

const EQUALITY: [&str; 4] = ["===", "!==", "==", "!="];
const TESTS: [&str; 4] = ["IfStatement", "WhileStatement", "DoWhileStatement", "ConditionalExpression"];

fn count_tests(operator: &str) -> Option<f64> {
    match operator {
        ">" | "<=" | "===" | "==" | "!==" | "!=" => Some(0.0),
        ">=" | "<" => Some(1.0),
        _ => None,
    }
}

fn mirrored(operator: &str) -> &str {
    match operator {
        ">" => "<",
        "<" => ">",
        ">=" => "<=",
        "<=" => ">=",
        other => other,
    }
}

fn is_absent(node: Node) -> bool {
    let target = unwrapped(node);
    (target.is("Literal") && target.text("raw").as_deref() == Some("null")) || (target.is("Identifier") && target.name().as_deref() == Some("undefined"))
}

fn other_side<'v>(binary: Node<'v>, outer: Node<'v>) -> Option<Node<'v>> {
    if binary.node("left") == Some(outer) { binary.node("right") } else { binary.node("left") }
}

pub fn is_boolean_use(site: Node) -> bool {
    let outer = outer_of(site);
    let Some(parent) = outer.parent() else { return false };
    if TESTS.contains(&parent.kind()) && parent.node("test") == Some(outer) {
        return true;
    }
    if parent.is("UnaryExpression") {
        return parent.text("operator").as_deref() == Some("!");
    }
    let boolean = parent.is("CallExpression")
        && parent.node("callee").is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("Boolean"))
        && parent.nodes("arguments").first() == Some(&outer);
    let operator = parent.text("operator");
    let absent = parent.is("BinaryExpression")
        && operator.as_deref().is_some_and(|operator| EQUALITY.contains(&operator))
        && other_side(parent, outer).is_some_and(is_absent);
    boolean || absent
}

pub fn is_count_test(site: Node) -> bool {
    let outer = outer_of(site);
    let Some(parent) = outer.parent().filter(|parent| parent.is("BinaryExpression")) else { return is_boolean_use(site) };
    let Some(other) = other_side(parent, outer).map(unwrapped) else { return false };
    let written = parent.text("operator").map(|operator| operator.into_owned()).unwrap_or_default();
    let operator = if parent.node("left") == Some(outer) { written.as_str() } else { mirrored(&written) };
    let tested = count_tests(operator);
    match (other.is("Literal"), tested, other.get("value")) {
        (true, Some(wanted), Value::Number(number)) => number == wanted,
        _ => false,
    }
}
