use super::react_names::{binding_names, is_react_expression, spied_hook_name};
use super::wrappers::Wrappers;
use super::{is_hook_name, member_name, static_name};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::testing_library::scope::mocks::{self, Apis};
use std::collections::HashSet;

const RULE: &str = "react-test-no-implementation-details";
const ADVICE: &str = "Assert what the user sees with `screen.getByRole(...)`";
const INSTANCE_METHODS: &[&str] = &["instance", "getInstance", "state", "setState", "findByType", "findAllByType", "findByProps", "findAllByProps"];
const STATE_METHODS: &[&str] = &["state", "setState"];
const FIBER_PROPERTIES: &[&str] = &["_reactInternals", "_reactInternalFiber", "stateNode", "memoizedState", "memoizedProps"];
const SPY_ON: &str = "spyOn";

fn spy_methods(kind: &str) -> &'static [&'static str] {
    match kind {
        "vitest" | "jest" => &[SPY_ON],
        "node" => &["method", "getter", "setter"],
        "sinon" => &["stub", "spy", "replace", "replaceGetter", "replaceSetter"],
        "testdouble" => &["replace"],
        _ => &[],
    }
}

fn is_spy_call(apis: &Apis, callee: Node) -> bool {
    if mocks::member_name(callee).as_deref() == Some(SPY_ON) {
        return true;
    }
    matches!(apis.called(callee), Some((Some(kind), Some(method))) if spy_methods(kind).contains(&method.as_str()))
}

fn spied_hook(apis: &Apis, call: Node, callee: Node, react: &HashSet<String>) -> Option<String> {
    let arguments = call.list("arguments");
    let target = arguments.first().copied().flatten().filter(|target| !target.is("Literal"))?;
    let property = arguments.get(1).copied().flatten()?;
    if !is_spy_call(apis, callee) || !is_react_expression(Some(target), react) {
        return None;
    }
    spied_hook_name(property)
}

/// The hook-named keys anywhere in what replaces a module, level by level as the ESLint rule lists them.
fn mocked_hooks(factory: Option<Node>) -> Vec<String> {
    let mut hooks = Vec::new();
    let mut level: Vec<Node> = factory.into_iter().collect();
    while !level.is_empty() {
        let keys = level.iter().filter(|node| node.is("Property")).filter_map(|node| node.node("key")).filter_map(static_name);
        hooks.extend(keys.filter(|name| is_hook_name(name)));
        level = level
            .iter()
            .flat_map(|node| {
                let mut children = node.children();
                children.sort_by_key(|child| child.start());
                children
            })
            .collect();
    }
    hooks
}

fn react_mock(apis: &Apis, call: Node) -> Option<String> {
    let mock = apis.mocked(call).into_iter().find(|mock| matches!(mock.name.as_deref(), Some("react" | "react-dom")))?;
    let hooks = mocked_hooks(mock.replacement);
    if !hooks.is_empty() {
        return Some(hooks.join("`, `"));
    }
    mock.name.filter(|name| name == "react")
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    if !context.react_test_scope().is_some_and(|scope| scope.inside) {
        return;
    }
    let react = binding_names(view, &["React", "react"]);
    let wrappers = Wrappers::of(view);
    let apis = Apis::of(view.program());
    let mut found = Vec::new();
    for node in view.nodes() {
        if node.is("MemberExpression") {
            if let Some(name) = member_name(node).filter(|name| FIBER_PROPERTIES.contains(&name.as_str()) || name.starts_with("__react")) {
                found.push((node, format!("Do not read React internals ({name}). {ADVICE}.")));
            }
            continue;
        }
        let Some(callee) = node.node("callee").filter(|_| node.is("CallExpression")) else { continue };
        let method = if callee.is("MemberExpression") { member_name(callee) } else { None };
        if let Some(method) = method.filter(|method| INSTANCE_METHODS.contains(&method.as_str())) {
            if !STATE_METHODS.contains(&method.as_str()) || callee.node("object").is_some_and(|receiver| wrappers.holds(receiver)) {
                found.push((node, format!("Do not use component state or instances ({method}()). {ADVICE}.")));
            }
        }
        if let Some(name) = react_mock(&apis, node) {
            found.push((node, format!("Do not replace `{name}` with a module mock. {ADVICE}, or test a custom hook with `renderHook`.")));
        }
        if let Some(name) = spied_hook(&apis, node, callee, &react) {
            found.push((node, format!("Do not spy on the React hook `{name}`. {ADVICE}, or test a custom hook with `renderHook`.")));
        }
    }
    for (node, message) in found {
        context.report_range(RULE, node.start(), Some(node.end()), message);
    }
}
