//! `completion.mts`: a host inside a promise executor whose promise the test awaits or returns, or inside a
//! scheduler's `run` callback, is owned by the test.
use super::nodes::{name, property_name, uses_of};
use crate::typescript::rules::security_values::is_function_node;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_quality::test_calls::enclosing_function;
use regex::Regex;
use std::sync::LazyLock;

const CARRIERS: &[&str] = &[
    "ArrayExpression", "ConditionalExpression", "LogicalExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression",
    "ChainExpression", "CallExpression", "NewExpression", "MemberExpression", "SpreadElement",
];
const COLLECTING_METHODS: &[&str] = &["push", "unshift"];

static SCHEDULER_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)scheduler").unwrap());

fn is_promise_executor(node: Node) -> bool {
    let owner = node.parent().filter(|owner| owner.is("NewExpression"));
    is_function_node(node)
        && owner.is_some_and(|owner| {
            owner.node("callee").is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("Promise"))
                && owner.list("arguments").first().copied().flatten() == Some(node)
        })
}

fn is_completion(parent: Node, node: Node, test: Node) -> bool {
    if parent.is("AwaitExpression") || parent.is("YieldExpression") {
        return true;
    }
    if parent.is("ReturnStatement") {
        return enclosing_function(parent) == Some(test);
    }
    parent == test && parent.has("body") && parent.node("body") == Some(node)
}

fn bound_identifier<'v>(parent: Node<'v>, node: Node<'v>) -> Option<Node<'v>> {
    if node.is("FunctionDeclaration") {
        return node.node("id");
    }
    if parent.is("VariableDeclarator") && parent.node("init") == Some(node) {
        return parent.node("id");
    }
    if parent.is("AssignmentExpression") && parent.node("right") == Some(node) { parent.node("left") } else { None }
}

fn collecting_array<'v>(parent: Node<'v>, node: Node<'v>) -> Option<Node<'v>> {
    let callee = parent.node("callee").filter(|callee| parent.is("CallExpression") && callee.is("MemberExpression"))?;
    if !parent.nodes("arguments").contains(&node) {
        return None;
    }
    let collects = property_name(Some(callee)).is_some_and(|method| COLLECTING_METHODS.contains(&method.as_str()));
    if collects { callee.node("object") } else { None }
}

fn enclosing_value<'v>(parent: Node<'v>, node: Node<'v>) -> Vec<Node<'v>> {
    if parent.is("ReturnStatement") {
        return enclosing_function(parent).into_iter().collect();
    }
    if parent.is("ArrowFunctionExpression") && parent.node("body") == Some(node) {
        return vec![parent];
    }
    if parent.is("Property") && parent.node("value") == Some(node) { parent.parent().into_iter().collect() } else { Vec::new() }
}

/// `carriedTo`: `None` when the value completes the test, else the nodes it flows into.
fn carried_to<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, test: Node<'s>) -> Option<Vec<Node<'s>>> {
    let Some(parent) = node.parent() else { return Some(Vec::new()) };
    if is_completion(parent, node, test) {
        return None;
    }
    let mut next: Vec<Node> = if CARRIERS.contains(&parent.kind()) { vec![parent] } else { Vec::new() };
    next.extend(enclosing_value(parent, node));
    next.extend(uses_of(scopes, bound_identifier(parent, node)));
    next.extend(uses_of(scopes, collecting_array(parent, node)));
    Some(next)
}

fn is_completed<'s>(scopes: &Scopes<'_, 's>, promise: Node<'s>, test: Node<'s>) -> bool {
    let mut pending = vec![promise];
    let mut index = 0;
    while index < pending.len() {
        let Some(next) = carried_to(scopes, pending[index], test) else { return true };
        for node in next {
            if !pending.contains(&node) {
                pending.push(node);
            }
        }
        index += 1;
    }
    false
}

/// `ancestors.slice(0, ancestors.indexOf(test))`, which drops the last ancestor when the test is not one.
pub fn ancestors_below<'v>(node: Node<'v>, test: Node<'v>) -> Vec<Node<'v>> {
    let mut ancestors: Vec<Node> = node.ancestors().collect();
    match ancestors.iter().position(|ancestor| *ancestor == test) {
        Some(at) => ancestors.truncate(at),
        None => {
            ancestors.pop();
        }
    }
    ancestors
}

pub fn is_inside_completed_promise<'s>(scopes: &Scopes<'_, 's>, host: Node<'s>, test: Node<'s>) -> bool {
    let executors = ancestors_below(host, test).into_iter().filter(|ancestor| is_promise_executor(*ancestor));
    executors.into_iter().any(|executor| executor.parent().is_some_and(|promise| is_completed(scopes, promise, test)))
}

fn is_scheduler_callback(node: Node) -> bool {
    let Some(call) = node.parent().filter(|call| call.is("CallExpression")) else { return false };
    let callee = call.node("callee");
    let is_argument = is_function_node(node) && call.nodes("arguments").contains(&node);
    let object = callee.filter(|callee| is_argument && callee.is("MemberExpression")).and_then(|callee| callee.node("object"));
    let receiver = match object {
        Some(object) if object.is("Identifier") => name(Some(object)),
        object => property_name(object),
    };
    property_name(callee).as_deref() == Some("run") && SCHEDULER_NAME.is_match(&receiver.unwrap_or_default())
}

pub fn is_inside_scheduler(host: Node, test: Node) -> bool {
    ancestors_below(host, test).into_iter().any(is_scheduler_callback)
}
