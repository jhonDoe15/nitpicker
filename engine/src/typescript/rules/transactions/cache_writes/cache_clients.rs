//! `cache-clients.mts`: a call that writes a cache client (by the package its receiver comes from, or a cache-like
//! name) or sets an in-memory `Map`, `WeakMap`, `Set` or `WeakSet`.
use super::super::clients::root_node;
use crate::typescript::rules::effects::packages::is_cache_package;
use crate::typescript::rules::secrets::nodes::unwrapped;
use crate::typescript::rules::security_values::defs;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::writes::imports::ImportedBinding;
use std::collections::HashMap;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum CacheKind {
    Client,
    Local,
}

const LOCAL_TYPES: [&str; 4] = ["Map", "WeakMap", "Set", "WeakSet"];
const CACHE_WORDS: [&str; 5] = ["cache", "redis", "keyv", "memcache", "memcached"];
const CLIENT_LAST_WORDS: [&str; 4] = ["client", "manager", "store", "service"];
const CLIENT_WRITES: [&str; 25] = [
    "set", "setex", "psetex", "setnx", "del", "unlink", "hset", "hmset", "hdel", "mset", "mdel", "expire", "pexpire", "incr", "incrby", "decr", "decrby", "sadd", "srem", "lpush",
    "rpush", "zadd", "zrem", "reset", "clear",
];
const MAX_DEPTH: usize = 4;

fn named_in(names: &[&str], node: Option<Node>) -> bool {
    node.and_then(|node| node.name()).is_some_and(|name| names.contains(&name.as_ref()))
}

/// typescript-estree drops type parentheses, the engine's view keeps them.
fn unparenthesized(mut node: Node) -> Node {
    while node.is("TSParenthesizedType") {
        let Some(inner) = node.node("typeAnnotation") else { break };
        node = inner;
    }
    node
}

fn local_type_of(node: Option<Node>) -> bool {
    let Some(node) = node else { return false };
    let annotated = if node.is("TSTypeAnnotation") { node.node("typeAnnotation") } else { Some(node) };
    let Some(inner) = annotated.map(|inner| unparenthesized(unwrapped(inner))) else { return false };
    if inner.is("NewExpression") {
        return named_in(&LOCAL_TYPES, inner.node("callee"));
    }
    inner.is("TSTypeReference") && named_in(&LOCAL_TYPES, inner.node("typeName"))
}

fn declares_local(member: Node, name: &str) -> bool {
    if member.is("PropertyDefinition") {
        let named = member.node("key").and_then(|key| key.name()).as_deref() == Some(name);
        return named && (local_type_of(member.node("value")) || local_type_of(member.node("typeAnnotation")));
    }
    let Some(body) = member.node("value").filter(|_| member.is("MethodDefinition")) else { return false };
    body.nodes("params").into_iter().any(|param| {
        let parameter = param.node("parameter").filter(|_| param.is("TSParameterProperty"));
        parameter.is_some_and(|parameter| {
            parameter.is("Identifier") && parameter.name().as_deref() == Some(name) && local_type_of(parameter.node("typeAnnotation"))
        })
    })
}

fn is_local_member(owner: Node) -> bool {
    let class_body = owner.ancestors().find(|node| node.is("ClassBody"));
    let name = owner.node("property").and_then(|property| property.name());
    match (class_body, name) {
        (Some(class_body), Some(name)) => class_body.nodes("body").into_iter().any(|member| declares_local(member, &name)),
        _ => false,
    }
}

fn is_local_variable(scopes: &Scopes, owner: Node) -> bool {
    let Some(definition) = defs(scopes, owner).into_iter().next() else { return false };
    let node = definition.node;
    if node.is("VariableDeclarator") {
        return local_type_of(node.node("init")) || local_type_of(node.node("id").and_then(|id| id.node("typeAnnotation")));
    }
    node.is("Identifier") && local_type_of(node.node("typeAnnotation"))
}

fn is_local_owner(scopes: &Scopes, owner: Node) -> bool {
    if owner.is("MemberExpression") {
        return owner.node("object").is_some_and(|object| object.is("ThisExpression")) && is_local_member(owner);
    }
    owner.is("Identifier") && is_local_variable(scopes, owner)
}

fn origin_root(init: Node) -> Node {
    let inner = unwrapped(init);
    let value = if inner.is("AwaitExpression") { inner.node("argument").map(unwrapped).unwrap_or(inner) } else { inner };
    if value.is("NewExpression") { value.node("callee").map(unwrapped).unwrap_or(value) } else { root_node(value) }
}

/// What the file's checks share: the file's imported bindings.
pub struct Clients<'s, 'a, 'v> {
    pub scopes: &'s Scopes<'a, 'v>,
    pub bindings: HashMap<String, ImportedBinding>,
}

fn is_client_variable(clients: &Clients, root: Node) -> bool {
    let mut pending = vec![root];
    let mut at = 0;
    while let Some(current) = pending.get(at).copied() {
        at += 1;
        let module = current.name().and_then(|name| clients.bindings.get(name.as_ref()).map(|binding| binding.module.clone())).unwrap_or_default();
        if is_cache_package(&module) {
            return true;
        }
        let definition = defs(clients.scopes, current).into_iter().next();
        let init = definition.filter(|definition| definition.node.is("VariableDeclarator")).and_then(|definition| definition.node.node("init"));
        let next = init.map(origin_root);
        if let Some(next) = next.filter(|next| next.is("Identifier") && pending.len() <= MAX_DEPTH) {
            pending.push(next);
        }
    }
    false
}

fn owner_name(owner: Node) -> String {
    let named = if owner.is("MemberExpression") { owner.node("property") } else { Some(owner) };
    named.and_then(|named| named.name()).map(|name| name.into_owned()).unwrap_or_default()
}

fn split_camel(name: &str) -> String {
    let characters: Vec<char> = name.chars().collect();
    let mut spaced = String::with_capacity(name.len() + 4);
    let mut index = 0;
    while index < characters.len() {
        let current = characters[index];
        spaced.push(current);
        let next = characters.get(index + 1).copied();
        if (current.is_ascii_lowercase() || current.is_ascii_digit()) && next.is_some_and(|next| next.is_ascii_uppercase()) {
            spaced.push(' ');
            spaced.extend(next);
            index += 2;
            continue;
        }
        index += 1;
    }
    spaced
}

/// `isCacheName`: the last word names a cache or a client, and some word names a cache.
pub fn is_cache_name(name: &str) -> bool {
    let lower = split_camel(name).to_lowercase();
    let words: Vec<&str> = lower.split(|character: char| !(character.is_ascii_lowercase() || character.is_ascii_digit())).collect();
    let last = words.last().copied().unwrap_or_default();
    let last_names_client = CACHE_WORDS.contains(&last) || CLIENT_LAST_WORDS.contains(&last);
    last_names_client && words.iter().any(|word| CACHE_WORDS.contains(word))
}

fn is_client(clients: &Clients, owner: Node) -> bool {
    let root = root_node(owner);
    let imported = root.is("Identifier") && is_client_variable(clients, root);
    imported || is_cache_name(&owner_name(owner))
}

/// `cacheKindOf`.
pub fn cache_kind_of(clients: &Clients, call: Node) -> Option<CacheKind> {
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression") && !callee.flag("computed"))?;
    let method = callee.node("property").and_then(|property| property.name()).map(|name| name.into_owned()).unwrap_or_default();
    let owner = unwrapped(callee.node("object")?);
    if is_local_owner(clients.scopes, owner) {
        return (method == "set").then_some(CacheKind::Local);
    }
    let client_method = CLIENT_WRITES.contains(&method.as_str()) || (method == "delete" && is_cache_name(&owner_name(owner)));
    (client_method && is_client(clients, owner)).then_some(CacheKind::Client)
}
