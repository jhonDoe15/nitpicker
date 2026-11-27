//! `no-case-sensitive-path-compare`: file system paths or URI authorities compared as plain strings, without case
//! folding on either side.
use super::operands::{Kind, Operand, operand_of};
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::is_function_node;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::source;
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-case-sensitive-path-compare";
const PATH: &str = "These file system paths are compared as plain strings, but Windows and macOS ignore case. Compare `path.relative(a, b) === \"\"`, or normalize both sides with one helper that lowercases on win32 and darwin.";
const AUTHORITY: &str = "Host names and URI authorities are case-insensitive. Lowercase both sides (`a.toLowerCase() === b.toLowerCase()`) before comparing them.";
const COMPARISONS: [&str; 4] = ["===", "!==", "==", "!="];
const CONTAINMENT: [&str; 3] = ["startsWith", "endsWith", "includes"];
static PLATFORM_AWARE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"process\.platform|isWindows|isCaseSensitive|caseSensitive|CaseSensitiveFileNames").expect("pattern"));

fn same_source(text: &str, first: &Operand, second: &Operand) -> bool {
    let owners = match (first.owner, second.owner) {
        (Some(left), Some(right)) => source(text, left) == source(text, right),
        _ => false,
    };
    first.kind == Kind::Path && first.name != "fsPath" && (first.name == second.name || owners)
}

fn mismatch(text: &str, left: Node, right: Node) -> Option<&'static str> {
    let first = operand_of(left)?;
    let second = operand_of(right)?;
    let skipped = first.kind != second.kind
        || first.folded
        || second.folded
        || !(first.strong || second.strong)
        || (first.kind == Kind::Path && !(first.foreign || second.foreign))
        || same_source(text, &first, &second);
    if skipped {
        return None;
    }
    Some(if first.kind == Kind::Path { PATH } else { AUTHORITY })
}

fn platform_aware(text: &str, node: Node) -> bool {
    node.ancestors().find(|ancestor| is_function_node(*ancestor)).is_some_and(|scope| PLATFORM_AWARE.is_match(source(text, scope)))
}

fn compared(node: Node) -> Option<(Node, Node)> {
    if node.is("BinaryExpression") {
        let operator = node.text("operator").unwrap_or_default();
        let left = node.node("left").filter(|left| !left.is("PrivateIdentifier"))?;
        return COMPARISONS.contains(&&*operator).then_some((left, node.node("right")?));
    }
    let callee = node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression"))?;
    let method = callee.node("property").and_then(|property| property.name()).unwrap_or_default();
    let argument = node.list("arguments").first().copied().flatten().filter(|argument| !argument.is("SpreadElement"))?;
    CONTAINMENT.contains(&&*method).then_some((callee.node("object")?, argument))
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let text = context.file.text;
    let mut found = Vec::new();
    for node in view.nodes() {
        let Some((left, right)) = compared(node) else { continue };
        if let Some(message) = mismatch(text, left, right).filter(|_| !platform_aware(text, node)) {
            found.push((node.start(), node.end(), message));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message.to_string());
    }
}
