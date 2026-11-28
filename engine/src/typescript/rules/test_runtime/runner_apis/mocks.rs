//! `moduleMocks`: the modules a call replaces, by the mocking call of each test runner and mocking library.
use super::{Apis, member_name};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::testing_library::nodes::string_literal;

fn module_mocks_of(kind: &str) -> &'static [&'static str] {
    match kind {
        "vitest" => &["mock", "doMock"],
        "jest" => &["mock", "doMock", "unstable_mockModule", "setMock"],
        "node" => &["module"],
        "testdouble" => &["replace"],
        "quibble" => &["esm"],
        _ => &[],
    }
}

fn loader_mocks_of(kind: &str) -> Option<&'static [&'static str]> {
    match kind {
        "proxyquire" => Some(&["load"]),
        "esmock" => Some(&["strict", "strictest", "partial", "p"]),
        _ => None,
    }
}

fn mocked_name(node: Option<Node>) -> Option<String> {
    let node = node?;
    string_literal(if node.is("ImportExpression") { node.node("source") } else { Some(node) })
}

fn key_name(property: Node) -> Option<String> {
    if !property.is("Property") {
        return None;
    }
    let key = property.node("key")?;
    if key.is("Identifier") && !property.flag("computed") { key.name().map(|name| name.into_owned()) } else { mocked_name(Some(key)) }
}

/// The names of the modules this call replaces; a name the call does not spell out is `None`.
pub fn module_mocks(apis: &Apis, call: Node) -> Vec<Option<String>> {
    let Some(callee) = call.node("callee") else { return Vec::new() };
    let direct = callee.is("Identifier");
    let method = if direct { None } else { member_name(callee) };
    let kind = if direct {
        callee.name().and_then(|name| apis.kind_named(name.as_ref()))
    } else {
        method.as_ref().filter(|_| callee.is("MemberExpression")).and_then(|_| callee.node("object")).and_then(|object| apis.kind_of_object(object))
    }
    .unwrap_or_default();
    let method = method.unwrap_or_default();
    let arguments = call.nodes("arguments");
    if loader_mocks_of(kind).is_some_and(|methods| direct || methods.contains(&method.as_str())) {
        let objects = arguments.iter().skip(1).take(2).filter(|argument| argument.is("ObjectExpression"));
        return objects.flat_map(|argument| argument.nodes("properties")).map(key_name).collect();
    }
    let mocks = if direct { matches!(kind, "mockRequire" | "quibble") } else { module_mocks_of(kind).contains(&method.as_str()) };
    match arguments.first() {
        Some(source) if mocks => vec![mocked_name(Some(*source))],
        _ => Vec::new(),
    }
}
