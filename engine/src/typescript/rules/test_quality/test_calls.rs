//! `test-calls.mts`: suite and case calls of the test runners, and the function a case runs, with the runner
//! binding followed through `const` extensions such as `const test = base.extend(...)`.
use crate::typescript::rules::security_values::{defs, is_function_node};
use crate::typescript::rules::support::scope::{Def, DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};

const SUITE_NAMES: &[&str] = &["describe", "suite", "context"];
const CASE_NAMES: &[&str] = &["it", "test", "specify", "xit", "fit", "xtest"];
const TEST_MODULES: &[&str] = &["vitest", "jest", "node:test", "mocha", "@jest/globals", "@playwright/test"];
const MODIFIERS: &[&str] = &[
    "only", "skip", "todo", "concurrent", "sequential", "shuffle", "each", "for", "fails", "failing", "runIf", "skipIf", "serial",
    "parallel", "fixme",
];
const MAX_EXTENSION_DEPTH: usize = 4;
const NOT_TESTS: &[&str] = &["step", "describe", "beforeEach", "afterEach", "beforeAll", "afterAll", "use", "extend"];
const FUNCTIONS: &[&str] = &["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"];

#[derive(PartialEq)]
enum Shape {
    Suite,
    Case,
}

fn link_of(current: Node) -> Option<Node> {
    match current.kind() {
        "CallExpression" => current.node("callee"),
        "TaggedTemplateExpression" => current.node("tag"),
        "MemberExpression" => current.node("object"),
        _ => None,
    }
}

/// `chainOf(start, next)`.
pub fn chain_of<'v>(start: Option<Node<'v>>, next: impl Fn(Node<'v>) -> Option<Node<'v>>) -> Vec<Node<'v>> {
    let mut nodes: Vec<Node> = start.into_iter().collect();
    while let Some(following) = nodes.last().and_then(|last| next(*last)) {
        nodes.push(following);
    }
    nodes
}

fn links(callee: Node) -> Vec<Node> {
    chain_of(Some(callee), link_of)
}

fn root_identifier(callee: Node) -> Option<Node> {
    links(callee).last().copied().filter(|root| root.is("Identifier"))
}

fn name(node: Node) -> String {
    node.name().map(|name| name.into_owned()).unwrap_or_default()
}

fn member_names(callee: Node) -> Vec<Option<String>> {
    let mut names: Vec<Option<String>> = links(callee)
        .into_iter()
        .filter(|link| link.is("MemberExpression"))
        .map(|link| if link.flag("computed") { None } else { link.node("property").and_then(|property| property.name()).map(|name| name.into_owned()) })
        .collect();
    names.reverse();
    names
}

fn shape(node: Node) -> Option<Shape> {
    if !node.is("CallExpression") {
        return None;
    }
    let callee = node.node("callee")?;
    let root = root_identifier(callee).map(name).unwrap_or_default();
    let names = member_names(callee);
    let playwright_suite = CASE_NAMES.contains(&root.as_str()) && names.first().cloned().flatten().as_deref() == Some("describe");
    let modifiers = if playwright_suite { &names[1..] } else { &names[..] };
    if !modifiers.iter().all(|name| name.as_deref().is_some_and(|name| MODIFIERS.contains(&name))) {
        return None;
    }
    if playwright_suite || SUITE_NAMES.contains(&root.as_str()) {
        return Some(Shape::Suite);
    }
    CASE_NAMES.contains(&root.as_str()).then_some(Shape::Case)
}

fn is_require_of_test_module(init: Option<Node>) -> bool {
    let Some(init) = init.filter(|init| init.is("CallExpression")) else { return false };
    let callee = init.node("callee").filter(|callee| callee.is("Identifier"));
    let first = init.list("arguments").first().copied().flatten();
    callee.is_some_and(|callee| callee.name().as_deref() == Some("require"))
        && first.is_some_and(|first| {
            first.is("Literal") && matches!(first.get("value"), Value::Text(..)) && first.text("value").is_some_and(|value| TEST_MODULES.contains(&value.as_ref()))
        })
}

fn is_test_source(definition: &Def) -> bool {
    match definition.kind {
        DefKind::ImportBinding => definition.node.parent().is_some_and(|parent| {
            parent.is("ImportDeclaration") && parent.node("source").and_then(|source| source.text("value")).is_some_and(|value| TEST_MODULES.contains(&value.as_ref()))
        }),
        DefKind::Variable => is_require_of_test_module(definition.node.node("init")),
        _ => false,
    }
}

fn is_const(definition: &Def) -> bool {
    definition.kind == DefKind::Variable && definition.node.parent().and_then(|declaration| declaration.text("kind")).as_deref() == Some("const")
}

fn extended_from<'v>(definition: &Def<'v>) -> Option<Node<'v>> {
    if is_const(definition) { definition.node.node("init").and_then(root_identifier) } else { None }
}

fn is_test_binding(scopes: &Scopes, identifier: Node) -> bool {
    let mut current = identifier;
    let mut found = defs(scopes, current);
    let mut depth = 0;
    while depth < MAX_EXTENSION_DEPTH
        && let [only] = found.as_slice()
        && !is_test_source(only)
        && let Some(next) = extended_from(only)
    {
        current = next;
        found = defs(scopes, current);
        depth += 1;
    }
    match found.first() {
        None => CASE_NAMES.contains(&name(current).as_str()),
        Some(definition) => is_test_source(definition),
    }
}

pub fn is_test_function_chain(node: Node) -> bool {
    root_identifier(node).map(name).is_some_and(|root| SUITE_NAMES.contains(&root.as_str()) || CASE_NAMES.contains(&root.as_str()))
}

pub fn chain_has_property(callee: Node, wanted: &str) -> bool {
    links(callee).into_iter().any(|link| {
        link.is("MemberExpression") && !link.flag("computed") && link.node("property").and_then(|property| property.name()).as_deref() == Some(wanted)
    })
}

pub fn is_suite_call(node: Node) -> bool {
    shape(node) == Some(Shape::Suite)
}

pub fn is_case_call(node: Node) -> bool {
    shape(node) == Some(Shape::Case)
}

fn is_inline_function(node: Node) -> bool {
    node.is("ArrowFunctionExpression") || node.is("FunctionExpression")
}

pub fn callback_of(call: Node) -> Option<Node> {
    call.nodes("arguments").into_iter().find(|argument| is_inline_function(*argument))
}

/// `resolveFunction`: the function a name stands for, when it has one definition.
pub fn resolve_function<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Node<'s>> {
    let node = node.filter(|node| node.is("Identifier"))?;
    let found = defs(scopes, node);
    let [definition] = found.as_slice() else { return None };
    if definition.kind == DefKind::FunctionName {
        return Some(definition.node);
    }
    if is_const(definition) {
        return definition.node.node("init").filter(|init| is_function_node(*init));
    }
    None
}

/// `resolvedFunction`: the same, when it is a function with a body.
pub fn resolved_function<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Node<'s>> {
    resolve_function(scopes, node).filter(|function| is_function_node(*function))
}

fn test_function_of<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> Option<Node<'s>> {
    call.nodes("arguments").into_iter().find_map(|argument| {
        if is_inline_function(argument) {
            return Some(argument);
        }
        resolved_function(scopes, Some(argument)).or_else(|| if argument.is("CallExpression") { callback_of(argument) } else { None })
    })
}

pub fn enclosing_function(node: Node) -> Option<Node> {
    node.ancestors().find(|ancestor| FUNCTIONS.contains(&ancestor.kind()))
}

pub fn callback_owner(function: Option<Node>) -> Option<Node> {
    let function = function?;
    function.parent().filter(|parent| parent.is("CallExpression") && parent.nodes("arguments").contains(&function))
}

/// `testCallback`: the function a case call runs, when the call is a real case of a test runner.
pub fn test_callback<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> Option<Node<'s>> {
    let callee = call.node("callee")?;
    let root = if is_case_call(call) { root_identifier(callee) } else { None }?;
    let called = call.parent().is_some_and(|parent| parent.has("callee") && parent.node("callee") == Some(call));
    if called || NOT_TESTS.iter().any(|name| chain_has_property(callee, name)) || !is_test_binding(scopes, root) {
        return None;
    }
    test_function_of(scopes, call)
}

pub fn is_nested_test(scopes: &Scopes, node: Node) -> bool {
    if !is_function_node(node) {
        return false;
    }
    let call = node.parent().filter(|parent| parent.is("CallExpression"));
    let outer = call.and_then(|call| call.parent()).filter(|parent| parent.is("CallExpression"));
    call.is_some_and(|call| test_callback(scopes, call) == Some(node)) || outer.is_some_and(|outer| test_callback(scopes, outer) == Some(node))
}
