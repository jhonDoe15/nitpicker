//! `assertion-sites.mts`: the nodes a test function runs (without nested tests and detached functions), the
//! functions it calls, and whether a helper asserts, directly or through the helpers it calls.
use super::loops::{is_inline, is_iteration_argument};
use super::subtests::{is_test_boundary, subtest_callback};
use crate::typescript::rules::security_values::is_function_node;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_assertions::unowned_async::nodes::{FileBindings, counts_as_assertion, nodes_in};
use crate::typescript::rules::test_quality::test_calls::resolved_function;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

pub struct Facts<'v> {
    pub nodes: Vec<Node<'v>>,
    pub callees: Vec<Node<'v>>,
    direct: bool,
}

#[derive(PartialEq)]
pub enum Site {
    Subtest,
    Assertion,
}

pub struct LoopEnv<'e, 'a, 's> {
    pub scopes: &'e Scopes<'a, 's>,
    pub bindings: &'e FileBindings,
    facts: HashMap<u32, Rc<Facts<'s>>>,
    helpers: HashMap<u32, bool>,
    pub analyzed: HashSet<u32>,
}

impl<'e, 'a, 's> LoopEnv<'e, 'a, 's> {
    pub fn new(scopes: &'e Scopes<'a, 's>, bindings: &'e FileBindings) -> Self {
        LoopEnv { scopes, bindings, facts: HashMap::new(), helpers: HashMap::new(), analyzed: HashSet::new() }
    }
}

fn called_function<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Node<'s>> {
    if node.is("CallExpression") { resolved_function(scopes, node.node("callee")) } else { None }
}

fn referenced_function<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Node<'s>> {
    if node.is("Identifier") && is_iteration_argument(node) {
        return resolved_function(scopes, Some(node));
    }
    called_function(scopes, node)
}

fn collect_facts<'s>(env: &LoopEnv<'_, '_, 's>, function: Node<'s>) -> Facts<'s> {
    let scopes = env.scopes;
    let nodes = nodes_in(function.node("body"), |child| !(is_test_boundary(scopes, child) || (is_function_node(child) && !is_inline(child))));
    let mut callees: Vec<Node> = Vec::new();
    for callee in nodes.iter().filter_map(|node| referenced_function(scopes, *node)) {
        if !callees.contains(&callee) {
            callees.push(callee);
        }
    }
    let direct = nodes.iter().any(|node| counts_as_assertion(*node, env.bindings));
    Facts { nodes, callees, direct }
}

pub fn facts_of<'s>(env: &mut LoopEnv<'_, '_, 's>, function: Node<'s>) -> Rc<Facts<'s>> {
    if let Some(found) = env.facts.get(&function.index) {
        return found.clone();
    }
    let created = Rc::new(collect_facts(env, function));
    env.facts.insert(function.index, created.clone());
    created
}

fn holds_assertion<'s>(env: &mut LoopEnv<'_, '_, 's>, start: Node<'s>) -> bool {
    let mut via: Vec<(Node, Option<Node>)> = vec![(start, None)];
    let mut index = 0;
    while index < via.len() {
        let function = via[index].0;
        let facts = facts_of(env, function);
        let callees: Vec<Node> = facts.callees.iter().copied().filter(|callee| !via.iter().any(|(seen, _)| seen == callee)).collect();
        if facts.direct || callees.iter().any(|callee| env.helpers.get(&callee.index) == Some(&true)) {
            let mut current = Some(function);
            while let Some(step) = current {
                env.helpers.insert(step.index, true);
                current = via.iter().find(|(seen, _)| *seen == step).and_then(|(_, from)| *from);
            }
            return true;
        }
        for callee in callees.into_iter().filter(|callee| !env.helpers.contains_key(&callee.index)) {
            via.push((callee, Some(function)));
        }
        index += 1;
    }
    for (function, _) in via {
        env.helpers.insert(function.index, false);
    }
    false
}

fn is_asserting_helper<'s>(env: &mut LoopEnv<'_, '_, 's>, function: Option<Node<'s>>) -> bool {
    let Some(function) = function else { return false };
    if !env.helpers.contains_key(&function.index) {
        holds_assertion(env, function);
    }
    env.helpers.get(&function.index) == Some(&true)
}

/// `siteKind`.
pub fn site_kind<'s>(env: &mut LoopEnv<'_, '_, 's>, node: Node<'s>) -> Option<Site> {
    if node.is("CallExpression") && subtest_callback(env.scopes, node).is_some() {
        return Some(Site::Subtest);
    }
    let referenced = referenced_function(env.scopes, node);
    let asserts = counts_as_assertion(node, env.bindings) || is_asserting_helper(env, referenced);
    asserts.then_some(Site::Assertion)
}
