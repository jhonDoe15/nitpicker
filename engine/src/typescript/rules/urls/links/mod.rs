//! `no-unchecked-url-sink`: a runtime URL used as a link, frame source or navigation target without a check of its
//! scheme.
mod sinks;

use super::values::{last_name_of, quasi_text, source, string_value};
use crate::typescript::rules::Context;
use crate::typescript::rules::escaping::is_valid_regex;
use crate::typescript::rules::handlers::walk::{enclosing_function, first_def};
use crate::typescript::rules::security_values::resolve_constant;
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::writes::syntax::unwrapped;
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-unchecked-url-sink";
const MESSAGE: &str = "Check the scheme before this runtime URL becomes a link, frame source or navigation target: a `javascript:` or `data:` value runs script when clicked. Use one helper that parses with `URL.parse` and returns the URL only for `http:` and `https:`.";
const LIST_METHODS: [&str; 6] = ["map", "filter", "forEach", "flatMap", "find", "some"];
const WRAPPER_PROPS: [&str; 5] = ["props", "rest", "other", "others", "restProps"];
const MAX_DEPTH: usize = 5;

static URL_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)(?:url|uri|website|homepage|address|redirect|returnTo)s?$|^(?:src|source)$").expect("pattern"));
static SAFE_START: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^(?:https?://|/(?:[^/]|$)|#|mailto:|tel:|\.{1,2}/|\?)").expect("pattern"));
static GUARD_WORDS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)protocol|http|sanitiz|isSafe|safeUrl|isHttp|isValidUrl|isUrl|allowedProtocols|canParse|isAbsolute|URL\.parse|new URL")
        .expect("pattern")
});
static MAIL_FILE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?:^|/)(?:emails?|__mocks__)/").expect("pattern"));

/// `String(literal.value)` starts safely: a regular expression Node can build prints as `/source/flags`.
fn literal_starts_safely(value: Node) -> bool {
    if let Value::Node(at) = value.get("regex") {
        let regex = value.view.at(at);
        return is_valid_regex(&regex.text("pattern").unwrap_or_default(), &regex.text("flags").unwrap_or_default());
    }
    string_value(Some(value)).is_some_and(|text| SAFE_START.is_match(&text))
}

fn starts_safely(node: Node) -> bool {
    let mut current = node;
    loop {
        let value = unwrapped(current);
        match value.kind() {
            "TemplateLiteral" => return SAFE_START.is_match(&quasi_text(value, 0)),
            "Literal" => return literal_starts_safely(value),
            "BinaryExpression" if value.text("operator").as_deref() == Some("+") => match value.node("left") {
                Some(left) => current = left,
                None => return false,
            },
            _ => return false,
        }
    }
}

fn root_of(node: Node) -> Option<Node> {
    let mut value = unwrapped(node);
    while value.is("MemberExpression") {
        value = unwrapped(value.node("object")?);
    }
    value.is("Identifier").then_some(value)
}

fn root_name(node: Node) -> Option<String> {
    root_of(node).and_then(|root| root.name()).map(|name| name.into_owned())
}

fn is_wrapper(name: &str) -> bool {
    WRAPPER_PROPS.contains(&name)
}

enum Outcome<'v> {
    Runtime,
    Plain,
    Next(Vec<Node<'v>>),
}

struct Check<'c, 'a, 's> {
    scopes: &'c Scopes<'a, 's>,
    text: &'a str,
}

impl<'s> Check<'_, '_, 's> {
    fn is_literal_list_item(&self, node: Node<'s>) -> bool {
        let Some(definition) = root_of(node).and_then(|root| first_def(self.scopes, root)) else { return false };
        if definition.kind != DefKind::Parameter {
            return false;
        }
        let Some(call) = definition.node.parent().filter(|call| call.is("CallExpression")) else { return false };
        let Some(callee) = call.node("callee").filter(|callee| callee.is("MemberExpression")) else { return false };
        let method = callee.node("property").and_then(|property| property.name()).unwrap_or_default();
        LIST_METHODS.contains(&&*method)
            && resolve_constant(self.scopes, callee.node("object")).is_some_and(|list| list.is("ArrayExpression"))
    }

    fn member_is_runtime(&self, value: Node<'s>) -> bool {
        root_name(value).is_some_and(|root| !is_wrapper(&root))
            && URL_NAME.is_match(&last_name_of(value).unwrap_or_default())
            && !self.is_literal_list_item(value)
    }

    fn name_outcome(&self, node: Node<'s>) -> Outcome<'s> {
        let Some(definition) = first_def(self.scopes, node) else { return Outcome::Plain };
        let name = node.name().unwrap_or_default();
        if definition.kind != DefKind::Variable || !URL_NAME.is_match(&name) {
            return Outcome::Plain;
        }
        let Some(init) = definition.node.node("init") else { return Outcome::Plain };
        if definition.node.node("id").is_some_and(|id| id.is("Identifier")) {
            return match resolve_constant(self.scopes, Some(node)) {
                Some(resolved) if resolved != node => Outcome::Next(vec![resolved]),
                _ => Outcome::Plain,
            };
        }
        let runtime = root_name(init).is_some_and(|source| !is_wrapper(&source)) && !init.is("CallExpression");
        if runtime { Outcome::Runtime } else { Outcome::Plain }
    }

    fn outcome(&self, node: Node<'s>, depth: usize) -> Outcome<'s> {
        let value = unwrapped(node);
        if depth > MAX_DEPTH || starts_safely(value) || string_value(Some(value)).is_some() {
            return Outcome::Plain;
        }
        match value.kind() {
            "LogicalExpression" => Outcome::Next(value.node("left").into_iter().chain(value.node("right")).collect()),
            "ConditionalExpression" => Outcome::Next(value.node("consequent").into_iter().chain(value.node("alternate")).collect()),
            "MemberExpression" if self.member_is_runtime(value) => Outcome::Runtime,
            "Identifier" => self.name_outcome(value),
            _ => Outcome::Plain,
        }
    }

    fn is_runtime_value(&self, node: Node<'s>) -> bool {
        let mut pending = vec![(node, 0)];
        let mut index = 0;
        while index < pending.len() {
            let (item, depth) = pending[index];
            index += 1;
            match self.outcome(item, depth) {
                Outcome::Runtime => return true,
                Outcome::Plain => {}
                Outcome::Next(next) => pending.extend(next.into_iter().map(|next| (next, depth + 1))),
            }
        }
        false
    }
}

struct Guard<'v> {
    text: &'v str,
    scope: Option<Node<'v>>,
}

fn guard_test(node: Node) -> Option<Node> {
    match node.kind() {
        "VariableDeclarator" => node.node("init"),
        "IfStatement" | "ConditionalExpression" => node.node("test"),
        "LogicalExpression" => node.node("left"),
        _ => None,
    }
}

fn sink_of(node: Node) -> Option<Node> {
    match node.kind() {
        "JSXAttribute" => sinks::attribute_sink(node),
        "CallExpression" => sinks::call_sink(node),
        "AssignmentExpression" => sinks::assignment_sink(node),
        _ => None,
    }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    if MAIL_FILE.is_match(context.file.path) {
        return;
    }
    let text = context.file.text;
    let state = Check { scopes, text };
    let mut sinks = Vec::new();
    let mut guards = Vec::new();
    for node in view.nodes() {
        sinks.extend(sink_of(node));
        if let Some(test) = guard_test(node) {
            let guard = source(text, test);
            if GUARD_WORDS.is_match(guard) {
                guards.push(Guard { text: guard, scope: enclosing_function(test) });
            }
        }
    }
    let mut found = Vec::new();
    for sink in sinks {
        let sink_text = source(state.text, unwrapped(sink));
        let scope = enclosing_function(sink);
        let guarded = guards.iter().any(|guard| guard.scope == scope && guard.text.contains(sink_text));
        if !guarded && state.is_runtime_value(sink) {
            found.push((sink.start(), sink.end()));
        }
    }
    for (start, end) in found {
        context.report_range(RULE, start, Some(end), MESSAGE.to_string());
    }
}
