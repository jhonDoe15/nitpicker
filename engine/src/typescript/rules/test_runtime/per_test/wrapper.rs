//! `describeWrapperCall` of `wrapper-calls.mts`: a call of a local function that starts a process, with the command
//! and arguments the call passes in.
use super::subprocess::{describe_subprocess, literal_tokens};
use crate::typescript::rules::security_values::{is_function_node, resolve_constant, string_value};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_assertions::unowned_async::nodes::{ModuleBindings, nodes_in};
use crate::typescript::rules::test_quality::test_calls::resolve_function;

/// `WrapperCall`: the command the wrapped process runs and its argument words.
pub struct WrapperCall {
    pub command: Option<String>,
    pub tokens: Vec<String>,
}

fn parameter_names(function: Node) -> Vec<String> {
    let named = |node: Option<Node>| node.filter(|node| node.is("Identifier")).and_then(|node| node.name()).map(|name| name.into_owned());
    function
        .nodes("params")
        .into_iter()
        .filter_map(|parameter| match parameter.kind() {
            "Identifier" => named(Some(parameter)),
            "RestElement" => named(parameter.node("argument")),
            "AssignmentPattern" => named(parameter.node("left")),
            _ => None,
        })
        .collect()
}

fn references_any(node: Option<Node>, names: &[String]) -> bool {
    node.is_some_and(|node| {
        node.descendants().into_iter().any(|candidate| candidate.is("Identifier") && candidate.name().is_some_and(|name| names.iter().any(|known| *known == name)))
    })
}

/// `describeWrapperCall`.
pub fn describe_wrapper_call(scopes: &Scopes, call: Node, bindings: &ModuleBindings) -> Option<WrapperCall> {
    if !call.is("CallExpression") {
        return None;
    }
    let function = resolve_function(scopes, call.node("callee")).filter(|function| is_function_node(*function))?;
    let parameters = parameter_names(function);
    let arguments = call.nodes("arguments");
    for node in nodes_in(function.node("body"), |_| true).into_iter().filter(|node| node.is("CallExpression")) {
        let Some(inner) = describe_subprocess(scopes, node, bindings) else { continue };
        let command_name = inner.command_node.filter(|command| command.is("Identifier")).and_then(|command| command.name());
        let command_index = command_name.and_then(|name| parameters.iter().position(|parameter| *parameter == name));
        if let Some(index) = command_index {
            let command = string_value(resolve_constant(scopes, arguments.get(index).copied()));
            let others = arguments.iter().enumerate().filter(|(position, _)| *position != index);
            let tokens = others.flat_map(|(_, argument)| literal_tokens(scopes, Some(*argument))).collect();
            return Some(WrapperCall { command, tokens });
        }
        if inner.command.is_some() && references_any(inner.args_node, &parameters) {
            let passed = arguments.iter().flat_map(|argument| literal_tokens(scopes, Some(*argument)));
            let tokens = inner.tokens.into_iter().chain(passed).collect();
            return Some(WrapperCall { command: inner.command, tokens });
        }
    }
    None
}
