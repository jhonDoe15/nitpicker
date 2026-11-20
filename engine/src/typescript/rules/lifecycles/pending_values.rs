use super::close_scopes::{is_function, literal_string, name_of, unwrap_expression};
use super::collections::Binding;
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

static SETTLER_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(?:resolve|reject|deferred|resolver|settle)$").expect("pattern"));
static PENDING_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)pending|in-?flight|waiting|waiters|callbacksById|requests").expect("pattern"));
static SETTLER_TYPE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new("^(?:Deferred|DeferredPromise|PromiseWithResolvers|Resolver)$|(?:Deferred|Resolver)$").expect("pattern"));
const DEFERRED_CALLS: [&str; 4] = ["deferred", "defer", "createDeferred", "withResolvers"];

fn keys_of(object: Node) -> Vec<String> {
    let plain = object.nodes("properties").into_iter().filter(|property| property.is("Property") && !property.flag("computed"));
    plain.filter_map(|property| property.node("key")).filter_map(|key| name_of(Some(key)).or_else(|| literal_string(key))).collect()
}

fn has_both(names: &[String]) -> bool {
    names.iter().any(|name| name == "resolve") && names.iter().any(|name| name == "reject")
}

fn is_settler(expression: Option<Node>, loose: bool) -> bool {
    let Some(value) = expression.map(unwrap_expression) else { return false };
    if loose && (is_function(value) || value.is("Identifier")) {
        return true;
    }
    match value.kind() {
        "ObjectExpression" => has_both(&keys_of(value)),
        "Identifier" => name_of(Some(value)).is_some_and(|name| SETTLER_NAME.is_match(&name)),
        "NewExpression" => SETTLER_TYPE.is_match(&name_of(value.node("callee")).unwrap_or_default()),
        "CallExpression" => {
            let callee = value.node("callee");
            let name = name_of(callee).or_else(|| callee.filter(|callee| callee.is("MemberExpression")).and_then(|callee| name_of(callee.node("property"))));
            name.is_some_and(|name| DEFERRED_CALLS.contains(&name.as_str()))
        }
        _ => false,
    }
}

fn type_settles(written: Option<Node>, named: bool) -> bool {
    let Some(written) = written else { return false };
    match written.kind() {
        "TSFunctionType" => named,
        "TSTypeLiteral" => has_both(&written.nodes("members").into_iter().filter_map(|member| name_of(member.node("key"))).collect::<Vec<_>>()),
        "TSTypeReference" => SETTLER_TYPE.is_match(&name_of(written.node("typeName")).unwrap_or_default()),
        _ => false,
    }
}

fn declared_types<'v>(binding: &Binding<'v>) -> Option<Node<'v>> {
    let node = binding.node;
    let annotation = node.is("PropertyDefinition").then(|| node.node("typeAnnotation").and_then(|annotation| annotation.node("typeAnnotation"))).flatten();
    let created = match node.kind() {
        "PropertyDefinition" => node.node("value"),
        "VariableDeclarator" => node.node("init"),
        _ => node.node("right"),
    };
    let written = annotation.and_then(|annotation| annotation.node("typeArguments")).or_else(|| created.and_then(|created| created.node("typeArguments")));
    written.and_then(|arguments| arguments.nodes("params").last().copied())
}

pub fn holds_settlers(binding: &Binding, values: &[Option<Node>]) -> bool {
    let named = PENDING_NAME.is_match(binding.name.as_deref().unwrap_or(""));
    values.iter().any(|value| is_settler(*value, named)) || type_settles(declared_types(binding), named)
}
