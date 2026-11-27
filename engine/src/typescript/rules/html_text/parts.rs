//! `html-parts.mts` of the ESLint plugin: the texts and values of a template or a `+` chain, whether its text is
//! HTML markup, and whether a value sits inside a tag or as a whole text run between tags.
use crate::typescript::rules::patterns::syntax::{callee_name_of, operands_of};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::{quasi_text, string_value};

const TAGS: [&str; 67] = [
    "a", "abbr", "article", "aside", "b", "blockquote", "body", "br", "button", "caption", "code", "dd", "del", "div", "dl", "dt",
    "em", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "head", "header", "hr", "html", "i", "iframe", "img",
    "input", "ins", "label", "li", "link", "main", "mark", "meta", "nav", "ol", "option", "p", "pre", "script", "section",
    "select", "small", "span", "strong", "style", "sub", "sup", "svg", "table", "tbody", "td", "textarea", "tfoot", "th",
    "thead", "title", "tr", "u", "ul",
];
const DIAGNOSTIC_CALLS: [&str; 8] = ["invariant", "warning", "warn", "assert", "error", "log", "info", "debug"];

#[derive(Clone)]
pub enum Part<'s> {
    Text(String),
    Value(Node<'s>),
}

pub struct Fragment<'s> {
    pub texts: Vec<String>,
    pub values: Vec<Node<'s>>,
    pub parts: Vec<Part<'s>>,
}

/// `\s` of a JavaScript regular expression, which `trim` removes too.
pub fn is_js_space(character: char) -> bool {
    matches!(character, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

pub fn js_trim(text: &str) -> &str {
    text.trim_matches(is_js_space)
}

fn is_ascii_word(character: char) -> bool {
    character.is_ascii_alphanumeric() || character == '_'
}

fn ends_tag(rest: &str) -> bool {
    rest.chars().next().is_none_or(|character| is_js_space(character) || character == '>' || character == '/')
}

/// `/(?<![\w)\]])<\/?(?:a|abbr|...)(?=[\s>/]|$)/u`.
fn has_markup(text: &str) -> bool {
    text.match_indices('<').any(|(at, _)| {
        let before = text[..at].chars().next_back();
        if before.is_some_and(|character| is_ascii_word(character) || character == ')' || character == ']') {
            return false;
        }
        let rest = &text[at + 1..];
        let rest = rest.strip_prefix('/').unwrap_or(rest);
        TAGS.iter().any(|tag| rest.strip_prefix(tag).is_some_and(ends_tag))
    })
}

/// `/<[A-Z][\w.]*(?=[\s>/]|$)/u`.
fn has_component_tag(text: &str) -> bool {
    text.match_indices('<').any(|(at, _)| {
        let rest = &text[at + 1..];
        if !rest.starts_with(|character: char| character.is_ascii_uppercase()) {
            return false;
        }
        let name = rest.find(|character: char| !(is_ascii_word(character) || character == '.')).unwrap_or(rest.len());
        ends_tag(&rest[name..])
    })
}

/// `isMarkup`.
pub fn is_markup(texts: &[String]) -> bool {
    texts.iter().any(|text| has_markup(text)) && !texts.iter().any(|text| has_component_tag(text))
}

/// `fragmentOf`.
pub fn fragment_of(node: Node) -> Option<Fragment> {
    if node.is("TemplateLiteral") && !node.nodes("expressions").is_empty() {
        let expressions = node.nodes("expressions");
        let texts: Vec<String> = (0..node.list("quasis").len()).map(|index| quasi_text(node, index)).collect();
        let mut parts = Vec::new();
        for (index, text) in texts.iter().enumerate() {
            parts.push(Part::Text(text.clone()));
            parts.extend(expressions.get(index).copied().map(Part::Value));
        }
        return Some(Fragment { texts, values: expressions, parts });
    }
    if !node.is("BinaryExpression") || node.text("operator").as_deref() != Some("+") {
        return None;
    }
    let operands = operands_of(node, "+");
    let parts: Vec<Part> = operands.iter().map(|operand| string_value(Some(*operand)).map_or(Part::Value(*operand), Part::Text)).collect();
    let texts: Vec<String> = parts.iter().filter_map(|part| if let Part::Text(text) = part { Some(text.clone()) } else { None }).collect();
    let values: Vec<Node> = parts.iter().filter_map(|part| if let Part::Value(value) = part { Some(*value) } else { None }).collect();
    (!texts.is_empty() && !values.is_empty()).then_some(Fragment { texts, values, parts })
}

/// `isFragmentTop`.
pub fn is_fragment_top(node: Node) -> bool {
    let Some(holder) = node.parent() else { return true };
    if node.is("TemplateLiteral") {
        return !holder.is("TaggedTemplateExpression");
    }
    !(holder.is("BinaryExpression") && holder.text("operator").as_deref() == Some("+"))
}

/// `isDiagnosticText`.
pub fn is_diagnostic_text(node: Node) -> bool {
    let Some(holder) = node.parent() else { return false };
    if holder.is("ThrowStatement") {
        return true;
    }
    if !holder.is("NewExpression") && !holder.is("CallExpression") {
        return false;
    }
    let name = holder.node("callee").and_then(callee_name_of).unwrap_or_default();
    holder.nodes("arguments").contains(&node) && (name.ends_with("Error") || DIAGNOSTIC_CALLS.contains(&name.as_str()))
}

fn is_plain_run(text: &str) -> bool {
    !js_trim(text).contains(['\n', '=', ';', '{', '}'])
}

fn literal_text(parts: &[Part]) -> String {
    parts.iter().map(|part| if let Part::Text(text) = part { text.as_str() } else { "" }).collect()
}

/// `isPlacedInMarkup`.
pub fn is_placed_in_markup(fragment: &Fragment, value: Node) -> bool {
    let at = fragment.parts.iter().position(|part| matches!(part, Part::Value(node) if *node == value));
    let (before, after) = match at {
        Some(at) => (literal_text(&fragment.parts[..at]), literal_text(&fragment.parts[at + 1..])),
        None => (literal_text(&fragment.parts[..fragment.parts.len().saturating_sub(1)]), literal_text(&fragment.parts)),
    };
    let close = before.rfind('>');
    if before.rfind('<').is_some_and(|open| close.is_none_or(|close| open > close)) {
        return true;
    }
    let run = close.map_or(before.as_str(), |close| &before[close + 1..]);
    let next = after.find('<');
    is_plain_run(run) && next.map_or(js_trim(&after).is_empty(), |next| is_plain_run(&after[..next]))
}
