//! `no-send-without-return`: an `if` branch that sends a response or calls `next` without returning, so the code
//! after the `if` runs too.
mod calls;

use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use super::walk::any_below;
use calls::{handoff_of, is_real_work};

const RULE: &str = "no-send-without-return";

fn message(text: &str) -> String {
    format!("This branch hands off the request ({text}) but does not return, so the code after the `if` runs too: it can send a second response or do the work the branch meant to refuse. Return after it (`return next();`, `return res.status(400).json(...)`, or a `return;` on the next line), or put the rest in an `else`. An exception fits only when the code after the branch must run for this case too.")
}

fn chain_root(node: Node) -> Node {
    let mut link = node;
    while let Some(parent) = link.parent().filter(|parent| parent.is("IfStatement") && parent.node("alternate") == Some(link)) {
        link = parent;
    }
    link
}

fn following_statements(root: Node) -> Vec<Node> {
    let Some(parent) = root.parent() else { return Vec::new() };
    let siblings = match parent.kind() {
        "BlockStatement" | "Program" => parent.nodes("body"),
        "SwitchCase" => parent.nodes("consequent"),
        _ => Vec::new(),
    };
    let after = siblings.iter().position(|sibling| *sibling == root).map_or(0, |index| index + 1);
    siblings[after.min(siblings.len())..].to_vec()
}

/// The text of an identifier token starts the node: an Identifier node also spans its type annotation.
fn is_token(text: &str, node: Node, name: &str) -> bool {
    let rest = text.get(node.start() as usize..).unwrap_or_default();
    let after = rest.strip_prefix(name).and_then(|after| after.chars().next());
    rest.starts_with(name) && !after.is_some_and(|next| next.is_alphanumeric() || matches!(next, '_' | '$' | '\\' | '\u{200c}' | '\u{200d}'))
}

/// `getTokens(test)` holds an Identifier token of the name: the parts of a JSX namespaced name are such tokens too.
fn test_mentions(text: &str, test: Node, name: &str) -> bool {
    any_below(test, |_| false, |node| {
        let namespaced = node.is("JSXIdentifier") && node.parent().is_some_and(|parent| parent.is("JSXNamespacedName"));
        (node.is("Identifier") || namespaced) && is_token(text, node, name)
    })
}

fn last_statement(branch: Node) -> Option<Node> {
    if branch.is("BlockStatement") { branch.nodes("body").last().copied() } else { Some(branch) }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let text = context.file.text;
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("IfStatement") && node.node("alternate").is_none()) {
        let Some(last) = node.node("consequent").and_then(last_statement) else { continue };
        let Some(handoff) = handoff_of(scopes, last) else { continue };
        let Some(test) = node.node("test") else { continue };
        if !test_mentions(text, test, &handoff.name) && following_statements(chain_root(node)).into_iter().any(is_real_work) {
            found.push((last.start(), last.end(), message(&handoff.text)));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
