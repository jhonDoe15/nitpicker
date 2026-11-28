//! `clock-durations.mts`: whether a value is the difference of two reads of the same clock, and whether a call or
//! assignment replaces the clock.
use crate::typescript::rules::support::scope::{DefKind, Reference, Scopes};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_values::{find_variable, is_write};
use std::collections::HashSet;

const PERFORMANCE: &str = "performance";
const CLOCK_OWNERS: [&str; 2] = ["Date", PERFORMANCE];
const SPIES: [&str; 3] = ["spyOn", "stub", "replace"];
const FAKE_CLOCK_LIBRARIES: [&str; 3] = ["FakeTimers", "fakeTimers", "lolex"];
const TARGET_WRAPPERS: [&str; 8] =
    ["ArrayPattern", "ObjectPattern", "Property", "AssignmentPattern", "RestElement", "TSNonNullExpression", "TSAsExpression", "TSTypeAssertion"];

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Clock {
    Date,
    Performance,
}

fn name(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn is_date_new(node: Option<Node>) -> bool {
    node.is_some_and(|node| {
        node.is("NewExpression")
            && node.node("callee").is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("Date"))
            && node.nodes("arguments").is_empty()
    })
}

/// `isWallRead`: `Date.now()`, `+new Date()`, `new Date().getTime()` or `new Date().valueOf()`.
fn is_wall_read(node: Node) -> bool {
    if node.is("UnaryExpression") {
        return node.text("operator").as_deref() == Some("+") && is_date_new(node.node("argument"));
    }
    let Some(callee) = node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression")) else { return false };
    let Some(method) = callee.node("property").filter(|property| property.is("Identifier")).and_then(|property| property.name()) else { return false };
    let object = callee.node("object");
    let is_date = object.is_some_and(|object| object.is("Identifier") && object.name().as_deref() == Some("Date"));
    (is_date && method == "now") || (is_date_new(object) && (method == "getTime" || method == "valueOf"))
}

fn read_clock(node: Node) -> Option<Clock> {
    if is_wall_read(node) {
        return Some(Clock::Date);
    }
    let callee = node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression"))?;
    let is_now = name(callee.node("object")).as_deref() == Some(PERFORMANCE) && name(callee.node("property")).as_deref() == Some("now");
    is_now.then_some(Clock::Performance)
}

/// `reference.writeExpr` of a write that is not a declaration's initializer.
fn written_by(identifier: Node) -> Option<Node> {
    let mut child = identifier;
    for parent in identifier.ancestors() {
        match parent.kind() {
            "AssignmentExpression" | "ForInStatement" | "ForOfStatement" if parent.node("left") == Some(child) => return parent.node("right"),
            kind if TARGET_WRAPPERS.contains(&kind) => child = parent,
            _ => return None,
        }
    }
    None
}

/// typescript-eslint unwraps one `as`, `<T>` or `!` around the target of an assignment or update and records no
/// write through any other wrapper there.
fn is_target_write(reference: &Reference) -> bool {
    if !is_write(reference) {
        return false;
    }
    let mut wrappers = Vec::new();
    let mut child = reference.identifier;
    for parent in reference.identifier.ancestors() {
        let target = (parent.is("AssignmentExpression") && parent.node("left") == Some(child)) || parent.is("UpdateExpression");
        if target {
            return match wrappers.as_slice() {
                [] => true,
                [only] => ["TSAsExpression", "TSTypeAssertion", "TSNonNullExpression"].contains(only),
                _ => false,
            };
        }
        if !matches!(parent.kind(), "TSAsExpression" | "TSTypeAssertion" | "TSNonNullExpression" | "TSSatisfiesExpression") {
            return true;
        }
        wrappers.push(parent.kind());
        child = parent;
    }
    true
}

/// `heldValues`: the values a name holds, `None` standing for one the analysis cannot see.
fn held_values<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Vec<Option<Node<'s>>> {
    if !node.is("Identifier") {
        return vec![Some(node)];
    }
    let Some(symbol) = find_variable(scopes, node) else { return vec![None] };
    let defs = scopes.defs(symbol);
    let [only] = defs.as_slice() else { return vec![None] };
    if !only.node.is("VariableDeclarator") {
        return vec![None];
    }
    let declared: HashSet<u32> = defs.iter().filter(|def| def.kind == DefKind::Variable).map(|def| def.name.start()).collect();
    let mut values: Vec<Option<Node>> = only.node.node("init").map(Some).into_iter().collect();
    let assigned = scopes.references(symbol).into_iter().filter(|reference| is_target_write(reference) && !declared.contains(&reference.identifier.start()));
    values.extend(assigned.map(|reference| written_by(reference.identifier)));
    values
}

fn clock_of(scopes: &Scopes, node: Option<Node>) -> Option<Clock> {
    let clocks: HashSet<Option<Clock>> = held_values(scopes, node?).into_iter().map(|value| value.and_then(read_clock)).collect();
    if clocks.len() == 1 { clocks.into_iter().next().flatten() } else { None }
}

fn declared_at(scopes: &Scopes, node: Option<Node>) -> Option<u32> {
    let node = node.filter(|node| node.is("Identifier"))?;
    scopes.defs(find_variable(scopes, node)?).first().map(|def| def.node.start())
}

fn is_later_read(scopes: &Scopes, later: Option<Node>, earlier: Option<Node>) -> bool {
    let Some(later_at) = declared_at(scopes, later) else { return true };
    declared_at(scopes, earlier).is_some_and(|earlier_at| later_at > earlier_at)
}

fn is_clock_difference(scopes: &Scopes, node: Node) -> bool {
    if !node.is("BinaryExpression") || node.text("operator").as_deref() != Some("-") {
        return false;
    }
    let (left, right) = (node.node("left"), node.node("right"));
    let clock = clock_of(scopes, left);
    clock.is_some() && clock == clock_of(scopes, right) && is_later_read(scopes, left, right)
}

/// `isMeasuredDuration`: every value the expression holds is a later read of a clock minus an earlier one.
pub fn is_measured_duration(scopes: &Scopes, node: Node) -> bool {
    let values = held_values(scopes, node);
    !values.is_empty() && values.into_iter().all(|value| value.is_some_and(|value| is_clock_difference(scopes, value)))
}

fn literal_text(node: Option<Node>) -> Option<String> {
    let node = node.filter(|node| node.is("Literal") && matches!(node.get("value"), Value::Text(..)))?;
    node.text("value").map(|value| value.into_owned())
}

fn replaces_by_call(call: Node) -> bool {
    let Some(callee) = call.node("callee") else { return false };
    let method = name(if callee.is("MemberExpression") { callee.node("property") } else { Some(callee) }).unwrap_or_default();
    let arguments = call.list("arguments");
    let argument = |at: usize| arguments.get(at).copied().flatten();
    if SPIES.contains(&method.as_str()) {
        return name(argument(0)).is_some_and(|owner| CLOCK_OWNERS.contains(&owner.as_str())) && literal_text(argument(1)).as_deref() == Some("now");
    }
    if method == "stubGlobal" {
        return literal_text(argument(0)).is_some_and(|owner| CLOCK_OWNERS.contains(&owner.as_str()));
    }
    method == "install"
        && callee.is("MemberExpression")
        && name(callee.node("object")).is_some_and(|library| FAKE_CLOCK_LIBRARIES.contains(&library.as_str()))
}

/// `replacesClock`: a spy, stub or global stub of `Date.now` or `performance.now`, an installed fake clock, or an
/// assignment to `Date.now` or `performance.now`.
pub fn replaces_clock(node: Node) -> bool {
    if node.is("CallExpression") {
        return replaces_by_call(node);
    }
    let Some(left) = node.node("left").filter(|left| node.is("AssignmentExpression") && left.is("MemberExpression")) else { return false };
    name(left.node("object")).is_some_and(|owner| CLOCK_OWNERS.contains(&owner.as_str())) && name(left.node("property")).as_deref() == Some("now")
}
