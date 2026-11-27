//! `query-texts.mts`: the SQL text a string, template or `sql` tagged template holds, with the values it
//! interpolates resolved where they are constants or nested `sql` templates, and the order gaps in it.
use super::sql_order::{DYNAMIC, SqlGap, sql_order_gaps};
use crate::typescript::rules::queries::sql_sinks::sink_for;
use crate::typescript::rules::security_values::{member_name, resolved_value, string_value, unwrapped};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use regex::Regex;
use std::sync::LazyLock;

const SQL_TAGS: [&str; 2] = ["sql", "SQL"];
const RAW_TAGS: [&str; 2] = ["$queryRaw", "sql"];
const MAX_DEPTH: usize = 4;
const EXPANSIONS: usize = 2 * MAX_DEPTH + 2;

/// `/^\s*(?:\(\s*)?(?:select|with)\b/iu`, the boundary checked by hand.
static STATEMENT_START: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[\t\n\x0B\x0C\r\p{Z}\x{FEFF}]*(?:\([\t\n\x0B\x0C\r\p{Z}\x{FEFF}]*)?(?i:select|with)").expect("pattern"));
static ORDER_WORD: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(?i:limit|offset|fetch|array_agg|jsonb?_agg)").expect("pattern"));

enum Piece<'s> {
    Text(String),
    Template(Node<'s>, usize),
    Value(Node<'s>, usize),
}

/// `\w` of a JavaScript `/iu` pattern: ASCII word characters and the two that case-fold into them.
fn is_iu_word(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_' || character == '\u{17F}' || character == '\u{212A}'
}

fn ends_word(text: &str, end: usize) -> bool {
    !text[end..].chars().next().is_some_and(is_iu_word)
}

fn starts_statement(text: &str) -> bool {
    STATEMENT_START.find(text).is_some_and(|found| ends_word(text, found.end()))
}

/// `ORDER_WORDS.test`: one of the words, with a word boundary on both sides.
fn has_order_word(text: &str) -> bool {
    let mut before: Option<char> = None;
    for (at, character) in text.char_indices() {
        if !before.is_some_and(is_iu_word) && let Some(found) = ORDER_WORD.find(&text[at..]) {
            if ends_word(text, at + found.end()) {
                return true;
            }
        }
        before = Some(character);
    }
    false
}

fn tag_name(tag: Node) -> Option<String> {
    let target = unwrapped(tag);
    if target.is("Identifier") {
        return target.name().filter(|name| SQL_TAGS.contains(&name.as_ref())).map(|name| name.into_owned());
    }
    let name = if target.is("MemberExpression") { member_name(target) } else { None };
    name.filter(|name| RAW_TAGS.contains(&name.as_str()) || SQL_TAGS.contains(&name.as_str()))
}

fn is_sql_template(node: Option<Node>) -> bool {
    node.is_some_and(|node| node.is("TaggedTemplateExpression") && node.node("tag").and_then(tag_name).is_some())
}

fn raw_text<'s>(scopes: &Scopes<'_, 's>, target: Node<'s>) -> Option<String> {
    let callee = target.node("callee").map(unwrapped).filter(|_| target.is("CallExpression"));
    let raw = callee.is_some_and(|callee| callee.is("MemberExpression") && member_name(callee).as_deref() == Some("raw"));
    let value = if raw { string_value(resolved_value(scopes, target.nodes("arguments").first().copied())) } else { None };
    value.or_else(|| string_value(resolved_value(scopes, Some(target))))
}

fn cooked(quasi: Node) -> String {
    match quasi.get("value") {
        Value::Node(index) => quasi.view.at(index).text("cooked").map(|text| text.into_owned()).unwrap_or_default(),
        _ => String::new(),
    }
}

fn expand<'s>(scopes: &Scopes<'_, 's>, piece: Piece<'s>) -> Vec<Piece<'s>> {
    match piece {
        Piece::Text(text) => vec![Piece::Text(text)],
        Piece::Template(template, depth) => {
            let expressions = template.nodes("expressions");
            let mut pieces = Vec::new();
            for (index, quasi) in template.nodes("quasis").into_iter().enumerate() {
                pieces.push(Piece::Text(cooked(quasi)));
                pieces.extend(expressions.get(index).map(|value| Piece::Value(*value, depth)));
            }
            pieces
        }
        Piece::Value(value, depth) => {
            let target = unwrapped(value);
            if is_sql_template(Some(target)) {
                let quasi = target.node("quasi").filter(|_| depth < MAX_DEPTH);
                return vec![quasi.map_or_else(|| Piece::Text(DYNAMIC.to_string()), |quasi| Piece::Template(quasi, depth + 1))];
            }
            vec![Piece::Text(raw_text(scopes, target).unwrap_or_else(|| DYNAMIC.to_string()))]
        }
    }
}

fn template_text<'s>(scopes: &Scopes<'_, 's>, template: Node<'s>) -> String {
    let mut pieces = vec![Piece::Template(template, 0)];
    for _ in 0..EXPANSIONS {
        pieces = pieces.into_iter().flat_map(|piece| expand(scopes, piece)).collect();
    }
    pieces.into_iter().map(|piece| if let Piece::Text(text) = piece { text } else { DYNAMIC.to_string() }).collect()
}

fn is_inside_sql_template(node: Node) -> bool {
    node.parent().is_some_and(|parent| parent.is("TemplateLiteral") && is_sql_template(parent.parent()))
}

fn sql_text_of<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<String> {
    if node.is("TaggedTemplateExpression") {
        let quasi = node.node("quasi").filter(|_| is_sql_template(Some(node)) && !is_inside_sql_template(node))?;
        return Some(template_text(scopes, quasi));
    }
    if node.parent().is_some_and(|parent| parent.is("TaggedTemplateExpression")) || is_inside_sql_template(node) {
        return None;
    }
    let text = if node.is("TemplateLiteral") { Some(template_text(scopes, node)) } else { string_value(Some(node)).filter(|_| node.is("Literal")) }?;
    if !has_order_word(&text) {
        return None;
    }
    (starts_statement(&text) || sink_for(scopes, node).is_some()).then_some(text)
}

/// `sqlGaps`: the order gaps of the SQL text `node` holds.
pub fn sql_gaps<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Vec<SqlGap> {
    sql_text_of(scopes, node).map(|text| sql_order_gaps(&text)).unwrap_or_default()
}
