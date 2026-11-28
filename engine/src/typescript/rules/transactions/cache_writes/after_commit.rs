//! `after-commit.mts`: a node inside a callback handed to a commit hook (`afterCommit`, `onCommit`,
//! `on('commit', ...)`) within the transaction body.
use crate::typescript::rules::security_values::{is_function_node, is_text};
use crate::typescript::rules::support::view::Node;

const HOOKS: [&str; 2] = ["afterCommit", "onCommit"];
const EVENT_METHODS: [&str; 2] = ["on", "once"];

fn is_hook_call(call: Node) -> bool {
    let Some(callee) = call.node("callee").filter(|callee| callee.is("MemberExpression")) else { return false };
    let method = callee.node("property").and_then(|property| property.name()).map(|name| name.into_owned()).unwrap_or_default();
    let event = call.nodes("arguments").first().is_some_and(|first| is_text(*first, "commit"));
    HOOKS.contains(&method.as_str()) || (EVENT_METHODS.contains(&method.as_str()) && event)
}

fn passes_callback(function: Node) -> bool {
    function.parent().is_some_and(|call| call.is("CallExpression") && call.nodes("arguments").contains(&function) && is_hook_call(call))
}

/// `inAfterCommitHook`.
pub fn in_after_commit_hook(node: Node, boundary: Node) -> bool {
    node.ancestors().filter(|ancestor| is_function_node(*ancestor) && boundary.contains(*ancestor)).any(passes_callback)
}
