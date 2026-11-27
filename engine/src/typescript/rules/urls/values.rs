//! `url-values.mts` of the ESLint plugin: the names an expression ends in, which values are plain enough to put in a
//! URL as they are, and the text of a template's parts.
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::writes::syntax::unwrapped;
use regex::Regex;
use std::sync::LazyLock;

pub const SPACE: &str = r"[\t\n\x0B\x0C\r\p{Z}\x{FEFF}]";
const URL_PARTS: [&str; 7] = ["href", "pathname", "search", "origin", "host", "hostname", "protocol"];
static ENCODER_TEXT: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)encode|escape|searchparams|stringify|querystring|\.toString\(\)").expect("pattern"));
static PLAIN_NAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"^(?:id|ids|uuid|guid|page|limit|offset|skip|take|count|size|index|idx|i|n|version|timestamp|ts|",
        r"port|year|month|day|total|length|num|number)$|(?:Id|ID|Ids|Count|Index|Page|Limit|Offset|Size|",
        r"Number|Num|Version|Port|Timestamp|Time|Date)$",
    ))
    .expect("pattern")
});
pub static CONSTANT_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Z][A-Z0-9_]*$").expect("pattern"));
static PLAIN_TEXT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Za-z0-9_.~-]*$").expect("pattern"));

fn branches_of(node: Node) -> Vec<Node> {
    let value = unwrapped(node);
    match value.kind() {
        "LogicalExpression" => value.node("left").into_iter().chain(value.node("right")).collect(),
        "ConditionalExpression" => value.node("consequent").into_iter().chain(value.node("alternate")).collect(),
        _ => Vec::new(),
    }
}

/// `leafNamesOf`: the last name of every leaf of a chain of `||`, `??`, `&&` and `?:`, depth first.
pub fn leaf_names_of(node: Node) -> Vec<String> {
    let mut names = Vec::new();
    let mut pending = vec![node];
    while let Some(item) = pending.pop() {
        let branches = branches_of(item);
        if branches.is_empty() {
            names.extend(last_name_of(item));
        }
        pending.extend(branches.into_iter().rev());
    }
    names
}

/// `lastNameOf`: an identifier's name, or the property a plain member reads.
pub fn last_name_of(node: Node) -> Option<String> {
    let value = unwrapped(node);
    if value.is("Identifier") {
        return value.name().map(|name| name.into_owned());
    }
    if value.is("MemberExpression") && !value.flag("computed") {
        return value.node("property").and_then(|property| property.name()).map(|name| name.into_owned());
    }
    None
}

fn is_plain_leaf(value: Node) -> bool {
    match value.kind() {
        "Literal" => match value.get("value") {
            Value::Text(..) => value.text("value").is_some_and(|text| PLAIN_TEXT.is_match(&text)),
            _ => true,
        },
        "MemberExpression" if !value.flag("computed") => {
            let member = value.node("property").and_then(|property| property.name()).unwrap_or_default();
            URL_PARTS.contains(&&*member) || member == "length" || PLAIN_NAME.is_match(&member) || CONSTANT_NAME.is_match(&member)
        }
        "Identifier" => value.name().is_some_and(|name| PLAIN_NAME.is_match(&name) || CONSTANT_NAME.is_match(&name)),
        "BinaryExpression" => value.text("operator").as_deref() != Some("+"),
        "UnaryExpression" => true,
        _ => false,
    }
}

/// `isPlainValue`: every leaf of a chain of `||`, `??` and `&&` is a number, a plain word, a URL part or a count.
pub fn is_plain_value(node: Node) -> bool {
    let mut pending = vec![node];
    let mut index = 0;
    while index < pending.len() {
        let value = unwrapped(pending[index]);
        index += 1;
        if value.is("LogicalExpression") {
            pending.extend(value.node("left").into_iter().chain(value.node("right")));
        } else if !is_plain_leaf(value) {
            return false;
        }
    }
    true
}

pub fn is_encoded_text(text: &str) -> bool {
    ENCODER_TEXT.is_match(text)
}

/// A string value as JavaScript holds it, each lone surrogate as U+FFFD, which every test these rules make on the
/// text answers the same way for.
fn lossy(node: Node, value: Value) -> Option<String> {
    node.view.utf16(value).map(|units| String::from_utf16_lossy(&units))
}

fn quasi_field(template: Node, index: usize, field: &str) -> Option<String> {
    let quasi = template.list("quasis").get(index).copied().flatten()?;
    match quasi.get("value") {
        Value::Node(at) => {
            let value = template.view.at(at);
            lossy(value, value.get(field))
        }
        _ => None,
    }
}

/// `quasiText`: the cooked text of a template's part, empty where there is none.
pub fn quasi_text(template: Node, index: usize) -> String {
    quasi_field(template, index, "cooked").unwrap_or_default()
}

/// The raw text of a template's part.
pub fn quasi_raw(template: Node, index: usize) -> Option<String> {
    quasi_field(template, index, "raw")
}

/// `stringValue`: a string literal or a template without placeholders.
pub fn string_value(node: Option<Node>) -> Option<String> {
    let node = node?;
    if node.is("Literal") {
        return matches!(node.get("value"), Value::Text(..)).then(|| lossy(node, node.get("value"))).flatten();
    }
    (node.is("TemplateLiteral") && node.nodes("expressions").is_empty()).then(|| quasi_field(node, 0, "cooked")).flatten()
}

pub fn is_url_constructor(node: Option<Node>) -> bool {
    node.is_some_and(|node| node.is("Identifier") && node.name().as_deref() == Some("URL"))
}

/// The source text of a node.
pub fn source<'t>(text: &'t str, node: Node) -> &'t str {
    &text[node.start() as usize..node.end() as usize]
}

/// `stringValue` as UTF-16 code units, lone surrogates kept.
pub fn string_units(node: Option<Node>) -> Option<Vec<u16>> {
    let node = node?;
    if node.is("Literal") {
        return matches!(node.get("value"), Value::Text(..)).then(|| node.view.utf16(node.get("value"))).flatten();
    }
    if !node.is("TemplateLiteral") || !node.nodes("expressions").is_empty() {
        return None;
    }
    match node.list("quasis").first().copied().flatten()?.get("value") {
        Value::Node(at) => node.view.utf16(node.view.at(at).get("cooked")),
        _ => None,
    }
}
