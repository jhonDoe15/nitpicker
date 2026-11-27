//! `http-config.mts`: whether the options a call gets set a timeout, leave it out, or cannot be read, with the
//! callbacks and local URLs that are no options.
use crate::typescript::rules::security_values::leaves::leaf_values;
use crate::typescript::rules::security_values::{defs, is_function_node, member_name, property_named, resolve_constant, unwrapped, variable_of};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::urls::values::{quasi_text, string_value};
use regex::Regex;
use std::sync::LazyLock;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Config {
    Missing,
    Set,
    Unknown,
    Url,
}

static CALLBACK_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new("^(?:resolve|reject|cb|callback|done|next|listener|on[A-Z][0-9A-Za-z_]*|handle[0-9A-Za-z_]*)$").expect("callback"));
static LOCAL_URL: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)^(?:data|blob):").expect("local url"));
static LOCAL_URL_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(?:data|blob|object)(?:Url|Uri|URL|URI)$").expect("local url name"));

/// `resolveConstant` of the unwrapped node, unwrapped.
pub fn constant_of<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Node<'s>> {
    resolve_constant(scopes, node.map(unwrapped)).map(unwrapped)
}

/// `isAbsent`: every value the expression can take is `undefined`, `null`, `0` or `false`.
pub fn is_absent<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> bool {
    leaf_values(scopes, node).into_iter().all(|leaf| {
        let named = leaf.is("Identifier") && leaf.name().is_some_and(|name| name == "undefined" || name == "null");
        let literal = leaf.is("Literal") && leaf.get("regex") == Value::Null && leaf.get("bigint") == Value::Null && matches!(leaf.get("value"), Value::Null | Value::Number(0.0) | Value::Bool(false));
        named || literal
    })
}

/// `resolveFunction`: the function a name declares, or a `const` holds.
pub fn resolve_function<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Node<'s>> {
    let node = node.filter(|node| node.is("Identifier"))?;
    variable_of(scopes, node)?;
    let definitions = defs(scopes, node);
    let [definition] = definitions.as_slice() else { return None };
    if definition.kind == DefKind::FunctionName {
        return Some(definition.node);
    }
    let constant = definition.kind == DefKind::Variable && definition.node.parent().and_then(|declaration| declaration.text("kind")).as_deref() == Some("const");
    definition.node.node("init").filter(|init| constant && is_function_node(*init))
}

/// `isCallback`: the argument at `index` is a function, or reads as a callback after options.
pub fn is_callback<'s>(scopes: &Scopes<'_, 's>, arguments: &[Option<Node<'s>>], index: usize) -> bool {
    let argument = arguments.get(index).copied().flatten().map(unwrapped);
    if argument.is_some_and(is_function_node) || resolve_function(scopes, argument).is_some() {
        return true;
    }
    let Some(argument) = argument.filter(|argument| index > 0 && (argument.is("Identifier") || argument.is("MemberExpression"))) else { return false };
    let previous = constant_of(scopes, arguments.get(index - 1).copied().flatten());
    let after_options = previous.is_some_and(|previous| previous.is("ObjectExpression"));
    after_options || (argument.is("Identifier") && argument.name().is_some_and(|name| CALLBACK_NAME.is_match(&name)))
}

/// `isLocalUrl`: a `data:` or `blob:` URL, an object URL, or a URL relative to `import.meta.url`.
pub fn is_local_url<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> bool {
    let Some(target) = constant_of(scopes, node) else { return false };
    let text = string_value(Some(target)).or_else(|| target.is("TemplateLiteral").then(|| quasi_text(target, 0)));
    if let Some(text) = text {
        return LOCAL_URL.is_match(&text);
    }
    if target.is("Identifier") {
        return target.name().is_some_and(|name| LOCAL_URL_NAME.is_match(&name));
    }
    let base = target.list("arguments").get(1).copied().flatten().filter(|_| target.is("NewExpression")).map(unwrapped);
    let meta_url = base.is_some_and(|base| base.is("MemberExpression") && base.node("object").is_some_and(|object| object.is("MetaProperty")) && member_name(base).as_deref() == Some("url"));
    let callee = target.node("callee").filter(|callee| target.is("CallExpression") && callee.is("MemberExpression"));
    meta_url || callee.is_some_and(|callee| member_name(callee).as_deref() == Some("createObjectURL"))
}

fn later_writes<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, keys: &[&str]) -> Option<Config> {
    let identifier = Some(unwrapped(node)).filter(|identifier| identifier.is("Identifier"))?;
    let variable = variable_of(scopes, identifier);
    let mut states = Vec::new();
    for reference in variable.map(|variable| scopes.references(variable)).unwrap_or_default() {
        let Some(owner) = reference.identifier.parent() else { continue };
        let assignment = owner.parent().filter(|assignment| {
            owner.is("MemberExpression") && owner.node("object") == Some(reference.identifier) && assignment.is("AssignmentExpression") && assignment.node("left") == Some(owner)
        });
        if let Some(write) = assignment.filter(|_| member_name(owner).is_some_and(|name| keys.contains(&name.as_str()))) {
            states.push(if is_absent(scopes, write.node("right")) { Config::Missing } else { Config::Set });
            continue;
        }
        let first = owner.list("arguments").first().copied().flatten();
        let callee = owner.node("callee").filter(|callee| callee.is("MemberExpression"));
        if owner.is("CallExpression") && first == Some(reference.identifier) && callee.is_some_and(|callee| member_name(callee).as_deref() == Some("assign")) {
            states.push(Config::Unknown);
        }
    }
    [Config::Set, Config::Unknown].into_iter().find(|wanted| states.contains(wanted))
}

fn object_state<'s>(scopes: &Scopes<'_, 's>, resolved: Node<'s>, keys: &[&str]) -> Config {
    for key in keys {
        if let Some(value) = property_named(scopes, Some(resolved), key) {
            return if is_absent(scopes, Some(value)) { Config::Missing } else { Config::Set };
        }
    }
    let spreads = resolved.nodes("properties").into_iter().filter(|entry| entry.is("SpreadElement"));
    let resolvable = spreads.into_iter().all(|entry| constant_of(scopes, entry.node("argument")).is_some_and(|value| value.is("ObjectExpression")));
    if resolvable { Config::Missing } else { Config::Unknown }
}

/// `configState`: what the options say about the keys.
pub fn config_state<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>, keys: &[&str]) -> Config {
    let Some(node) = node else { return Config::Missing };
    let resolved = constant_of(scopes, Some(node));
    if resolved.is_some_and(|resolved| resolved.is("Literal") || resolved.is("TemplateLiteral")) {
        return Config::Url;
    }
    let Some(resolved) = resolved.filter(|resolved| resolved.is("ObjectExpression")) else {
        return if is_absent(scopes, resolved) { Config::Missing } else { Config::Unknown };
    };
    let state = object_state(scopes, resolved, keys);
    if state == Config::Set { state } else { later_writes(scopes, node, keys).unwrap_or(state) }
}

/// `lacksTimeout`: none of the options sets the keys or hides them.
pub fn lacks_timeout<'s>(scopes: &Scopes<'_, 's>, nodes: &[Option<Node<'s>>], keys: &[&str]) -> bool {
    !nodes.iter().any(|node| matches!(config_state(scopes, *node, keys), Config::Set | Config::Unknown))
}

/// `configNodes`: the first of the first two arguments that is an object, else the second argument.
pub fn config_nodes<'s>(scopes: &Scopes<'_, 's>, arguments: &[Option<Node<'s>>]) -> Vec<Option<Node<'s>>> {
    let object = arguments.iter().take(2).flatten().find(|argument| constant_of(scopes, Some(**argument)).is_some_and(|value| value.is("ObjectExpression")));
    vec![object.copied().or(arguments.get(1).copied().flatten())]
}
