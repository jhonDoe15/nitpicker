//! `clients.mts`: the callback a transaction opener runs, and where the client a write goes through comes from:
//! the callback's parameter, another parameter, or anything else.
use crate::typescript::rules::held_scopes::estree_calls::runs_with_caller;
use crate::typescript::rules::orm_sites::call_chain;
use crate::typescript::rules::secrets::nodes::unwrapped;
use crate::typescript::rules::security_values::{defs, is_function_node};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ClientOrigin {
    Transaction,
    Parameter,
    Other,
}

const OPENERS: [&str; 7] = ["transaction", "$transaction", "transactional", "runInTransaction", "withTransaction", "inTransaction", "useTransaction"];
const MAX_DEPTH: usize = 4;

/// `rootNode` of `support/orm/chains.mts`: the node a call and member chain starts from.
pub fn root_node(node: Node) -> Node {
    let mut current = unwrapped(node);
    loop {
        let next = match current.kind() {
            "CallExpression" => current.node("callee"),
            "MemberExpression" => current.node("object"),
            _ => return current,
        };
        let Some(next) = next else { return current };
        current = unwrapped(next);
    }
}

fn is_opener_function(function: Node) -> bool {
    let Some(call) = function.parent().filter(|call| call.is("CallExpression")) else { return false };
    if !call.nodes("arguments").contains(&function) {
        return false;
    }
    let Some(callee) = call.node("callee") else { return false };
    let member = callee.is("MemberExpression");
    let name = if member { callee.node("property").and_then(|property| property.name()) } else { callee.name() };
    if name.as_deref().is_some_and(|name| OPENERS.contains(&name)) {
        return true;
    }
    let opened = name.as_deref() == Some("execute") && member;
    opened && callee.node("object").is_some_and(|object| call_chain(object).steps.iter().any(|step| step.name.as_deref() == Some("transaction")))
}

/// `openerCallback`: the transaction callback the node runs in, through callbacks that run with their caller.
pub fn opener_callback(node: Node) -> Option<Node> {
    for function in node.ancestors().filter(|ancestor| is_function_node(*ancestor)) {
        if is_opener_function(function) {
            return Some(function);
        }
        if !runs_with_caller(function) {
            return None;
        }
    }
    None
}

/// `transactionCallback`: an opener callback that takes the transaction as a parameter.
pub fn transaction_callback(node: Node) -> Option<Node> {
    opener_callback(node).filter(|function| !function.nodes("params").is_empty())
}

/// `clientOrigin`.
pub fn client_origin(scopes: &Scopes, identifier: Node, function: Node) -> ClientOrigin {
    let mut pending = vec![identifier];
    let mut at = 0;
    while let Some(current) = pending.get(at).copied() {
        at += 1;
        let definition = defs(scopes, current).into_iter().next();
        if let Some(definition) = definition.as_ref().filter(|definition| definition.kind == DefKind::Parameter) {
            return if definition.node == function { ClientOrigin::Transaction } else { ClientOrigin::Parameter };
        }
        let init = definition.filter(|definition| definition.kind == DefKind::Variable).and_then(|definition| definition.node.node("init"));
        let Some(init) = init.filter(|_| pending.len() <= MAX_DEPTH) else { return ClientOrigin::Other };
        let root = root_node(init);
        if !root.is("Identifier") {
            return ClientOrigin::Other;
        }
        pending.push(root);
    }
    ClientOrigin::Other
}

/// `mentionsTransaction`: an argument reads the callback's transaction parameter, at any depth.
pub fn mentions_transaction(scopes: &Scopes, args: &[Node], function: Node) -> bool {
    args.iter().any(|argument| {
        argument.descendants().into_iter().any(|node| node.is("Identifier") && client_origin(scopes, node, function) == ClientOrigin::Transaction)
    })
}
