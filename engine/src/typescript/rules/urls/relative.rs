//! `no-unresolved-relative-url`: a `Location` header or a path given to `new URL(value)`, a request call or
//! `Response.redirect` without a base.
use super::values::{is_url_constructor, quasi_text, source, string_value};
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::{defs, is_function_node, resolve_constant};
use crate::typescript::rules::signatures::{ASSERTION_FORMS, unwrap};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_runtime::production_runtime::first_token;
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-unresolved-relative-url";
const LOCATION: &str = "A `Location` header may be a path (`/v2/file`). Resolve it against the request URL first: `new URL(location, requestUrl)`.";
const REDIRECT: &str = "`Response.redirect` needs an absolute URL, and this value is a path. Resolve it against the request URL: `Response.redirect(new URL(path, request.url))`.";
const RELATIVE: &str = "`new URL(path)` with one argument throws `Invalid URL` for a path. Pass the base: `new URL(path, base)`.";
pub const NULLISH_WRAPPERS: &[&str] = &["ChainExpression", "TSNonNullExpression", "TSAsExpression"];
const REQUEST_FUNCTIONS: [&str; 5] = ["fetch", "got", "axios", "ofetch", "ky"];
const REQUEST_OWNERS: [&str; 8] = ["http", "https", "axios", "got", "ky", "undici", "ofetch", "client"];
const REQUEST_METHODS: [&str; 5] = ["get", "request", "post", "head", "fetch"];
const REDIRECT_OWNERS: [&str; 2] = ["Response", "NextResponse"];
const MAX_DEPTH: usize = 5;
static ABSOLUTE_CHECK: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"\^https\?|startsWith\(['"]https?|isAbsolute|canParse|URL\.parse"#).expect("pattern"));

fn name(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn is_location_key(node: Node) -> bool {
    string_value(Some(node)).or_else(|| name(Some(node))).is_some_and(|key| key.to_lowercase() == "location")
}

fn is_headers_object(node: Node) -> bool {
    let value = unwrap(node, NULLISH_WRAPPERS);
    value.is("MemberExpression") && !value.flag("computed") && name(value.node("property")).as_deref() == Some("headers")
}

fn header_read(value: Node) -> bool {
    let (Some(object), Some(property)) = (value.node("object"), value.node("property")) else { return false };
    is_headers_object(object)
        && if value.flag("computed") {
            is_location_key(property)
        } else {
            name(Some(property)).is_some_and(|key| key.to_lowercase() == "location")
        }
}

fn header_call(value: Node) -> bool {
    let Some(callee) = value.node("callee").filter(|callee| callee.is("MemberExpression")) else { return false };
    let method = name(callee.node("property")).unwrap_or_default();
    let key = value.nodes("arguments").first().copied();
    (method == "get" || method == "getHeader")
        && key.is_some_and(is_location_key)
        && (callee.node("object").is_some_and(is_headers_object) || method == "getHeader")
}

enum Step<'s> {
    Done(bool),
    Next(Node<'s>),
}

fn binding_step<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Step<'s> {
    let found = defs(scopes, node);
    let Some(definition) = found.first().filter(|definition| definition.kind == DefKind::Variable) else { return Step::Done(false) };
    let (Some(id), Some(init)) = (definition.node.node("id"), definition.node.node("init")) else { return Step::Done(false) };
    if id.is("ObjectPattern") {
        let own = name(Some(node));
        let named = id.nodes("properties").into_iter().any(|property| {
            property.is("Property")
                && property.node("key").is_some_and(is_location_key)
                && property.node("value").is_some_and(|value| value.is("Identifier") && name(Some(value)) == own)
        });
        return Step::Done(is_headers_object(init) && named);
    }
    if id.is("Identifier") { Step::Next(init) } else { Step::Done(false) }
}

fn location_step<'s>(scopes: &Scopes<'_, 's>, value: Node<'s>) -> Step<'s> {
    match value.kind() {
        "MemberExpression" => Step::Done(header_read(value)),
        "CallExpression" => Step::Done(header_call(value)),
        "Identifier" => binding_step(scopes, value),
        _ => Step::Done(false),
    }
}

fn is_location_read(scopes: &Scopes, node: Node) -> bool {
    let mut current = node;
    for _ in 0..=MAX_DEPTH {
        match location_step(scopes, unwrap(current, NULLISH_WRAPPERS)) {
            Step::Done(answer) => return answer,
            Step::Next(next) => current = next,
        }
    }
    false
}

fn enclosing_function_name(node: Node) -> Option<String> {
    for ancestor in node.ancestors() {
        if ancestor.is("FunctionDeclaration") {
            return name(ancestor.node("id"));
        }
        let declared = ancestor.parent().filter(|parent| parent.is("VariableDeclarator"));
        if (ancestor.is("ArrowFunctionExpression") || ancestor.is("FunctionExpression")) && declared.is_some() {
            return declared.and_then(|parent| name(parent.node("id")));
        }
    }
    None
}

fn is_request_call(node: Node) -> bool {
    let Some(callee) = node.node("callee") else { return false };
    if callee.is("Identifier") {
        let called = name(Some(callee));
        return called.as_deref().is_some_and(|called| REQUEST_FUNCTIONS.contains(&called)) || called == enclosing_function_name(node);
    }
    callee.is("MemberExpression")
        && !callee.flag("computed")
        && REQUEST_METHODS.contains(&name(callee.node("property")).unwrap_or_default().as_str())
        && REQUEST_OWNERS.contains(&name(callee.node("object")).unwrap_or_default().as_str())
}

fn is_relative_text(scopes: &Scopes, node: Node) -> bool {
    let value = unwrap(resolve_constant(scopes, Some(node)).unwrap_or(node), ASSERTION_FORMS);
    if value.is("TemplateLiteral") {
        let first = value.nodes("expressions").first().copied();
        let pages = first.is_some_and(|first| first.is("MemberExpression") && name(first.node("object")).as_deref() == Some("pages"));
        return quasi_text(value, 0).starts_with('/') || (quasi_text(value, 0).is_empty() && pages);
    }
    string_value(Some(value)).is_some_and(|text| text.starts_with('/'))
}

fn checks_absolute(text: &str, node: Node) -> bool {
    let scope = node.ancestors().find(|ancestor| is_function_node(*ancestor));
    let scoped = scope.map_or(&text[first_token(text)..], |scope| source(text, scope));
    ABSOLUTE_CHECK.is_match(scoped)
}

fn finding<'s>(scopes: &Scopes<'_, 's>, text: &str, node: Node<'s>) -> Option<&'static str> {
    let arguments = node.list("arguments");
    let argument = arguments.first().copied().flatten();
    if node.is("NewExpression") {
        let argument = argument.filter(|_| is_url_constructor(node.node("callee")) && arguments.len() == 1)?;
        if is_location_read(scopes, argument) {
            return (!checks_absolute(text, node)).then_some(LOCATION);
        }
        return is_relative_text(scopes, argument).then_some(RELATIVE);
    }
    let argument = argument.filter(|argument| !argument.is("SpreadElement"))?;
    if is_request_call(node) && is_location_read(scopes, argument) && !checks_absolute(text, node) {
        return Some(LOCATION);
    }
    let callee = node.node("callee").filter(|callee| callee.is("MemberExpression") && !callee.flag("computed"))?;
    let redirect = name(callee.node("property")).as_deref() == Some("redirect")
        && REDIRECT_OWNERS.contains(&name(callee.node("object")).unwrap_or_default().as_str());
    (redirect && is_relative_text(scopes, argument)).then_some(REDIRECT)
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let text = context.file.text;
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("NewExpression") || node.is("CallExpression")) {
        if let Some(message) = finding(scopes, text, node) {
            found.push((node.start(), node.end(), message));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message.to_string());
    }
}
