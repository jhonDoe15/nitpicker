//! `isRetryAttempt`: a node inside the `try` block of a loop body statement whose `catch` goes on to the next
//! pass, while the `try` block leaves the loop (`return` or a `break` out of it) once it succeeds.
use crate::typescript::rules::support::view::Node;

const LOOPS: [&str; 5] = ["ForOfStatement", "ForInStatement", "ForStatement", "WhileStatement", "DoWhileStatement"];
const LOOP_EXITS: [&str; 3] = ["ThrowStatement", "ReturnStatement", "BreakStatement"];
const FUNCTIONS: [&str; 3] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];

pub fn is_loop(node: Node) -> bool {
    LOOPS.contains(&node.kind())
}

fn is_break_target(node: Node) -> bool {
    is_loop(node) || node.is("SwitchStatement")
}

/// `descendants(root, keys, isFunction)`: the root and every node under it, functions entered only at the root.
fn descendants(root: Node) -> Vec<Node> {
    let mut found = Vec::new();
    let mut pending = vec![root];
    let mut at = 0;
    while at < pending.len() {
        let node = pending[at];
        at += 1;
        found.push(node);
        if node == root || !FUNCTIONS.contains(&node.kind()) {
            pending.extend(node.children());
        }
    }
    found
}

fn breaks_out(node: Node, block: Node) -> bool {
    node.get("label") == crate::typescript::rules::support::view::Value::Null && !node.ancestors().filter(|ancestor| block.contains(*ancestor)).any(is_break_target)
}

fn exits_loop(block: Node) -> bool {
    descendants(block).into_iter().any(|node| node.is("ReturnStatement") || (node.is("BreakStatement") && breaks_out(node, block)))
}

fn retrying_try<'v>(lp: Node<'v>, call: Node) -> Option<Node<'v>> {
    let body = lp.node("body")?;
    let statements = if body.is("BlockStatement") { body.nodes("body") } else { vec![body] };
    statements.into_iter().find(|statement| statement.is("TryStatement") && statement.node("block").is_some_and(|block| block.contains(call)))
}

pub fn is_retry_attempt(call: Node, lp: Option<Node>) -> bool {
    let Some(attempt) = lp.and_then(|lp| retrying_try(lp, call)) else { return false };
    let Some(handler) = attempt.node("handler") else { return false };
    let statements = handler.node("body").map(|body| body.nodes("body")).unwrap_or_default();
    let continues = !statements.iter().any(|statement| LOOP_EXITS.contains(&statement.kind()));
    continues && attempt.node("block").is_some_and(exits_loop)
}
