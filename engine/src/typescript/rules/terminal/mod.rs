//! `no-unstripped-remote-text`: text from a socket message or a network response printed to the terminal without
//! its control sequences stripped.
pub mod remote_text;

use self::remote_text::{Taint, plain_name, taint_of};
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::{member_name, unwrapped};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::SPACE;
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-unstripped-remote-text";
const MESSAGE: &str = "Text from a socket message or network response can hold ANSI or control sequences that rewrite earlier terminal lines or hide output. Strip them first with `util.stripVTControlCharacters(text)` or print `JSON.stringify(text)`.";
const CONSOLE_METHODS: [&str; 5] = ["log", "info", "warn", "error", "debug"];
const TEXT_METHODS: [&str; 6] = ["toString", "trim", "slice", "substring", "toLowerCase", "toUpperCase"];

static LOGGER_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^(?:logger|log)$").expect("pattern"));
static NODE_FILE: LazyLock<Regex> = LazyLock::new(|| {
    let pattern = concat!(
        r"(?-u:\b)process\.(?:stdout|stderr|argv|exit|env)(?-u:\b)",
        r#"|from(?:SPACE)+['"]node:"#,
        r#"|require\(['"](?:node:)?(?:fs|path|child_process|os|util|readline)['"]\)"#,
    );
    Regex::new(&pattern.replace("SPACE", SPACE)).expect("pattern")
});
static BROWSER_FILE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?-u:\b)document\.|(?-u:\b)window\.").expect("pattern"));

fn is_terminal_sink(call: Node) -> bool {
    let Some(callee) = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression")) else { return false };
    let method = member_name(callee).unwrap_or_default();
    let object = callee.node("object");
    let owner = plain_name(object);
    if method == "write" {
        return owner == "stdout" || owner == "stderr";
    }
    let bare = object.is_some_and(|object| object.is("Identifier"));
    CONSOLE_METHODS.contains(&method.as_str()) && (owner == "console" || (bare && LOGGER_NAME.is_match(&owner)))
}

fn carried_children(plain: Node) -> Option<Vec<Node>> {
    match plain.kind() {
        "TemplateLiteral" => return Some(plain.nodes("expressions")),
        "BinaryExpression" if plain.text("operator").as_deref() == Some("+") => {
            return Some(plain.node("left").into_iter().chain(plain.node("right")).collect());
        }
        "BinaryExpression" => return Some(Vec::new()),
        "CallExpression" => {}
        _ => return None,
    }
    let callee = unwrapped(plain.node("callee")?);
    if callee.is("Identifier") && callee.name().as_deref() == Some("String") {
        return Some(plain.nodes("arguments"));
    }
    let text_method = callee.is("MemberExpression") && TEXT_METHODS.contains(&member_name(callee).unwrap_or_default().as_str());
    if text_method { callee.node("object").map(|object| vec![object]) } else { None }
}

fn is_remote<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    let mut pending = vec![(node, false)];
    let mut index = 0;
    while index < pending.len() {
        let (item, stringy) = pending[index];
        index += 1;
        let plain = unwrapped(item);
        match carried_children(plain) {
            Some(children) => pending.extend(children.into_iter().map(|child| (child, true))),
            None => {
                let taint = taint_of(scopes, plain);
                if taint == Some(Taint::Text) || (taint == Some(Taint::Body) && (stringy || plain.is("MemberExpression"))) {
                    return true;
                }
            }
        }
    }
    false
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let text = context.file.text.strip_prefix('\u{feff}').unwrap_or(context.file.text);
    if !NODE_FILE.is_match(text) || BROWSER_FILE.is_match(text) {
        return;
    }
    let mut found = Vec::new();
    for call in view.nodes().filter(|node| node.is("CallExpression") && is_terminal_sink(*node)) {
        found.extend(call.nodes("arguments").into_iter().filter(|argument| is_remote(scopes, *argument)).map(|argument| (argument.start(), argument.end())));
    }
    for (start, end) in found {
        context.report_range(RULE, start, Some(end), MESSAGE.to_string());
    }
}
