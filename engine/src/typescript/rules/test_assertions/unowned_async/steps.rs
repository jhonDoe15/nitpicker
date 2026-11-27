//! `later-steps.mts`: the steps of a test that run after a host (later siblings on the way up to the test, through
//! the uses of a named function holding it, and the helpers they call), and whether they own its callback.
use super::facts::{Facts, UNKNOWN_DELAY, is_call_like, literal_delay, node_facts};
use super::hosts::{Host, Kind, host_shape};
use super::nodes::{Env, nodes_in, uses};
use crate::typescript::rules::security_values::is_function_node;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_quality::test_calls::resolved_function;

fn runs_inline(env: &Env, node: Node) -> bool {
    if !is_function_node(node) {
        return true;
    }
    let Some(call) = node.parent() else { return false };
    let passed = is_call_like(call) && (call.nodes("arguments").contains(&node) || call.node("callee") == Some(node));
    passed && host_shape(env.scopes, call, env.bindings).is_none()
}

fn reachable_nodes<'s>(env: &Env<'_, '_, 's>, roots: &[Node<'s>]) -> Vec<Node<'s>> {
    let mut pending: Vec<Node> = Vec::new();
    for root in roots {
        if !pending.contains(root) {
            pending.push(*root);
        }
    }
    let mut followed: Vec<Node> = Vec::new();
    let mut found = Vec::new();
    let mut index = 0;
    while index < pending.len() {
        let own = nodes_in(Some(pending[index]), |child| runs_inline(env, child));
        for node in &own {
            let helper = if node.is("CallExpression") { resolved_function(env.scopes, node.node("callee")) } else { None };
            if let Some(helper) = helper.filter(|helper| !followed.contains(helper)) {
                followed.push(helper);
                pending.extend(helper.node("body"));
            }
        }
        found.extend(own);
        index += 1;
    }
    found
}

pub fn step_facts<'s>(env: &Env<'_, '_, 's>, roots: &[Node<'s>], owners: &[Node<'s>]) -> Facts {
    let mut facts = Facts::default();
    for node in reachable_nodes(env, roots) {
        let fact = node_facts(env.scopes, node, owners);
        facts.waits |= fact.waits;
        facts.drains.extend(fact.drains);
        facts.advances |= fact.advances;
        facts.flushes_microtasks |= fact.flushes_microtasks;
        facts.writes |= fact.writes;
        facts.triggers |= fact.triggers;
    }
    facts
}

fn later_siblings(node: Node) -> Vec<Node> {
    let siblings = node.parent().map(|parent| parent.children()).unwrap_or_default();
    siblings.into_iter().filter(|sibling| sibling.start() >= node.end()).collect()
}

fn climb<'v>(start: Node<'v>, test: Node<'v>) -> Vec<Node<'v>> {
    let mut chain: Vec<Node> = std::iter::once(start).chain(start.ancestors()).collect();
    if let Some(stop) = chain.iter().position(|node| *node == test) {
        chain.truncate(stop);
    }
    chain
}

fn first_binding(pattern: Node) -> Option<Node> {
    match pattern.kind() {
        "Identifier" => Some(pattern),
        "ObjectPattern" => pattern.nodes("properties").into_iter().find_map(|property| {
            first_binding(if property.is("RestElement") { property.node("argument")? } else { property.node("value")? })
        }),
        "ArrayPattern" => pattern.nodes("elements").into_iter().find_map(first_binding),
        "AssignmentPattern" => first_binding(pattern.node("left")?),
        "RestElement" => first_binding(pattern.node("argument")?),
        _ => None,
    }
}

fn local_uses<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Vec<Node<'s>> {
    if !is_function_node(node) {
        return Vec::new();
    }
    let binding = if node.is("FunctionDeclaration") {
        node.node("id")
    } else {
        node.parent().filter(|parent| parent.is("VariableDeclarator") && parent.node("init") == Some(node)).and_then(|parent| parent.node("id")).and_then(first_binding)
    };
    binding.and_then(|binding| scopes.variable_named(binding)).map(|symbol| uses(scopes, symbol)).unwrap_or_default()
}

fn roots_from<'s>(scopes: &Scopes<'_, 's>, start: Node<'s>, test: Node<'s>) -> (Vec<Node<'s>>, Vec<Node<'s>>) {
    let mut roots = Vec::new();
    for node in climb(start, test) {
        roots.extend(later_siblings(node));
        let found = local_uses(scopes, node);
        if !found.is_empty() {
            return (roots, found);
        }
    }
    (roots, Vec::new())
}

/// `ownerRoots`.
pub fn owner_roots<'s>(scopes: &Scopes<'_, 's>, host: Node<'s>, test: Node<'s>) -> Vec<Node<'s>> {
    let mut starts = vec![host];
    let mut roots = Vec::new();
    let mut index = 0;
    while index < starts.len() {
        let (found, more) = roots_from(scopes, starts[index], test);
        roots.extend(found);
        for start in more {
            if !starts.contains(&start) {
                starts.push(start);
            }
        }
        index += 1;
    }
    roots
}

fn host_delay(host: &Host) -> f64 {
    let delay = if host.node.is("CallExpression") && host.name == "setTimeout" { literal_delay(host.node.list("arguments").get(1).copied().flatten(), 0.0) } else { 0.0 };
    if delay == UNKNOWN_DELAY { 0.0 } else { delay }
}

/// `isOwnedByLaterStep`.
pub fn is_owned_by_later_step(host: &Host, facts: &Facts) -> bool {
    match host.kind {
        Kind::Timer => facts.advances || facts.drains.iter().any(|drain| *drain >= host_delay(host)),
        Kind::Microtask => facts.waits || facts.flushes_microtasks,
        Kind::Listener => facts.waits || facts.writes || facts.triggers,
        Kind::Callback => false,
    }
}
