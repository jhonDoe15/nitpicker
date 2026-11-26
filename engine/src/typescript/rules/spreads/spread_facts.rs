//! The questions `no-shadowed-spread-key` asks about a spread and the keys written beside it.
use crate::typescript::rules::signatures::{Scope, unwrap};
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::types::tables::type_flags;
use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

const OPTIONS_SUFFIXES: [&str; 4] = ["Options", "Config", "Settings", "Props"];
const NULLISH_WRAPPERS: &[&str] = &["ChainExpression", "TSNonNullExpression", "TSAsExpression"];

static OVERRIDE_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)^(?:[A-Za-z0-9_]*overrides?|[A-Za-z0-9_]*defaults?|rest|extra)$").expect("pattern"));
static TEST_SUPPORT_PATH: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?:^|[\\/])(?:testing|test-utils|__fixtures__|__mocks__)[\\/]").expect("pattern"));

pub fn is_options_type(name: &str) -> bool {
    OPTIONS_SUFFIXES.iter().any(|suffix| name.ends_with(suffix))
}

pub fn is_test_support_file(path: &str) -> bool {
    TEST_SUPPORT_PATH.is_match(path)
}

/// `keyName`: the name of a plain `key: value` property.
pub fn key_name(property: Node) -> Option<String> {
    if property.flag("computed") || property.text("kind").as_deref() != Some("init") {
        return None;
    }
    let key = property.node("key")?;
    if key.is("Literal") {
        return key.text("value").map(|value| value.into_owned());
    }
    key.name().map(|name| name.into_owned())
}

pub fn is_text_or_number(node: Node) -> bool {
    match node.kind() {
        "Literal" => matches!(node.get("value"), Value::Text(..) | Value::Number(_)),
        "TemplateLiteral" => node.nodes("expressions").is_empty(),
        _ => false,
    }
}

fn root_identifier(node: Node) -> Option<Node> {
    let mut current = node;
    while current.is("MemberExpression") {
        current = current.node("object")?;
    }
    current.is("Identifier").then_some(current)
}

pub fn is_parameter_based(scope: &Scope, node: Node) -> bool {
    let Some(root) = root_identifier(node) else { return false };
    let definition = scope.scopes.variable_named(root).and_then(|symbol| scope.scopes.defs(symbol).into_iter().next());
    definition.is_some_and(|definition| definition.kind == DefKind::Parameter)
}

pub fn is_parameter_value(scope: &Scope, node: Node) -> bool {
    node.is("Identifier") && is_parameter_based(scope, node)
}

pub fn reads_from(scope: &Scope, value: Node, spread: Node) -> bool {
    let target = scope.source(spread);
    value.descendants().into_iter().any(|node| {
        let object = node.is("MemberExpression").then(|| node.node("object")).flatten();
        object.is_some_and(|object| object.name().is_some() && scope.source(object) == target)
    })
}

/// `isIntentionalSpread`: the spread is named like overrides, or is a literal that does not carry the key.
pub fn is_intentional_spread(spread: Node, key: &str) -> bool {
    let target = unwrap(spread, NULLISH_WRAPPERS);
    let named = if target.is("MemberExpression") { target.node("property") } else { Some(target) };
    if named.and_then(|node| node.name()).is_some_and(|name| OVERRIDE_NAME.is_match(&name)) {
        return true;
    }
    if !target.is("ObjectExpression") {
        return false;
    }
    let keys: HashSet<String> = target.nodes("properties").into_iter().filter(|property| property.is("Property")).filter_map(key_name).collect();
    !keys.contains(key)
}

pub fn includes_undefined(parts: &[crate::typescript::types::server::Type]) -> bool {
    parts.iter().any(|part| part.flags & type_flags::UNDEFINED != 0)
}
