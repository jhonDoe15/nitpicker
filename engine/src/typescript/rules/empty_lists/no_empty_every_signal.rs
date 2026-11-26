//! `no-empty-every-signal`: `list.every(...)` is true for an empty list, so an all-done signal built on it fires
//! when there are no items.
use crate::typescript::rules::presence::conditions::condition_root;
use super::every_receivers::{is_guarded_against_empty, is_tracked_receiver};
use crate::typescript::rules::Context;
use crate::typescript::rules::signatures::{Scope, name_of};
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-empty-every-signal";
const ACTIONS: [&str; 16] =
    ["stop", "finish", "finalize", "complete", "cancel", "delete", "remove", "send", "close", "end", "abort", "resolve", "dispose", "shutdown", "terminate", "kill"];

static SIGNAL_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(?:all|every|each)(?:[A-Z0-9_]|$)").expect("pattern"));

fn message(list: &str) -> String {
    format!("`{list}.every(...)` is true when `{list}` is empty, so this all-done signal fires when there are no items. Guard it with `{list}.length > 0 && {list}.every(...)`.")
}

fn is_action(name: &str) -> bool {
    let mut words: Vec<String> = vec![String::new()];
    let mut previous = ' ';
    for character in name.chars() {
        if !character.is_ascii_alphanumeric() {
            words.push(String::new());
        } else {
            if character.is_ascii_uppercase() && (previous.is_ascii_lowercase() || previous.is_ascii_digit()) {
                words.push(String::new());
            }
            if let Some(word) = words.last_mut() {
                word.push(character.to_ascii_lowercase());
            }
        }
        previous = character;
    }
    words.iter().any(|word| ACTIONS.contains(&word.as_str()))
}

fn every_call(node: Node) -> Option<Node> {
    let callee = node.node("callee").filter(|callee| callee.is("MemberExpression") && !callee.flag("computed"))?;
    (name_of(callee.node("property")).as_deref() == Some("every") && node.nodes("arguments").len() == 1).then_some(callee)
}

fn assigned_name(node: Node) -> Option<String> {
    let parent = node.parent()?;
    match parent.kind() {
        "VariableDeclarator" if parent.node("init") == Some(node) => name_of(parent.node("id")),
        "AssignmentExpression" if parent.node("right") == Some(node) => {
            let left = parent.node("left")?;
            name_of(if left.is("MemberExpression") { left.node("property") } else { Some(left) })
        }
        "Property" if parent.node("value") == Some(node) => name_of(parent.node("key")),
        _ => None,
    }
}

fn calls_action(branch: Node) -> bool {
    branch.descendants().into_iter().any(|node| {
        let Some(callee) = node.node("callee").filter(|_| node.is("CallExpression")) else { return false };
        name_of(if callee.is("MemberExpression") { callee.node("property") } else { Some(callee) }).is_some_and(|name| is_action(&name))
    })
}

fn is_signal(call: Node) -> bool {
    let node = call.parent().filter(|parent| parent.is("ChainExpression")).unwrap_or(call);
    if let Some(name) = assigned_name(node) {
        return SIGNAL_NAME.is_match(&name);
    }
    let Some(root) = condition_root(node) else { return false };
    let Some(parent) = root.parent().filter(|parent| parent.is("IfStatement") || parent.is("ConditionalExpression")) else { return false };
    parent.node("test") == Some(root) && parent.node("consequent").is_some_and(calls_action)
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let scope = Scope { scopes, types, text: context.file.text };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("CallExpression")) {
        let Some(callee) = every_call(node) else { continue };
        let Some(object) = callee.node("object") else { continue };
        let receiver = if object.is("ChainExpression") { object.node("expression").unwrap_or(object) } else { object };
        let Some(is_list) = types.borrow_mut().is_list_at(receiver.start(), receiver.end()) else {
            types.borrow_mut().refuse("no type for an every receiver");
            return;
        };
        if types.borrow().refused.is_some() {
            return;
        }
        if is_list && is_tracked_receiver(&scope, receiver) && is_signal(node) && !is_guarded_against_empty(&scope, node, receiver) {
            found.push((node.start(), node.end(), message(scope.source(receiver))));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
