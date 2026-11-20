use super::close_scopes::{closers_of, function_name, is_function, name_of};
use super::collections::{Use, added_value, collections_of, destructured_from_this, use_kind, uses_of};
use super::pending_values::holds_settlers;
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

static REGISTRATION_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(?:init|register)|^on[A-Za-z0-9_]*Init").expect("pattern"));
static SERVICE_NAME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new("(?:Service|Manager|Registry|Store|Cache|Client|Server|Gateway|Repository)$").expect("pattern"));

fn adder_of(used: Node) -> Option<Node> {
    used.ancestors().find(|node| is_function(*node))
}

fn is_constructor(function: Option<Node>) -> bool {
    function.and_then(|function| function.parent()).is_some_and(|parent| parent.is("MethodDefinition") && parent.text("kind").as_deref() == Some("constructor"))
}

fn name_of_adder(used: Node) -> Option<String> {
    adder_of(used).and_then(function_name)
}

fn persists(function: Option<Node>, container: Node) -> bool {
    let Some(function) = function else { return false };
    if container.is("ClassBody") {
        return !is_constructor(Some(function));
    }
    function != container && !function.parent().is_some_and(|parent| parent.is("CallExpression"))
}

fn returns_closure(container: Node) -> bool {
    if container.is("ClassBody") {
        return true;
    }
    match container.node("body") {
        Some(body) if body.is("BlockStatement") => body.nodes("body").into_iter().any(|statement| statement.is("ReturnStatement")),
        _ => true,
    }
}

fn literal_key(call: Node, method: &str, key: Option<Node>) -> bool {
    let added = key.or_else(|| (call.is("CallExpression") && matches!(method, "set" | "add")).then(|| call.nodes("arguments").first().copied()).flatten());
    added.is_some_and(|key| key.is("Literal"))
}

fn growing_adds<'v>(uses: &[Node<'v>], container: Node<'v>) -> Vec<Node<'v>> {
    if !returns_closure(container) {
        return Vec::new();
    }
    uses.iter()
        .copied()
        .filter(|used| match use_kind(*used) {
            Use::Add { call, method, key } => {
                persists(adder_of(*used), container) && !literal_key(call, &method, key) && !REGISTRATION_NAME.is_match(&name_of_adder(*used).unwrap_or_default())
            }
            _ => false,
        })
        .collect()
}

fn is_removed(uses: &[Node]) -> bool {
    uses.iter().any(|used| match use_kind(*used) {
        Use::Remove | Use::Escape => true,
        Use::Reassign => !is_constructor(adder_of(*used)),
        Use::Read { method, .. } => matches!(method.as_deref(), Some("size" | "length")),
        Use::Add { .. } => false,
    })
}

fn is_declaration(used: Node) -> bool {
    used.parent().is_some_and(|parent| parent.is("VariableDeclarator") && parent.node("id") == Some(used))
}

fn is_long_lived(container: Node, closers: usize) -> bool {
    if !container.is("ClassBody") {
        return closers > 0;
    }
    let Some(declaration) = container.parent() else { return closers > 0 };
    closers > 0 || !declaration.nodes("decorators").is_empty() || SERVICE_NAME.is_match(&name_of(declaration.node("id")).unwrap_or_default())
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let mut found = Vec::new();
    for container in view.nodes().filter(|node| is_function(*node) || node.is("ClassBody")) {
        let closers = closers_of(container).len();
        if !is_long_lived(container, closers) {
            continue;
        }
        let mut seen: HashSet<Option<String>> = HashSet::new();
        for binding in collections_of(scopes, container) {
            if !seen.insert(binding.name.clone()) {
                continue;
            }
            let uses: Vec<Node> = uses_of(scopes, &binding, container).into_iter().filter(|used| !is_declaration(*used)).collect();
            let adds = growing_adds(&uses, container);
            let settlers: Vec<Option<Node>> = uses.iter().filter_map(|used| match use_kind(*used) {
                Use::Add { call, method, .. } => Some(added_value(call, &method)),
                _ => None,
            }).collect();
            let owned = holds_settlers(&binding, &settlers) && closers > 0;
            let aliased = container.is("ClassBody") && destructured_from_this(container, binding.name.as_deref());
            let Some(first) = adds.first() else { continue };
            if owned || aliased || is_removed(&uses) {
                continue;
            }
            let plain = binding.name.clone().unwrap_or_else(|| "undefined".to_string());
            let name = if container.is("ClassBody") { format!("this.{plain}") } else { plain };
            let adder = name_of_adder(*first).map_or_else(|| "a callback".to_string(), |name| format!("{name}()"));
            let bound = if binding.kind == "Array" { "length" } else { "size" };
            found.push((binding.node.start(), format!("{name} only grows: {adder} adds to it, and nothing in this scope deletes, clears or bounds it, so memory grows for the life of the process. Remove the entry when its request, session or run ends (in `finally` or the close handler), bound it (check `{name}.{bound}` before the add, or use an LRU or TTL cache), or key a `WeakMap` by the object. A registry filled at startup (literal keys, or an init or register function) is skipped. An exception fits only when the keys are a fixed finite set.")));
        }
    }
    for (start, message) in found {
        context.report_at("no-add-only-collection", start, message);
    }
}
