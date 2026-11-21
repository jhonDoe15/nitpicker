//! no-debugging-utils and no-unnecessary-act.
use super::super::Tools;
use super::super::nodes::{
    deepest_identifier, identifier, identifier_name, is_empty_function, is_kind, name, property_identifier, reference_node, statement_call,
};
use super::super::promises::{function_name, returning_function};
use super::super::resolve::resolve;
use super::super::utils::DEBUG_UTILS;
use super::access::declared_names;
use crate::typescript::rules::support::view::Node;
use std::collections::HashSet;

const DEBUG: &str = "testing-library/no-debugging-utils";
const ACT: &str = "testing-library/no-unnecessary-act";

#[derive(Default)]
pub struct Debugging<'v> {
    variables: Vec<String>,
    references: Vec<String>,
    wrappers: Vec<String>,
    consoles: Vec<Node<'v>>,
}

impl<'v> Debugging<'v> {
    pub fn declarator(&mut self, node: Node<'v>, tools: &Tools<'_, '_, 'v>) {
        let Some(init) = deepest_identifier(node.node("init")) else { return };
        if name(init) == "console" {
            self.consoles.push(node);
            return;
        }
        if !tools.detect.is_render_declarator(node) && !self.wrappers.contains(&name(init)) {
            return;
        }
        let Some(id) = node.node("id") else { return };
        if id.is("ObjectPattern") {
            for property in id.nodes("properties").into_iter().filter(|property| property.is("Property")) {
                let checked = identifier_name(property.node("key")).is_some_and(|key| DEBUG_UTILS.contains(&key.as_str()));
                if let Some(value) = deepest_identifier(property.node("value")).filter(|_| checked) {
                    self.variables.push(name(value));
                }
            }
        }
        if id.is("Identifier") {
            self.references.push(name(id));
        }
    }

    pub fn call(&mut self, node: Node<'v>, tools: &mut Tools<'_, '_, 'v>) {
        let Some(found) = deepest_identifier(Some(node)) else { return };
        if tools.detect.is_render_util(found) && let Some(function) = returning_function(found) {
            self.wrappers.push(function_name(function));
        }
        let Some(head) = property_identifier(Some(reference_node(node))) else { return };
        let label = name(found);
        let chained = DEBUG_UTILS.contains(&label.as_str()) && self.references.contains(&name(head));
        let on_console = is_kind(found.parent(), "CallExpression") && self.consoles.iter().any(|declarator| declared_names(*declarator).contains(&label));
        if !on_console && (tools.detect.is_debug_util(found) || self.variables.contains(&label) || chained) {
            tools.report(DEBUG, found, "Unexpected debug statement".to_string());
        }
    }
}

#[derive(Default)]
pub struct Act {
    instances: HashSet<String>,
}

impl Act {
    fn statement_identifier<'v>(statement: Node<'v>) -> Option<Node<'v>> {
        if let Some(call) = statement_call(statement) {
            return deepest_identifier(Some(call));
        }
        match statement.kind() {
            "ExpressionStatement" => {
                let awaited = statement.node("expression").filter(|expression| expression.is("AwaitExpression"))?;
                property_identifier(awaited.node("argument"))
            }
            "ReturnStatement" => property_identifier(statement.node("argument")),
            _ => None,
        }
    }

    fn is_user_event_instance(&self, found: Node) -> bool {
        let member = found.parent().filter(|parent| parent.is("MemberExpression"));
        let head = member.and_then(|member| property_identifier(Some(member)));
        self.instances.contains(&head.map(name).unwrap_or_default())
    }

    fn calls_testing_library<'v>(&self, statements: Vec<Node<'v>>, tools: &Tools<'_, '_, 'v>) -> bool {
        statements.into_iter().filter_map(Self::statement_identifier).any(|found| tools.detect.is_util(found) || self.is_user_event_instance(found))
    }

    /// `VariableDeclarator > CallExpression`
    pub fn register(&mut self, node: Node, tools: &Tools) {
        let head = property_identifier(Some(node)).map(name);
        let imported = resolve(node, tools.scopes, tools.detect.setting.as_deref()).map(|imported| imported.local);
        let is_setup = deepest_identifier(Some(node)).is_some_and(|deepest| name(deepest) == "setup");
        if let Some(id) = node.parent().and_then(|parent| identifier(parent.node("id"))).filter(|_| head == imported && is_setup) {
            self.instances.insert(name(id));
        }
    }

    /// `CallExpression > ArrowFunctionExpression > BlockStatement` and the same under a function expression.
    pub fn block<'v>(&mut self, block: Node<'v>, function: Node<'v>, call: Node<'v>, tools: &mut Tools<'_, '_, 'v>) {
        let Some(found) = deepest_identifier(Some(call)).filter(|found| tools.detect.is_act_util(*found)) else { return };
        if is_empty_function(function) {
            tools.report(ACT, found, "Avoid wrapping empty function in `act`".to_string());
        } else if self.calls_testing_library(block.nodes("body"), tools) {
            tools.report(ACT, found, "Avoid wrapping Testing Library util calls in `act`".to_string());
        }
    }

    /// `CallExpression > ArrowFunctionExpression > CallExpression`
    pub fn implicit_return<'v>(&mut self, node: Node<'v>, call: Node<'v>, tools: &mut Tools<'_, '_, 'v>) {
        let Some(returned) = deepest_identifier(Some(node)) else { return };
        let Some(found) = deepest_identifier(Some(call)).filter(|found| tools.detect.is_act_util(*found)) else { return };
        if tools.detect.is_util(returned) {
            tools.report(ACT, found, "Avoid wrapping Testing Library util calls in `act`".to_string());
        }
    }
}
