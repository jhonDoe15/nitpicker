//! `replace-chains.mts` of the pattern rules: chains of `replace` calls, and the calls and names that escape.
use crate::typescript::rules::patterns::syntax::callee_name_of;
use crate::typescript::rules::security_values::unwrapped;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::string_value;
use regex::Regex;
use std::sync::LazyLock;

const REPLACE_METHODS: [&str; 2] = ["replace", "replaceAll"];
static ESCAPE_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)escape|quote").expect("pattern"));
static ESCAPING_REPLACEMENT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\$[&0-9]|^[\\!^]{1,2}[%_]$").expect("pattern"));

pub struct Chain<'v> {
    pub replacements: Vec<Option<String>>,
    pub root: Node<'v>,
}

/// `textReceiverOf`: what a text-preserving method or `String(...)` is applied to.
pub fn text_receiver_of<'v>(node: Node<'v>, methods: &[&str]) -> Option<Node<'v>> {
    let callee = node.node("callee")?;
    if callee.is("MemberExpression") {
        return callee_name_of(callee).filter(|name| methods.contains(&name.as_str())).and(callee.node("object"));
    }
    let arguments = node.nodes("arguments");
    let string = callee.is("Identifier") && callee.name().as_deref() == Some("String") && arguments.len() == 1;
    if string { arguments.first().copied() } else { None }
}

/// `replaceReceiver`: a `replace` or `replaceAll` call with two arguments.
pub fn replace_receiver(node: Node) -> Option<Node> {
    let target = unwrapped(node);
    let callee = target.node("callee").filter(|callee| target.is("CallExpression") && callee.is("MemberExpression"))?;
    let named = callee_name_of(callee).is_some_and(|name| REPLACE_METHODS.contains(&name.as_str()));
    (named && target.nodes("arguments").len() == 2).then_some(target)
}

fn replacement_text(call: Node) -> Option<String> {
    string_value(call.nodes("arguments").get(1).copied())
}

/// `replaceChainAt`: the replacements of a chain, the innermost first, and what the chain starts from.
pub fn replace_chain_at(top: Node) -> Chain {
    let mut replacements = Vec::new();
    let mut current = top;
    loop {
        let Some(call) = replace_receiver(current) else { break };
        let Some(object) = call.node("callee").and_then(|callee| callee.node("object")) else { break };
        replacements.push(replacement_text(call));
        current = object;
    }
    replacements.reverse();
    Chain { replacements, root: current }
}

/// `isChainTop`: no `replace` call is made on the result.
pub fn is_chain_top(call: Node) -> bool {
    let Some(holder) = call.parent() else { return true };
    let outer = holder.parent();
    !(holder.is("MemberExpression")
        && holder.node("object") == Some(call)
        && outer.is_some_and(|outer| outer.is("CallExpression") && replace_receiver(outer).is_some()))
}

/// `isEscapingLink`: the replacement inserts the match (`$&`) or escapes a LIKE wildcard.
pub fn is_escaping_replacement(replacement: Option<&str>) -> bool {
    replacement.is_some_and(|replacement| ESCAPING_REPLACEMENT.is_match(replacement))
}

/// `isEscapingLink` of a `replace` call.
pub fn is_escaping_call(call: Node) -> bool {
    is_escaping_replacement(replacement_text(call).as_deref())
}

/// `isEscapeCall`: a call to something named for escaping or quoting.
pub fn is_escape_call(node: Node) -> bool {
    let target = unwrapped(node);
    target.is("CallExpression") && ESCAPE_NAME.is_match(&target.node("callee").and_then(callee_name_of).unwrap_or_default())
}

/// `isEscapedRoot`.
pub fn is_escaped_root(node: Node) -> bool {
    let target = unwrapped(node);
    is_escape_call(target) || (target.is("Identifier") && target.name().is_some_and(|name| ESCAPE_NAME.is_match(&name)))
}
