//! `header-forms.mts` of the ESLint plugin: header values compared by exact case, structured headers split by hand,
//! request header names looked up with capitals, cookie prefixes and file extensions matched by exact case.
use super::origins::{Origin, case_insensitive_header, header_of, init_of, is_structured, name_of, origin_of, request_like};
use crate::typescript::rules::security_values::unwrapped;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::urls::values::{SPACE, string_value};
use regex::Regex;
use std::sync::LazyLock;

const EQUALITY: [&str; 4] = ["===", "!==", "==", "!="];
const PREFIX_METHODS: [&str; 4] = ["startsWith", "endsWith", "includes", "indexOf"];
const LOOKUP_METHODS: [&str; 4] = ["has", "get", "includes", "indexOf"];
const REGEX_USERS: [&str; 2] = ["test", "exec"];
const REGEX_ARGUMENT_USERS: [&str; 3] = ["match", "matchAll", "search"];
const LOWERING: [&str; 4] = ["toLowerCase", "toUpperCase", "toLocaleLowerCase", "toLocaleUpperCase"];
const LIST_HEADERS: [&str; 3] = ["vary", "connection", "accept-encoding"];
/// `.` of a JavaScript regular expression without the `u` flag: one UTF-16 unit that ends no line.
const UNIT: &str = r"[^\n\r\x{2028}\x{2029}\x{10000}-\x{10FFFF}]";

fn pattern(text: &str) -> Regex {
    Regex::new(&text.replace("SPACE", SPACE).replace("UNIT", UNIT)).expect("pattern")
}

static MIME_TABLE: LazyLock<Regex> = LazyLock::new(|| pattern("(?i-u:mime)|(?i-u:content)UNIT?(?i-u:type)"));
static COOKIE_PREFIX: LazyLock<Regex> = LazyLock::new(|| pattern("^__(?:Host|Secure)-"));
static SEPARATORS: LazyLock<Regex> = LazyLock::new(|| pattern("^(?:SPACE|[,;])+$"));
static SPLITS: LazyLock<Regex> = LazyLock::new(|| pattern("[,;]|(?i-u:q)SPACE*=|(?i-u:charset)|(?i-u:boundary)"));
static PARAMETERS: LazyLock<Regex> = LazyLock::new(|| pattern(";|(?i-u:q)SPACE*=|(?i-u:charset)|(?i-u:boundary)"));
static ESCAPE: LazyLock<Regex> = LazyLock::new(|| pattern(r"\\UNIT"));
static COOKIE_REGEX: LazyLock<Regex> = LazyLock::new(|| pattern(r"^\^__\(?(?:\?:)?(?:Host|Secure)"));

fn has_letter(text: &str) -> bool {
    text.bytes().any(|byte| byte.is_ascii_alphabetic())
}

fn has_letters(node: Option<Node>) -> bool {
    string_value(node.map(unwrapped)).is_some_and(|text| has_letter(&text))
}

struct Regexp {
    pattern: String,
    flags: String,
}

fn regex_of(node: Option<Node>) -> Option<Regexp> {
    let target = unwrapped(node?);
    let Value::Node(at) = target.get("regex") else { return None };
    let regex = target.view.at(at);
    let text = |key: &str| regex.text(key).map(|text| text.into_owned()).unwrap_or_default();
    target.is("Literal").then(|| Regexp { pattern: text("pattern"), flags: text("flags") })
}

struct Method<'v> {
    name: String,
    receiver: Option<Node<'v>>,
}

fn method_call(call: Node) -> Option<Method> {
    let callee = unwrapped(call.node("callee")?);
    (callee.is("MemberExpression") && !callee.flag("computed"))
        .then(|| Method { name: name_of(Some(callee)).unwrap_or_default(), receiver: callee.node("object") })
}

fn argument(call: Node, index: usize) -> Option<Node> {
    call.list("arguments").get(index).copied().flatten()
}

fn separators_only(node: Node) -> bool {
    let text = string_value(Some(unwrapped(node)));
    let regex = regex_of(Some(node));
    text.is_some_and(|text| !text.is_empty() && SEPARATORS.is_match(&text)) || regex.is_some_and(|regex| regex.pattern.contains([',', ';']))
}

fn tolerates_spaces(header: &str, regex: &Regexp) -> bool {
    regex.flags.contains('i') && LIST_HEADERS.contains(&header) && regex.pattern.contains(r"\s*") && !PARAMETERS.is_match(&regex.pattern)
}

fn is_first_part_read(call: Node, header: &str) -> bool {
    let separator = argument(call, 0);
    let limit = argument(call, 1);
    let Some(parent) = call.parent() else { return false };
    let numeric = |node: Node| node.is("Literal") && matches!(node.get("value"), Value::Number(_)) && node.get("bigint") == Value::Null;
    let zero = parent.node("property").is_some_and(|property| property.is("Literal") && property.get("value") == Value::Number(0.0) && property.get("bigint") == Value::Null);
    header == "content-type"
        && string_value(separator.map(unwrapped)).as_deref() == Some(";")
        && limit.is_none_or(numeric)
        && parent.is("MemberExpression")
        && parent.node("object") == Some(call)
        && parent.flag("computed")
        && zero
}

struct Form {
    splitting: bool,
    regex_receiver: bool,
    regex: Option<Regexp>,
    parsing: bool,
}

fn split_form(method: &Method, call: Node) -> Form {
    let first = argument(call, 0);
    let name = method.name.as_str();
    let regex_receiver = REGEX_USERS.contains(&name) && regex_of(method.receiver).is_some();
    let regex_argument = REGEX_ARGUMENT_USERS.contains(&name) && regex_of(first).is_some();
    let splitting = name == "split" && first.is_some_and(separators_only);
    let regex = regex_of(if regex_receiver { method.receiver } else { first });
    let pattern = regex.as_ref().map(|regex| regex.pattern.as_str()).unwrap_or_default();
    let parsing = splitting || ((regex_receiver || regex_argument) && SPLITS.is_match(pattern));
    Form { splitting, regex_receiver, regex, parsing }
}

/// `handSplit`: the structured header a call splits or matches by hand.
pub fn hand_split<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> Option<String> {
    let method = method_call(call)?;
    let form = split_form(&method, call);
    let subject = if form.regex_receiver { argument(call, 0) } else { method.receiver };
    let header = if form.parsing { header_of(scopes, subject) } else { None }.filter(|header| is_structured(header))?;
    let tolerated = (form.splitting && is_first_part_read(call, &header))
        || (form.regex_receiver && form.regex.as_ref().is_some_and(|regex| tolerates_spaces(&header, regex)));
    (!tolerated).then_some(header)
}

fn value_use<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> Option<Node<'s>> {
    let method = method_call(call)?;
    let first = argument(call, 0);
    let name = method.name.as_str();
    if PREFIX_METHODS.contains(&name) && has_letters(first) {
        return method.receiver;
    }
    if let Some(regex) = regex_of(method.receiver).filter(|regex| REGEX_USERS.contains(&name) && !regex.flags.contains('i')) {
        return if has_letter(&ESCAPE.replace_all(&regex.pattern, "")) { first } else { None };
    }
    if REGEX_ARGUMENT_USERS.contains(&name) && regex_of(first).is_some_and(|regex| !regex.flags.contains('i')) {
        return method.receiver;
    }
    let lookup = LOOKUP_METHODS.contains(&name) && first.is_some() && header_of(scopes, method.receiver).is_none();
    if lookup { first } else { None }
}

fn report_value<'s>(scopes: &Scopes<'_, 's>, subject: Option<Node<'s>>) -> Option<String> {
    subject.and_then(|subject| case_insensitive_header(origin_of(scopes, Some(subject))))
}

/// `valueComparison`: the case-insensitive header whose value a node compares by exact case.
pub fn value_comparison<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<String> {
    let operator = node.text("operator");
    match node.kind() {
        "CallExpression" => report_value(scopes, value_use(scopes, node)),
        "BinaryExpression" if operator.as_deref().is_some_and(|operator| EQUALITY.contains(&operator)) => {
            let (left, right) = (node.node("left"), node.node("right"));
            let (subject, other) = if has_letters(right) { (left, right) } else { (right, left) };
            if has_letters(other) { report_value(scopes, subject) } else { None }
        }
        "BinaryExpression" if operator.as_deref() == Some("in") => report_value(scopes, node.node("left")),
        "MemberExpression" if node.flag("computed") => report_value(scopes, node.node("property")),
        "SwitchStatement" => {
            let literal = node.nodes("cases").into_iter().any(|case| case.node("test").is_some_and(|test| has_letters(Some(test))));
            if literal { report_value(scopes, node.node("discriminant")) } else { None }
        }
        _ => None,
    }
}

fn incoming_headers<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    let target = unwrapped(node);
    let init = if target.is("Identifier") { init_of(scopes, Some(target)) } else { Some(target) };
    init.is_some_and(|init| {
        init.is("MemberExpression") && !init.flag("computed") && name_of(Some(init)).as_deref() == Some("headers") && request_like(init.node("object"))
    })
}

/// `nameLookup`: a request header name with capitals looked up on the incoming `headers` object.
pub fn name_lookup<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<String> {
    let (owner, name) = match node.kind() {
        "MemberExpression" if node.flag("computed") => (node.node("object"), string_value(node.node("property"))),
        "BinaryExpression" if node.text("operator").as_deref() == Some("in") => (node.node("right"), string_value(node.node("left"))),
        _ => return None,
    };
    let name = name.filter(|name| name.bytes().any(|byte| byte.is_ascii_uppercase()))?;
    owner.is_some_and(|owner| incoming_headers(scopes, owner)).then_some(name)
}

/// `cookiePrefix`: a cookie name prefix checked by exact case.
pub fn cookie_prefix(call: Node) -> bool {
    let Some(method) = method_call(call) else { return false };
    let text = string_value(argument(call, 0).map(unwrapped));
    let receiver = method.receiver.map(unwrapped);
    let lowered = receiver.filter(|receiver| receiver.is("CallExpression")).and_then(method_call).is_some_and(|inner| LOWERING.contains(&inner.name.as_str()));
    let prefixed = method.name == "startsWith" && text.is_some_and(|text| COOKIE_PREFIX.is_match(&text));
    let regex = REGEX_USERS.contains(&method.name.as_str())
        && regex_of(method.receiver).is_some_and(|regex| !regex.flags.contains('i') && COOKIE_REGEX.is_match(&regex.pattern));
    (prefixed && !lowered) || regex
}

fn table_lookup(node: Node) -> Option<(Option<Node>, Option<Node>)> {
    if node.is("MemberExpression") && node.flag("computed") {
        return Some((node.node("object"), node.node("property")));
    }
    let method = method_call(node).filter(|method| node.is("CallExpression") && (method.name == "get" || method.name == "has"))?;
    Some((method.receiver, argument(node, 0)))
}

/// `extensionLookup`: a MIME table looked up by a file extension that keeps its case.
pub fn extension_lookup<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    let Some((table, key)) = table_lookup(node) else { return false };
    MIME_TABLE.is_match(&name_of(table).unwrap_or_default()) && origin_of(scopes, key) == Some(Origin::Extension)
}
