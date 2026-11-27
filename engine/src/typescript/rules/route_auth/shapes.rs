//! `shapes.mts`: what a decorator or middleware name says about auth, by its words, and the shape of a decorator,
//! its name and the keys of its options, that a project's routes are compared by.
use crate::typescript::rules::secrets::words::words_of;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::urls::values::string_value;
use regex::Regex;
use std::sync::LazyLock;

pub const SEPARATOR: &str = "__";
const AUTH_WORDS: [&str; 23] = [
    "auth", "authenticate", "authenticated", "authorize", "authorized", "authorization", "guard", "guards", "roles", "role", "permission",
    "permissions", "jwt", "protected", "secure", "secured", "scopes", "acl", "policy", "policies", "logged", "token", "session",
];
const PUBLIC_WORDS: [&str; 3] = ["public", "anonymous", "unauthenticated"];
const BYPASS_WORDS: [&str; 6] = ["skip", "no", "allow", "without", "bypass", "disable"];

static NOT_AUTH: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(?:Api[A-Z][0-9A-Za-z_]*|Throttl[0-9A-Za-z_]*|SkipThrottle|Cache[0-9A-Za-z_]*)$").expect("not auth"));

/// `DecoratorInfo`: a decorator's shape and whether it asks for auth or marks the route public.
pub struct DecoratorInfo {
    pub shape: String,
    pub is_auth: bool,
    pub is_public: bool,
}

/// `isAuthName`.
pub fn is_auth_name(name: Option<&str>) -> bool {
    name.is_some_and(|name| !NOT_AUTH.is_match(name) && words_of(name).iter().any(|word| AUTH_WORDS.contains(&word.as_str())))
}

fn guards_only_throttling(name: Option<&str>, call: Option<Node>) -> bool {
    let guards: Vec<String> = call.map(|call| call.nodes("arguments")).unwrap_or_default().into_iter().map(|argument| if argument.is("Identifier") { argument.name().map(|name| name.into_owned()).unwrap_or_default() } else { String::new() }).collect();
    name == Some("UseGuards") && !guards.is_empty() && guards.iter().all(|guard| NOT_AUTH.is_match(guard))
}

fn is_public_name(name: Option<&str>) -> bool {
    let words = name.map(words_of).unwrap_or_default();
    let bypass = words.iter().any(|word| BYPASS_WORDS.contains(&word.as_str())) && is_auth_name(name);
    bypass || words.iter().any(|word| PUBLIC_WORDS.contains(&word.as_str()))
}

fn key_name(property: Node) -> Option<String> {
    if !property.is("Property") {
        return None;
    }
    let key = property.node("key")?;
    if key.is("Identifier") { key.name().map(|name| name.into_owned()) } else { string_value(Some(key)) }
}

/// `calleeNameOf`: a name, or the property a member reads by name.
pub fn callee_name_of(callee: Node) -> Option<String> {
    if callee.is("Identifier") {
        return callee.name().map(|name| name.into_owned());
    }
    (callee.is("MemberExpression") && !callee.flag("computed")).then(|| callee.node("property").and_then(|property| property.name()).map(|name| name.into_owned())).flatten()
}

/// `decoratorInfo`.
pub fn decorator_info(decorator: Node) -> DecoratorInfo {
    let expression = decorator.node("expression");
    let call = expression.filter(|expression| expression.is("CallExpression"));
    let named = match call {
        Some(call) => call.node("callee"),
        None => expression,
    };
    let name = named.and_then(callee_name_of);
    let options = call.and_then(|call| call.list("arguments").first().copied().flatten()).filter(|first| first.is("ObjectExpression"));
    let properties = options.map(|options| options.nodes("properties")).unwrap_or_default();
    let mut keys: Vec<String> = properties.iter().filter_map(|property| key_name(*property)).collect();
    keys.sort_by(|left, right| left.encode_utf16().cmp(right.encode_utf16()));
    let disabled = properties.iter().any(|property| {
        let value = property.node("value");
        property.is("Property") && is_auth_name(key_name(*property).as_deref()) && value.is_some_and(|value| value.is("Literal") && value.get("value") == Value::Bool(false))
    });
    let shape = std::iter::once(name.clone().unwrap_or_default()).chain(keys).collect::<Vec<_>>().join(SEPARATOR);
    let name = name.as_deref();
    DecoratorInfo { shape, is_auth: is_auth_name(name) && !is_public_name(name) && !guards_only_throttling(name, call), is_public: is_public_name(name) || disabled }
}

/// `shapeLabel`: how the message writes a shape.
pub fn shape_label(shape: &str) -> String {
    let mut parts = shape.split(SEPARATOR);
    let name = parts.next().unwrap_or_default();
    let keys: Vec<&str> = parts.collect();
    if keys.is_empty() { format!("@{name}()") } else { format!("@{name}({{ {} }})", keys.join(", ")) }
}
