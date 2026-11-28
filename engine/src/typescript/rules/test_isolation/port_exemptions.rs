//! `port-exemptions.mts`: fixed ports a test means to use, because it expects the start to fail, its title is
//! about a taken port, or it replaces `listen` with a double.
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_assertions::unowned_async::nodes::all_nodes;
use crate::typescript::rules::test_checks::is_expect_call;
use fancy_regex::Regex as BacktrackingRegex;
use regex::Regex;
use std::sync::LazyLock;

const MAX_PORT: f64 = 65_535.0;
const FAIL_OWNERS: [&str; 4] = ["assert", "t", "expect", "chai"];
/// A word character of a JavaScript pattern with the `iu` flags: `ſ` and the Kelvin sign fold into ASCII letters.
const WORD: &str = r"[A-Za-z0-9_\x{17F}\x{212A}]";

static TAKEN_PORT_TITLE: LazyLock<BacktrackingRegex> = LazyLock::new(|| {
    let before = format!("(?<!{WORD})");
    let after = format!("(?!{WORD})");
    let pattern = format!(
        r"(?i){before}EADDRINUSE{after}|{before}port{after}[^\n\r\x{{2028}}\x{{2029}}]+{before}(?:not available|in use|occupied|taken|busy){after}"
    );
    BacktrackingRegex::new(&pattern).expect("pattern")
});
static LISTEN_DOUBLE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!("(?i)^(?:listen|(?:spy|stub|mock){WORD}*Listen|listen(?:Spy|Stub|Mock))$")).expect("pattern")
});

/// `ownerName`.
fn owner_name(node: Node) -> String {
    let owner = if node.is("MemberExpression") { node.node("property") } else { Some(node) };
    node.name().or_else(|| owner.and_then(|owner| owner.name())).map(|name| name.into_owned()).unwrap_or_default()
}

fn is_fail_call(node: Node) -> bool {
    let Some(callee) = node.node("callee").filter(|_| node.is("CallExpression")) else { return false };
    if callee.is("Identifier") {
        return callee.name().as_deref() == Some("fail");
    }
    callee.is("MemberExpression")
        && callee.node("property").and_then(|property| property.name()).as_deref() == Some("fail")
        && callee.node("object").is_some_and(|object| FAIL_OWNERS.contains(&owner_name(object).as_str()))
}

fn expects_failure(node: Node) -> bool {
    node.ancestors().any(|ancestor| {
        let asserted = is_expect_call(Some(ancestor)) && ancestor.nodes("arguments").iter().any(|argument| argument.contains(node));
        let tried = ancestor.is("TryStatement")
            && ancestor.node("block").is_some_and(|block| block.contains(node) && all_nodes(Some(block)).into_iter().any(is_fail_call));
        asserted || tried
    })
}

/// `String(literal.value)` for the texts a title test can match: strings, and regular expressions as `/source/flags`.
fn literal_text(literal: Node) -> String {
    if let Value::Node(at) = literal.get("regex") {
        let regex = literal.view.at(at);
        return format!("/{}/{}", regex.text("pattern").unwrap_or_default(), regex.text("flags").unwrap_or_default());
    }
    match literal.get("value") {
        Value::Text(..) => literal.text("value").map(|text| text.into_owned()).unwrap_or_default(),
        _ => String::new(),
    }
}

fn title_of(call: Node) -> String {
    let Some(first) = call.list("arguments").first().copied().flatten() else { return String::new() };
    if first.is("Literal") {
        return literal_text(first);
    }
    if !first.is("TemplateLiteral") {
        return String::new();
    }
    let cooked = first.nodes("quasis").into_iter().map(|quasi| match quasi.get("value") {
        Value::Node(at) => quasi.view.at(at).text("cooked").map(|text| text.into_owned()).unwrap_or_default(),
        _ => String::new(),
    });
    cooked.collect::<Vec<_>>().join(" ")
}

fn doubles_listen(owner: Node) -> bool {
    all_nodes(Some(owner)).into_iter().any(|node| {
        if node.is("Literal") {
            return matches!(node.get("value"), Value::Text(..)) && node.text("value").as_deref() == Some("listen");
        }
        let is_property = node.parent().is_some_and(|parent| parent.is("MemberExpression") && parent.node("property") == Some(node));
        node.is("Identifier") && !is_property && node.name().is_some_and(|name| LISTEN_DOUBLE.is_match(&name))
    })
}

/// `isExemptBinding`.
pub fn is_exempt(call: Node, port: f64, owners: &[Node]) -> bool {
    port > MAX_PORT
        || expects_failure(call)
        || owners.iter().any(|owner| TAKEN_PORT_TITLE.is_match(&title_of(*owner)).unwrap_or(false))
        || owners.first().is_some_and(|nearest| doubles_listen(*nearest))
}
