//! await-async-events, await-async-queries and await-async-utils.
use super::super::Tools;
use super::super::nodes::{closest_call, closest_function, deepest_identifier, identifier, identifier_name, is_named, name};
use super::super::promises::{function_name, is_promise_handled, returning_function, variable_references};
use crate::typescript::rules::support::view::Node;
use std::collections::{HashMap, HashSet};

const EVENTS: &str = "testing-library/await-async-events";
const QUERIES: &str = "testing-library/await-async-queries";
const UTILS: &str = "testing-library/await-async-utils";

fn is_setup_call(node: Option<Node>, util: &str) -> bool {
    let callee = node.filter(|node| node.is("CallExpression")).and_then(|call| call.node("callee"));
    callee.is_some_and(|callee| callee.is("MemberExpression") && is_named(callee.node("object"), util) && is_named(callee.node("property"), "setup"))
}

fn keyed_properties(holder: Node) -> Vec<(String, Option<Node>)> {
    let properties = holder.nodes("properties").into_iter().filter(|property| property.is("Property"));
    properties.filter_map(|property| Some((identifier_name(property.node("key"))?, property.node("value")))).collect()
}

/// What `userEvent.setup()` was stored in: variables, and the properties of objects that functions return.
#[derive(Default)]
pub struct Setups {
    pub variables: HashSet<String>,
    pub functions: HashMap<String, HashSet<String>>,
}

impl Setups {
    pub fn declarator(&mut self, node: Node, util: &str) {
        let (Some(id), init) = (node.node("id"), node.node("init")) else { return };
        if is_setup_call(init, util) && id.is("Identifier") {
            self.variables.insert(name(id));
        }
        let called = init.filter(|init| init.is("CallExpression")).and_then(|init| identifier_name(init.node("callee")));
        let Some(properties) = called.and_then(|called| self.functions.get(&called)).filter(|_| id.is("ObjectPattern")) else { return };
        for (key, value) in keyed_properties(id) {
            if properties.contains(&key) && let Some(value) = identifier_name(value) {
                self.variables.insert(value);
            }
        }
    }

    pub fn returned(&self, statement: Node, util: &str, variables: bool) -> HashSet<String> {
        let Some(object) = statement.node("argument").filter(|argument| argument.is("ObjectExpression")) else { return HashSet::new() };
        let kept = keyed_properties(object).into_iter().filter(|(_, value)| {
            is_setup_call(*value, util) || (variables && identifier_name(*value).is_some_and(|value| self.variables.contains(&value)))
        });
        kept.map(|(key, _)| key).collect()
    }
}

#[derive(Default)]
pub struct Events {
    wrappers: Vec<String>,
    setups: Setups,
}

impl Events {
    pub fn declarator(&mut self, node: Node) {
        self.setups.declarator(node, "userEvent");
    }

    pub fn returns(&mut self, node: Node) {
        let properties = self.setups.returned(node, "userEvent", true);
        if let Some(function) = closest_function(node).filter(|_| !properties.is_empty()) {
            self.setups.functions.insert(function_name(function), properties);
        }
    }

    fn report_unhandled(tools: &mut Tools, node: Node, call: Node, wrapper: bool) {
        if is_promise_handled(node) {
            return;
        }
        let Some(callee) = call.node("callee") else { return };
        let message = if wrapper {
            format!("Promise returned from `{}` wrapper over async event method must be handled", name(node))
        } else {
            format!("Promise returned from async event method `{}` must be handled", name(node))
        };
        tools.report(EVENTS, callee, message);
    }

    pub fn identifier<'v>(&mut self, node: Node<'v>, tools: &mut Tools<'_, '_, 'v>) {
        if tools.detect.is_user_event_method(node, Some(&self.setups.variables)) {
            if name(node) == "setup" {
                return;
            }
            if let Some(function) = returning_function(node) {
                self.wrappers.push(function_name(function));
            }
            let Some(call) = closest_call(node, true) else { return };
            let Some(parent) = call.parent() else { return };
            let references = variable_references(tools.scopes, parent);
            if references.is_empty() {
                Self::report_unhandled(tools, node, call, false);
            }
            for reference in references.into_iter().filter(|reference| reference.is("Identifier")) {
                Self::report_unhandled(tools, reference, call, false);
            }
        } else if self.wrappers.contains(&name(node)) && let Some(call) = closest_call(node, true) {
            Self::report_unhandled(tools, node, call, true);
        }
    }
}

#[derive(Default)]
pub struct Queries {
    wrappers: Vec<String>,
}

impl Queries {
    pub fn call<'v>(&mut self, node: Node<'v>, tools: &mut Tools<'_, '_, 'v>) {
        let Some(found) = deepest_identifier(Some(node)) else { return };
        let label = name(found);
        if tools.detect.is_query(found) && label.starts_with("find") {
            if let Some(function) = returning_function(found) {
                self.wrappers.push(function_name(function));
            }
            let Some(parent) = node.parent() else { return };
            let references = variable_references(tools.scopes, parent);
            let unhandled = if references.is_empty() {
                !is_promise_handled(found)
            } else {
                references.iter().any(|reference| reference.is("Identifier") && !is_promise_handled(*reference))
            };
            if unhandled {
                tools.report(QUERIES, found, format!("promise returned from `{label}` query must be handled"));
            }
        } else if self.wrappers.contains(&label) && !is_promise_handled(found) {
            tools.report(QUERIES, found, format!("promise returned from `{label}` wrapper over async query must be handled"));
        }
    }
}

#[derive(Default)]
pub struct Utils {
    wrappers: Vec<String>,
}

impl Utils {
    pub fn declarator(&mut self, node: Node) {
        let (Some(id), init) = (node.node("id"), node.node("init")) else { return };
        if id.is("ObjectPattern") {
            for (key, value) in keyed_properties(id) {
                if let Some(value) = identifier_name(value).filter(|value| self.wrappers.contains(&key) && *value != key) {
                    self.wrappers.push(value);
                }
            }
            return;
        }
        let Some(init) = init.filter(|init| !matches!(init.kind(), "CallExpression" | "AwaitExpression")) else { return };
        if identifier(Some(id)).is_some() && deepest_identifier(Some(init)).is_some_and(|aliased| self.wrappers.contains(&name(aliased))) {
            self.wrappers.push(name(id));
        }
    }

    pub fn call<'v>(&mut self, node: Node<'v>, tools: &mut Tools<'_, '_, 'v>) {
        let Some(found) = deepest_identifier(Some(node)) else { return };
        let label = name(found);
        let is_util = tools.detect.is_async_util(found);
        if !is_util && !self.wrappers.contains(&label) {
            return;
        }
        if is_util && let Some(wrapper) = returning_function(found).map(function_name).filter(|wrapper| !wrapper.is_empty()) {
            self.wrappers.push(wrapper);
        }
        let Some(parent) = closest_call(found, true).and_then(|call| call.parent()) else { return };
        let references = variable_references(tools.scopes, parent);
        let unhandled = if references.is_empty() { !is_promise_handled(found) } else { references.iter().any(|reference| !is_promise_handled(*reference)) };
        if unhandled {
            let message = if is_util {
                format!("Promise returned from `{label}` must be handled")
            } else {
                format!("Promise returned from {label} wrapper over async util must be handled")
            };
            tools.report(UTILS, found, message);
        }
    }
}
