//! `no-unescaped-css-selector`: a runtime value put in a CSS selector by a DOM query, Cypress or Puppeteer call
//! without `CSS.escape`. Run without type information, the value kinds of `value-kinds.mts` are never known.
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::{member_name, resolve_constant, unwrapped};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::urls::values::{SPACE, quasi_text, string_value};
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-unescaped-css-selector";
const ESCAPE_VALUE: &str = "A runtime value in a CSS selector can hold quotes, brackets, colons, dots or a leading digit and then throw or match the wrong elements. Write `#${CSS.escape(id)}` or `[data-name=\"${CSS.escape(name)}\"]`.";
const HAND_ESCAPED: &str = "This value is escaped by hand for a CSS selector, which covers only the characters the `replace` names. Use `CSS.escape(value)` instead.";
const DOM_METHODS: [&str; 5] = ["querySelector", "querySelectorAll", "closest", "matches", "webkitMatchesSelector"];
const SAFE_PROPERTIES: [&str; 3] = ["length", "size", "index"];
const REPLACERS: [&str; 2] = ["replace", "replaceAll"];
const BACKSLASH_PREFIX: &str = "\\$";

static NAME_POSITION: LazyLock<Regex> = LazyLock::new(|| Regex::new(&format!(r#"(?:[#.]|\[[^\]]*={SPACE}*["']?)$"#)).expect("pattern"));
static SAFE_TEXT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Za-z0-9_-]*$").expect("pattern"));
static CLASS_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)class|cls").expect("pattern"));
static CONSTANT_ROOT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Z][A-Z0-9_]*$").expect("pattern"));
static COUNT_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)(?:index|idx|count|month|year|num)$").expect("pattern"));
static ESCAPE_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)escape").expect("pattern"));

enum Part<'s> {
    Text(String),
    Value(Node<'s>),
}

fn tool_methods(owner: &str) -> &'static [&'static str] {
    match owner {
        "cy" => &["get", "find"],
        "page" => &["$", "$$", "waitForSelector"],
        _ => &[],
    }
}

fn is_selector_call(call: Node) -> bool {
    let Some(callee) = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression")) else { return false };
    let method = member_name(callee).unwrap_or_default();
    let object = callee.node("object").filter(|object| object.is("Identifier"));
    let owner = object.and_then(|object| object.name()).unwrap_or_default();
    DOM_METHODS.contains(&method.as_str()) || tool_methods(&owner).contains(&method.as_str())
}

fn leaf_parts(plain: Node) -> Option<Vec<Part>> {
    if plain.is("TemplateLiteral") {
        let expressions = plain.nodes("expressions");
        let quasis = plain.list("quasis").len();
        let mut parts = Vec::new();
        for index in 0..quasis {
            parts.push(Part::Text(quasi_text(plain, index)));
            parts.extend(expressions.get(index).copied().map(Part::Value));
        }
        return Some(parts);
    }
    string_value(Some(plain)).map(|text| vec![Part::Text(text)])
}

fn is_concatenation(node: Node) -> bool {
    node.is("BinaryExpression") && node.text("operator").as_deref() == Some("+")
}

fn parts_of(node: Node) -> Option<Vec<Part>> {
    let root = unwrapped(node);
    if !is_concatenation(root) {
        return leaf_parts(root);
    }
    let mut operands: Vec<Node> = root.node("left").into_iter().chain(root.node("right")).collect();
    let mut leaves = Vec::new();
    let mut index = 0;
    while index < operands.len() {
        let operand = operands[index];
        let plain = unwrapped(operand);
        if is_concatenation(plain) {
            let children: Vec<Node> = plain.node("left").into_iter().chain(plain.node("right")).collect();
            operands.splice(index + 1..index + 1, children);
        } else {
            leaves.push(operand);
        }
        index += 1;
    }
    Some(leaves.into_iter().flat_map(|leaf| leaf_parts(unwrapped(leaf)).unwrap_or_else(|| vec![Part::Value(leaf)])).collect())
}

fn callee_name(callee: Node) -> Option<String> {
    if callee.is("MemberExpression") {
        return member_name(callee);
    }
    if callee.is("Identifier") { callee.name().map(|name| name.into_owned()) } else { None }
}

fn is_escape_call(node: Node) -> bool {
    let name = node.node("callee").map(unwrapped).and_then(callee_name);
    let name = name.as_deref();
    ESCAPE_NAME.is_match(name.unwrap_or_default()) || name == Some("Number") || name == Some("parseInt")
}

fn is_safe_value<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    let plain = unwrapped(node);
    let constant = resolve_constant(scopes, Some(plain));
    if constant.is_some_and(|constant| constant.is("Literal") && matches!(constant.get("value"), Value::Number(..))) {
        return true;
    }
    if let Some(text) = string_value(constant) {
        return SAFE_TEXT.is_match(&text);
    }
    plain.is("MemberExpression") && SAFE_PROPERTIES.contains(&member_name(plain).unwrap_or_default().as_str())
}

fn last_name(node: Node) -> String {
    if node.is("Identifier") {
        return node.name().map(|name| name.into_owned()).unwrap_or_default();
    }
    if node.is("MemberExpression") { member_name(node).unwrap_or_default() } else { String::new() }
}

fn is_hand_escaped(node: Node) -> bool {
    let plain = unwrapped(node);
    let callee = plain.node("callee").filter(|_| plain.is("CallExpression")).map(unwrapped);
    callee.is_some_and(|callee| callee.is("MemberExpression") && REPLACERS.contains(&member_name(callee).unwrap_or_default().as_str()))
}

fn is_backslash_escape(node: Node) -> bool {
    let replacement = node.list("arguments").get(1).copied().flatten();
    string_value(replacement).is_some_and(|text| text.contains(BACKSLASH_PREFIX))
}

fn root_name(node: Node) -> String {
    let mut link = node;
    loop {
        let plain = unwrapped(link);
        if !plain.is("MemberExpression") {
            return last_name(plain);
        }
        match plain.node("object") {
            Some(object) => link = object,
            None => return String::new(),
        }
    }
}

fn is_constant_or_count(node: Node) -> bool {
    let plain = unwrapped(node);
    (plain.is("MemberExpression") && CONSTANT_ROOT.is_match(&root_name(plain))) || COUNT_NAME.is_match(&last_name(plain))
}

fn is_checked_kind(node: Node) -> bool {
    let plain = unwrapped(node);
    plain.is("Identifier") || plain.is("MemberExpression") || is_hand_escaped(plain)
}

fn findings<'s>(scopes: &Scopes<'_, 's>, parts: &[Part<'s>]) -> Vec<(Node<'s>, bool)> {
    let mut found = Vec::new();
    for (index, part) in parts.iter().enumerate() {
        let Part::Value(node) = part else { continue };
        let Some(Part::Text(before)) = index.checked_sub(1).and_then(|previous| parts.get(previous)) else { continue };
        let plain = unwrapped(*node);
        let call = plain.is("CallExpression");
        let backslash = call && is_backslash_escape(plain);
        let hand = is_hand_escaped(plain) && !backslash;
        let escaped = call && !hand && is_escape_call(plain);
        let safe = backslash || is_constant_or_count(plain) || (!hand && is_safe_value(scopes, plain));
        let skip = escaped || !is_checked_kind(plain) || safe;
        let class_name = before.ends_with('.') && CLASS_NAME.is_match(&last_name(plain));
        if !skip && !class_name && NAME_POSITION.is_match(before) {
            found.push((*node, hand));
        }
    }
    found
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("CallExpression")) {
        let selector = node.list("arguments").first().copied().flatten();
        let parts = selector.filter(|_| is_selector_call(node)).and_then(parts_of);
        found.extend(parts.map(|parts| findings(scopes, &parts)).unwrap_or_default());
    }
    for (node, hand) in found {
        let message = if hand { HAND_ESCAPED } else { ESCAPE_VALUE };
        context.report_range(RULE, node.start(), Some(node.end()), message.to_string());
    }
}
