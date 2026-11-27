//! `polling-loops.mts`: a tested loop that paces itself (a wait, a deadline) and calls the same thing each pass
//! without per-pass input, and a call in a `catch` that re-reads what the `try` block already called.
use super::chains::is_call;
use super::names::{body_declared_names, callee_name, descendants, is_consuming_call, is_tested_loop, item_names, name_of, never, referenced_names};
use crate::typescript::rules::collections::loops::{Site, enclosing_loop};
use crate::typescript::rules::effects::tags::words_of;
use crate::typescript::rules::held_scopes::estree_calls::call_view;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use std::cell::RefCell;

const WAITS: [&str; 7] = ["sleep", "delay", "wait", "settimeout", "backoff", "pause", "waitfor"];
const DEADLINE_WORDS: [&str; 5] = ["deadline", "timeout", "expires", "expiry", "elapsed"];

fn is_wait(node: Node) -> bool {
    node.is("CallExpression") && WAITS.contains(&callee_name(node.node("callee")).to_lowercase().as_str())
}

fn is_deadline_check(node: Node) -> bool {
    if node.is("Identifier") {
        return words_of(&name_of(Some(node)).unwrap_or_default()).iter().any(|word| DEADLINE_WORDS.contains(&word.to_lowercase().as_str()));
    }
    let Some(callee) = node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression")) else { return false };
    name_of(callee.node("property")).as_deref() == Some("now") && matches!(name_of(callee.node("object")).as_deref(), Some("Date" | "performance"))
}

fn paces_itself(lp: Node) -> bool {
    let roots = lp.node("body").into_iter().chain(lp.node("test"));
    roots.into_iter().any(|root| descendants(root, never).into_iter().any(|node| is_wait(node) || is_deadline_check(node)))
}

/// `outerNames`: the item names of every loop around this one; `None` when the compiler refused.
fn outer_names(types: &RefCell<Types>, lp: Node) -> Option<Vec<String>> {
    let mut names = Vec::new();
    let mut found = enclosing_loop(lp, types)?;
    while let Some(site) = found {
        names.extend(item_names(&site));
        found = enclosing_loop(site.node(), types)?;
    }
    Some(names)
}

fn uses_iteration_state(types: &RefCell<Types>, call: Node, lp: Node) -> Option<bool> {
    let arguments = if call.is("CallExpression") { call.nodes("arguments") } else { Vec::new() };
    let mut bound = body_declared_names(lp);
    bound.extend(item_names(&Site::Loop(lp)));
    bound.extend(outer_names(types, lp)?);
    Some(arguments.into_iter().any(|argument| {
        descendants(argument, never).into_iter().any(is_consuming_call) || referenced_names(argument).iter().any(|name| bound.contains(name))
    }))
}

/// `isPollingCall`; `None` when the compiler refused.
pub fn is_polling_call(types: &RefCell<Types>, call: Node, lp: Option<Node>) -> Option<bool> {
    let Some(lp) = lp.filter(|lp| is_tested_loop(Some(*lp))) else { return Some(false) };
    if !paces_itself(lp) {
        return Some(false);
    }
    Some(!uses_iteration_state(types, call, lp)?)
}

fn owner_of(call: Node) -> String {
    let names = call_view(call).map(|view| view.names).unwrap_or_default();
    names[..names.len().saturating_sub(1)].join(".")
}

fn catching_try<'v>(call: Node<'v>, lp: Node) -> Option<Node<'v>> {
    let handler = call.ancestors().filter(|ancestor| lp.contains(*ancestor)).find(|ancestor| ancestor.is("CatchClause"))?;
    handler.parent().filter(|attempt| attempt.is("TryStatement"))
}

/// `isRereadInCatch`.
pub fn is_reread_in_catch(call: Node, lp: Option<Node>) -> bool {
    let Some(attempt) = lp.and_then(|lp| catching_try(call, lp)) else { return false };
    let owner = owner_of(call);
    if owner.is_empty() {
        return false;
    }
    let Some(block) = attempt.node("block") else { return false };
    descendants(block, never).into_iter().any(|node| is_call(node) && owner_of(node) == owner)
}
