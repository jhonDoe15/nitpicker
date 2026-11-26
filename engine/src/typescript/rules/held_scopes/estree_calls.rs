//! The ESTree side of the effects rules: a call's view read from the engine's ESTree-shaped tree, the calls
//! of a body that run while it runs, and whether a function runs with its caller.
use crate::typescript::rules::effects::flow::is_sync_callee;
use crate::typescript::rules::effects::views::{Argument, CallView, Literal, SPREAD, Step, view_of};
use crate::typescript::rules::support::view::Node;
use std::collections::HashSet;

const TEXT_KEYS: [&str; 2] = ["text", "sql"];

pub fn is_function(node: Node) -> bool {
    matches!(node.kind(), "ArrowFunctionExpression" | "FunctionExpression" | "FunctionDeclaration")
}

fn wrapped(node: Node) -> Option<Node> {
    match node.kind() {
        "AwaitExpression" => node.node("argument"),
        "ChainExpression" | "TSNonNullExpression" | "TSAsExpression" | "TSSatisfiesExpression" => node.node("expression"),
        _ => None,
    }
}

fn step<'v>(node: &Node<'v>) -> Step<Node<'v>, Node<'v>> {
    let mut step = Step::empty();
    if let Some(inner) = wrapped(*node) {
        step.next = Some(inner);
    } else if node.is("MemberExpression") {
        step.name = if node.flag("computed") { Some("[]".to_string()) } else { node.node("property").and_then(|property| property.name()).map(|name| name.into_owned()) };
        step.next = node.node("object");
    } else if node.is("CallExpression") {
        step.next = node.node("callee");
        step.called = true;
    } else if node.is("Identifier") {
        step.name = node.name().map(|name| name.into_owned());
        step.root = Some(*node);
    } else if node.is("ThisExpression") {
        step.name = Some("this".to_string());
    }
    step
}

fn text_of(node: Node) -> Option<String> {
    if node.is("Literal") && matches!(node.get("value"), crate::typescript::rules::support::view::Value::Text(..)) {
        return node.text("value").map(|text| text.into_owned());
    }
    if node.is("TemplateLiteral") {
        let parts: Vec<String> = node.nodes("quasis").iter().map(|quasi| quasi.node("value").and_then(|value| value.text("raw")).map(|raw| raw.into_owned()).unwrap_or_default()).collect();
        return Some(parts.join("?"));
    }
    None
}

fn children<'v>(node: Node<'v>) -> Vec<(Option<String>, Option<Node<'v>>)> {
    if node.is("ArrayExpression") {
        return node.list("elements").into_iter().map(|element| (None, element)).collect();
    }
    if !node.is("ObjectExpression") {
        return Vec::new();
    }
    node.nodes("properties")
        .into_iter()
        .map(|property| {
            let plain = property.is("Property");
            let key = if plain && !property.flag("computed") { property.node("key").and_then(|key| key.name()).map(|name| name.into_owned()) } else { Some(SPREAD.to_string()) };
            (key, if plain { property.node("value") } else { None })
        })
        .collect()
}

fn deep_keys(root: Node) -> HashSet<String> {
    let mut keys = HashSet::new();
    let mut pending = vec![root];
    while let Some(node) = pending.pop() {
        for (key, value) in children(node) {
            keys.extend(key);
            pending.extend(value);
        }
    }
    keys
}

fn literal(node: Node) -> Literal {
    if let Some(text) = text_of(node) {
        return Literal::Text(text);
    }
    match node.kind() {
        "ArrowFunctionExpression" | "FunctionExpression" => Literal::Function,
        "Literal" if matches!(node.get("regex"), crate::typescript::rules::support::view::Value::Node(_)) => Literal::Pattern,
        "ObjectExpression" => {
            let statement = node.nodes("properties").into_iter().find(|property| {
                property.is("Property") && property.node("key").and_then(|key| key.name()).is_some_and(|name| TEXT_KEYS.contains(&name.as_ref()))
            });
            Literal::Object { keys: deep_keys(node), text: statement.and_then(|statement| statement.node("value")).and_then(text_of) }
        }
        "ArrayExpression" => Literal::Object { keys: deep_keys(node), text: None },
        _ => Literal::Other,
    }
}

fn argument(node: Node) -> Argument {
    if node.is("NewExpression") {
        if let Some(name) = node.node("callee").filter(|callee| callee.is("Identifier")).and_then(|callee| callee.name()) {
            return Argument::New { name: name.into_owned(), input: node.nodes("arguments").first().map(|input| literal(*input)) };
        }
    }
    Argument::Literal(literal(node))
}

/// `estreeCallView(call, undefined)`: no constants resolved. `textual` is left false: only the untyped
/// guess by names reads it, and these rules always have types.
pub fn call_view<'v>(call: Node<'v>) -> Option<CallView<Node<'v>>> {
    let tagged = call.is("TaggedTemplateExpression");
    let callee = if tagged { call.node("tag") } else { call.node("callee") }?;
    let args = if tagged { call.node("quasi").map(|quasi| vec![Argument::Literal(literal(quasi))]).unwrap_or_default() } else { call.nodes("arguments").into_iter().map(argument).collect() };
    Some(view_of(callee, step, args, false))
}

/// `calleeNameOf`.
pub fn callee_name(callee: Node) -> Option<String> {
    if callee.is("Identifier") {
        return callee.name().map(|name| name.into_owned());
    }
    let plain = callee.is("MemberExpression") && !callee.flag("computed");
    callee.node("property").filter(|_| plain).and_then(|property| property.name()).map(|name| name.into_owned())
}

/// `estreeRunsWithCaller`.
pub fn runs_with_caller(function: Node) -> bool {
    let Some(parent) = function.parent() else { return false };
    if parent.is("CallExpression") && parent.node("callee") == Some(function) {
        return true;
    }
    let is_argument = (parent.is("CallExpression") || parent.is("NewExpression")) && parent.nodes("arguments").contains(&function);
    if !is_argument {
        return false;
    }
    let name = parent.node("callee").and_then(callee_name);
    if parent.is("NewExpression") { name.as_deref() == Some("Promise") } else { name.is_some_and(|name| is_sync_callee(&name)) }
}

/// `callsWithin`: calls and tagged templates under the root that run while it runs, in source order.
pub fn calls_within(root: Node) -> Vec<Node> {
    let mut calls = Vec::new();
    let mut pending = vec![root];
    while let Some(node) = pending.pop() {
        if node.is("CallExpression") || node.is("TaggedTemplateExpression") {
            calls.push(node);
        }
        pending.extend(node.children().into_iter().filter(|child| !is_function(*child) || runs_with_caller(*child)));
    }
    calls.sort_by_key(|call| call.start());
    calls
}
