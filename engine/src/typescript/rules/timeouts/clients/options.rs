//! `timeout-options.mts`: what client options and connection strings say about a statement or request timeout.
use super::super::config::is_absent;
use crate::typescript::rules::database::options::is_env_read;
use crate::typescript::rules::security_values::{resolved_value, static_key, variable_of};
use crate::typescript::rules::support::scope::{Reference, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::{quasi_text, string_value};
use regex::Regex;
use std::sync::LazyLock;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum State {
    Set,
    Missing,
    Unknown,
}

const TIMEOUT_KEYS: [&str; 2] = ["statement_timeout", "query_timeout"];
const SEPARATORS: [char; 6] = [' ', '\t', '=', ':', '\'', '"'];
const MAX_SPREADS: usize = 4;

static ZERO_VALUE: LazyLock<Regex> = LazyLock::new(|| Regex::new("^0+(?:ms|s)?$").expect("zero"));
static ENCODED_EQUALS: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)%3D").expect("equals"));
static SETTING: LazyLock<Regex> = LazyLock::new(|| Regex::new("^[0-9A-Za-z_.]*").expect("setting"));

pub fn either(states: &[State]) -> State {
    if states.contains(&State::Set) {
        return State::Set;
    }
    if states.contains(&State::Unknown) { State::Unknown } else { State::Missing }
}

fn is_concatenation(node: Option<Node>) -> bool {
    node.is_some_and(|node| node.is("BinaryExpression") && node.text("operator").as_deref() == Some("+"))
}

fn piece_text(piece: Option<Node>) -> (String, bool) {
    if let Some(template) = piece.filter(|piece| piece.is("TemplateLiteral")) {
        let quasis = template.nodes("quasis").len();
        let text: Vec<String> = (0..quasis).map(|index| quasi_text(template, index)).collect();
        return (text.join(" "), template.nodes("expressions").is_empty());
    }
    match string_value(piece) {
        Some(text) => (text, true),
        None => (String::new(), false),
    }
}

fn visible_text<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> (String, bool) {
    let mut pieces = vec![resolved_value(scopes, node)];
    for _ in 0..MAX_SPREADS {
        pieces = pieces
            .into_iter()
            .flat_map(|piece| match piece.filter(|piece| is_concatenation(Some(*piece))) {
                Some(join) => vec![resolved_value(scopes, join.node("left")), resolved_value(scopes, join.node("right"))],
                None => vec![piece],
            })
            .collect();
    }
    let texts: Vec<(String, bool)> = pieces.into_iter().map(piece_text).collect();
    (texts.iter().map(|(text, _)| text.as_str()).collect(), texts.iter().all(|(_, complete)| *complete))
}

/// `textOf`: the text a value is known to make.
pub fn text_of<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<String> {
    let (text, complete) = visible_text(scopes, node);
    complete.then_some(text)
}

fn setting_value(rest: &str) -> String {
    let decoded = ENCODED_EQUALS.replace_all(rest, "=");
    let Some(first) = decoded.char_indices().find(|(_, char)| !SEPARATORS.contains(char)).map(|(at, _)| at) else { return String::new() };
    SETTING.find(&decoded[first..]).map(|found| found.as_str().to_string()).unwrap_or_default()
}

/// `carriesTimeout`: the text sets `statement_timeout` or `query_timeout` to something other than zero.
pub fn carries_timeout(text: &str) -> bool {
    TIMEOUT_KEYS.iter().any(|key| text.split(key).skip(1).any(|rest| !ZERO_VALUE.is_match(&setting_value(rest))))
}

pub fn text_state<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>, unknown_text: State) -> State {
    let (text, complete) = visible_text(scopes, node);
    if carries_timeout(&text) {
        return State::Set;
    }
    if complete { State::Missing } else { unknown_text }
}

/// `TimeoutOptions`: the keyed entries of an object, spreads expanded, and whether some entry cannot be read.
pub struct Options<'c, 'a, 's> {
    pub scopes: &'c Scopes<'a, 's>,
    entries: Vec<Node<'s>>,
    opaque: bool,
}

/// `optionsOf`: the options of an object a value resolves to.
pub fn options_of<'c, 'a, 's>(scopes: &'c Scopes<'a, 's>, node: Option<Node<'s>>) -> Option<Options<'c, 'a, 's>> {
    let object = resolved_value(scopes, Some(node?)).filter(|object| object.is("ObjectExpression"))?;
    let mut options = Options { scopes, entries: Vec::new(), opaque: false };
    let mut items = object.nodes("properties");
    for _ in 0..MAX_SPREADS {
        let mut next = Vec::new();
        for entry in items {
            if !entry.is("SpreadElement") {
                next.push(entry);
                continue;
            }
            match resolved_value(scopes, entry.node("argument")).filter(|inner| inner.is("ObjectExpression")) {
                Some(inner) => next.extend(inner.nodes("properties")),
                None => options.opaque = true,
            }
        }
        items = next;
    }
    for entry in items {
        if entry.is("Property") && static_key(entry).is_some() {
            options.entries.push(entry);
        } else {
            options.opaque = true;
        }
    }
    Some(options)
}

impl<'s> Options<'_, '_, 's> {
    /// `valueOf`: the value of the last entry of that key.
    pub fn value_of(&self, key: &str) -> Option<Node<'s>> {
        self.entries.iter().rfind(|entry| static_key(**entry).as_deref() == Some(key)).and_then(|entry| entry.node("value"))
    }

    fn absent_state(&self) -> State {
        if self.opaque { State::Unknown } else { State::Missing }
    }

    pub fn key_state(&self, key: &str) -> State {
        match self.value_of(key) {
            None => self.absent_state(),
            Some(value) if is_absent(self.scopes, Some(value)) => State::Missing,
            Some(_) => State::Set,
        }
    }

    fn text_key_state(&self, key: &str, unknown_text: State) -> State {
        match self.value_of(key) {
            None => self.absent_state(),
            Some(value) => text_state(self.scopes, Some(value), unknown_text),
        }
    }

    pub fn nested_state(&self, key: &str, judge: impl FnOnce(&Scopes<'_, 's>, Node<'s>) -> State) -> State {
        match self.value_of(key) {
            None => self.absent_state(),
            Some(value) => judge(self.scopes, value),
        }
    }
}

/// `postgresOptionsState`: a pg connection string or options object.
pub fn postgres_options_state<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> State {
    let Some(node) = node.filter(|node| !is_env_read(*node)) else { return State::Missing };
    if text_of(scopes, Some(node)).is_some() {
        return text_state(scopes, Some(node), State::Missing);
    }
    let Some(options) = options_of(scopes, Some(node)) else { return State::Unknown };
    either(&[
        options.key_state("statement_timeout"),
        options.key_state("query_timeout"),
        options.text_key_state("options", State::Unknown),
        options.text_key_state("connectionString", State::Missing),
    ])
}

/// `referencesOfDeclaredVariable`: the references of the name a declarator declares.
pub fn references_of_declared<'s>(scopes: &Scopes<'_, 's>, declarator: Option<Node<'s>>) -> Vec<Reference<'s>> {
    let id = declarator.filter(|declarator| declarator.is("VariableDeclarator")).and_then(|declarator| declarator.node("id")).filter(|id| id.is("Identifier"));
    id.and_then(|id| variable_of(scopes, id)).map(|variable| scopes.references(variable)).unwrap_or_default()
}
