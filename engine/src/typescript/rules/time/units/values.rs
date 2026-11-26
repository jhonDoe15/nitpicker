//! `unit-values.mts`: the unit a value is in, read from names, clocks and arithmetic.
use super::constants::{Env, const_init, constant_number};
use super::names::{Unit, converted_unit, is_epoch_name, unit_of_call_name, unit_of_name};
use super::nodes::{callee_text, property_name, string_literal, unwrap};
use crate::typescript::rules::support::view::Node;

#[derive(Clone, Copy, PartialEq, Debug)]
pub struct UnitValue {
    pub unit: Unit,
    pub epoch: bool,
}

type Found = Option<UnitValue>;

const MAX_DEPTH: usize = 8;
const CLAIMS: [&str; 4] = ["exp", "iat", "nbf", "auth_time"];
const CLAIMS_OWNERS: [&str; 5] = ["token", "claim", "payload", "jwt", "decode"];
const ROUNDING: [&str; 5] = ["floor", "round", "ceil", "trunc", "abs"];
const NUMBER_WRAPPERS: [&str; 4] = ["Number", "parseInt", "parseFloat", "BigInt"];
const EPOCH_CALLS: [&str; 3] = ["Date.now", "Date.parse", "Date.UTC"];
const CLOCK_CALLS: [(&str, Unit); 3] =
    [("performance.now", Unit::Ms), ("process.uptime", Unit::S), ("hrtime.bigint", Unit::Ns)];
const NARROWING: [&str; 5] = ["|", ">>", "<<", ">>>", "^"];
const ARITHMETIC: [&str; 4] = ["*", "/", "+", "-"];
const KEEPING_CALLS: [&str; 2] = ["Math.max", "Math.min"];

fn named(name: &str, unit: Option<Unit>) -> Found {
    unit.map(|unit| UnitValue { unit, epoch: is_epoch_name(name) })
}

fn member_unit(node: Node) -> Found {
    let name = property_name(node)?;
    if CLAIMS.contains(&&*name) {
        let owner = node.node("object").and_then(callee_text).unwrap_or_default().to_lowercase();
        if CLAIMS_OWNERS.iter().any(|word| owner.contains(word)) {
            return Some(UnitValue { unit: Unit::S, epoch: true });
        }
    }
    named(&name, unit_of_name(&name))
}

fn same_unit(units: &[Found]) -> Found {
    let known: Vec<UnitValue> = units.iter().flatten().copied().collect();
    let first = *known.first()?;
    known.iter().all(|found| found.unit == first.unit).then_some(first)
}

fn passes_unit(text: &str, last: &str) -> bool {
    (text.starts_with("Math.") && ROUNDING.contains(&last)) || NUMBER_WRAPPERS.contains(&text)
}

fn last_segment(text: &str) -> &str {
    text.rsplit('.').next().unwrap_or("")
}

fn clock_unit(text: &str) -> Option<Unit> {
    let matches = |call: &str| text == call || text.strip_suffix(call).is_some_and(|head| head.ends_with('.'));
    CLOCK_CALLS.iter().find(|(call, _)| matches(call)).map(|(_, unit)| *unit)
}

fn call_operands<'s>(node: Node<'s>) -> Vec<Node<'s>> {
    let text = node.node("callee").and_then(callee_text).unwrap_or_default();
    let arguments = node.nodes("arguments");
    if passes_unit(&text, last_segment(&text)) {
        return arguments.into_iter().take(1).collect();
    }
    if KEEPING_CALLS.contains(&text.as_str()) { arguments } else { Vec::new() }
}

fn call_unit(node: Node, values: &[Found]) -> Found {
    let text = node.node("callee").and_then(callee_text).unwrap_or_default();
    let last = last_segment(&text);
    if EPOCH_CALLS.contains(&text.as_str()) {
        return Some(UnitValue { unit: Unit::Ms, epoch: true });
    }
    if let Some(unit) = clock_unit(&text) {
        return Some(UnitValue { unit, epoch: false });
    }
    if last == "getTime" && node.nodes("arguments").is_empty() {
        return Some(UnitValue { unit: Unit::Ms, epoch: true });
    }
    if passes_unit(&text, last) {
        return values.first().copied().flatten();
    }
    if KEEPING_CALLS.contains(&text.as_str()) {
        return same_unit(values);
    }
    named(last, unit_of_call_name(last))
}

fn scaled<'a, 's>(env: Env<'a, 's>, node: Node<'s>, operator: &str, (left, right): (Found, Found)) -> Found {
    let left_factor = constant_number(env, node.node("left"));
    let right_factor = constant_number(env, node.node("right"));
    if let (Some(left), None, Some(factor)) = (left, right, right_factor) {
        return converted_unit(left.unit, factor, operator).map(|unit| UnitValue { unit, epoch: left.epoch });
    }
    if let (true, Some(right), None, Some(factor)) = (operator == "*", right, left, left_factor) {
        return converted_unit(right.unit, factor, "*").map(|unit| UnitValue { unit, epoch: right.epoch });
    }
    None
}

pub fn mismatch(left: Found, right: Found) -> bool {
    matches!((left, right), (Some(left), Some(right)) if left.unit != right.unit)
}

fn is_text(node: Node) -> bool {
    let target = unwrap(node);
    target.is("TemplateLiteral") || string_literal(target).is_some()
}

fn additive<'a, 's>(env: Env<'a, 's>, node: Node<'s>, operator: &str, (left, right): (Found, Found)) -> Found {
    let texty = node.node("left").is_some_and(is_text) || node.node("right").is_some_and(is_text);
    if texty || mismatch(left, right) {
        return None;
    }
    let unit = left.or(right)?.unit;
    let epoch = if operator == "-" {
        left.is_some_and(|left| left.epoch) && constant_number(env, node.node("right")).is_some()
    } else {
        left.is_some_and(|left| left.epoch) || right.is_some_and(|right| right.epoch)
    };
    Some(UnitValue { unit, epoch })
}

pub fn is_narrowing<'a, 's>(env: Env<'a, 's>, node: Node<'s>) -> bool {
    node.is("BinaryExpression")
        && node.text("operator").is_some_and(|operator| NARROWING.contains(&&*operator))
        && constant_number(env, node.node("right")) == Some(0.0)
}

fn binary_operands<'a, 's>(env: Env<'a, 's>, node: Node<'s>) -> Vec<Node<'s>> {
    if node.text("operator").is_some_and(|operator| ARITHMETIC.contains(&&*operator)) {
        return node.node("left").into_iter().chain(node.node("right")).collect();
    }
    if is_narrowing(env, node) { node.node("left").into_iter().collect() } else { Vec::new() }
}

fn binary_unit<'a, 's>(env: Env<'a, 's>, node: Node<'s>, values: &[Found]) -> Found {
    let pair = (values.first().copied().flatten(), values.get(1).copied().flatten());
    match node.text("operator").as_deref() {
        Some(operator @ ("*" | "/")) => scaled(env, node, operator, pair),
        Some(operator @ ("+" | "-")) => additive(env, node, operator, pair),
        _ => pair.0,
    }
}

fn operands<'a, 's>(env: Env<'a, 's>, node: Node<'s>, depth: usize) -> Vec<Node<'s>> {
    let target = unwrap(node);
    if depth > MAX_DEPTH {
        return Vec::new();
    }
    match target.kind() {
        "Identifier" => {
            let named_unit = target.name().is_some_and(|name| unit_of_name(&name).is_some());
            if named_unit { Vec::new() } else { const_init(env, target).into_iter().collect() }
        }
        "CallExpression" => call_operands(target),
        "BinaryExpression" => binary_operands(env, target),
        "ConditionalExpression" => target.node("consequent").into_iter().chain(target.node("alternate")).collect(),
        _ => Vec::new(),
    }
}

fn combined<'a, 's>(env: Env<'a, 's>, node: Node<'s>, values: &[Found]) -> Found {
    let target = unwrap(node);
    match target.kind() {
        "Identifier" => {
            let name = target.name().unwrap_or_default();
            named(&name, unit_of_name(&name)).or(values.first().copied().flatten())
        }
        "MemberExpression" => member_unit(target),
        "CallExpression" => call_unit(target, values),
        "BinaryExpression" => binary_unit(env, target, values),
        "ConditionalExpression" => same_unit(values),
        _ => None,
    }
}

fn fold<'a, 's>(env: Env<'a, 's>, node: Node<'s>, depth: usize) -> Found {
    let children = operands(env, node, depth);
    let values: Vec<Found> = children.into_iter().map(|operand| fold(env, operand, depth + 1)).collect();
    combined(env, node, &values)
}

pub fn value_unit<'a, 's>(env: Env<'a, 's>, node: Node<'s>) -> Found {
    fold(env, node, 0)
}
