//! `drain-loops.mts`: a tested loop that reads a page of rows until the page comes back empty (`take` or
//! `limit` in the query, the loop leaving on `!rows.length`), and the calls that pass that page on.
use super::chains::{chain_arguments, chain_top, is_call, outer_calls};
use super::names::{body_declared_names, descendants, is_function, is_tested_loop, item_names, name_of, referenced_names};
use crate::typescript::rules::collections::loops::Site;
use crate::typescript::rules::support::view::Node;
use std::collections::{HashMap, HashSet};

const PAGE_KEYS: [&str; 7] = ["take", "limit", "batchSize", "pageSize", "perPage", "first", "size"];
const PAGE_METHODS: [&str; 3] = ["take", "limit", "top"];

/// The page reads found per loop, kept for the file.
#[derive(Default)]
pub struct Drained {
    loops: HashMap<u32, HashSet<String>>,
}

fn is_page_key(node: Node) -> bool {
    node.is("Property") && !node.flag("computed") && name_of(node.node("key")).is_some_and(|key| PAGE_KEYS.contains(&key.as_str()))
}

fn takes_page(call: Node) -> bool {
    let limited = outer_calls(call).into_iter().any(|outer| {
        let callee = outer.node("callee").filter(|callee| outer.is("CallExpression") && callee.is("MemberExpression"));
        callee.is_some_and(|callee| PAGE_METHODS.contains(&name_of(callee.node("property")).unwrap_or_default().as_str()))
    });
    limited || chain_arguments(call).into_iter().any(|argument| descendants(argument, is_function).into_iter().any(is_page_key))
}

/// `resultName`: the identifier the chain's (awaited) result is declared as or assigned to.
pub fn result_name(call: Node) -> Option<String> {
    let top = chain_top(call);
    let value = top.parent().filter(|parent| parent.is("AwaitExpression")).unwrap_or(top);
    let holder = value.parent()?;
    if holder.is("VariableDeclarator") && holder.node("init") == Some(value) {
        return holder.node("id").filter(|id| id.is("Identifier")).and_then(|id| name_of(Some(id)));
    }
    holder.node("left").filter(|left| holder.is("AssignmentExpression") && left.is("Identifier")).and_then(|left| name_of(Some(left)))
}

fn measures_emptiness(test: Node, name: &str) -> bool {
    descendants(test, is_function).into_iter().any(|node| {
        let length = node.is("MemberExpression") && name_of(node.node("property")).as_deref() == Some("length") && name_of(node.node("object")).as_deref() == Some(name);
        let negated = node.is("UnaryExpression") && node.text("operator").as_deref() == Some("!") && name_of(node.node("argument")).as_deref() == Some(name);
        length || negated
    })
}

fn assigns_tested(node: Node, tested: &HashSet<String>) -> bool {
    let left = node.node("left").filter(|left| node.is("AssignmentExpression") && left.is("Identifier"));
    name_of(left).is_some_and(|name| tested.contains(&name))
}

fn leaves(node: Node, tested: &HashSet<String>) -> bool {
    descendants(node, is_function)
        .into_iter()
        .any(|each| matches!(each.kind(), "BreakStatement" | "ReturnStatement" | "ThrowStatement") || assigns_tested(each, tested))
}

fn ends_on_empty(lp: Node, name: &str) -> bool {
    let test = lp.node("test");
    let tested = test.map(referenced_names).unwrap_or_default();
    if test.is_some_and(|test| measures_emptiness(test, name)) {
        return true;
    }
    let Some(body) = lp.node("body") else { return false };
    descendants(body, is_function).into_iter().any(|node| {
        if node.is("IfStatement") {
            let measured = node.node("test").is_some_and(|test| measures_emptiness(test, name));
            return measured && node.node("consequent").is_some_and(|consequent| leaves(consequent, &tested));
        }
        assigns_tested(node, &tested) && node.node("right").is_some_and(|right| measures_emptiness(right, name))
    })
}

fn uses_loop_state(call: Node, lp: Node) -> bool {
    let mut bound = body_declared_names(lp);
    bound.extend(item_names(&Site::Loop(lp)));
    chain_arguments(call).into_iter().any(|argument| referenced_names(argument).iter().any(|name| bound.contains(name)))
}

fn is_page_read(call: Node, lp: Node) -> Option<String> {
    let name = result_name(call)?;
    let drains = takes_page(call) && !uses_loop_state(call, lp) && ends_on_empty(lp, &name);
    drains.then_some(name)
}

impl Drained {
    fn results(&mut self, lp: Node) -> &HashSet<String> {
        self.loops.entry(lp.index).or_insert_with(|| {
            let Some(body) = lp.node("body") else { return HashSet::new() };
            descendants(body, is_function).into_iter().filter(|node| is_call(*node)).filter_map(|call| is_page_read(call, lp)).collect()
        })
    }

    /// `isDrainCall`.
    pub fn is_drain_call(&mut self, call: Node, lp: Option<Node>) -> bool {
        let Some(lp) = lp.filter(|lp| is_tested_loop(Some(*lp))) else { return false };
        let results = self.results(lp);
        if results.is_empty() {
            return false;
        }
        let passes = chain_arguments(call).into_iter().any(|argument| referenced_names(argument).iter().any(|name| results.contains(name)));
        passes || is_page_read(call, lp).is_some()
    }
}
