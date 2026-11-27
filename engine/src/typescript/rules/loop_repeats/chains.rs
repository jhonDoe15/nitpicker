//! `chain-execution.mts`: the call chain a call is a link of (`a.where(...).take(10).getMany()`), and whether
//! the chain is run (awaited, chained with `then`, ended by an executing method, passed to `Promise.all`), left
//! unexecuted (a builder handed to another call), or unknown.
use super::names::{is_function, name_of};
use crate::typescript::rules::effects::flow::is_terminal_method;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;

const PROMISE_STEPS: [&str; 6] = ["then", "catch", "finally", "run", "all", "execute"];
const COMBINATORS: [&str; 4] = ["all", "allSettled", "any", "race"];
const COLLECTORS: [&str; 2] = ["push", "unshift"];
const WRAPPERS: [&str; 4] = ["ChainExpression", "TSNonNullExpression", "TSAsExpression", "TSSatisfiesExpression"];

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Execution {
    Executed,
    Unexecuted,
    Unknown,
    Variable,
}

pub fn is_call(node: Node) -> bool {
    node.is("CallExpression") || node.is("TaggedTemplateExpression")
}

fn is_chain_step(node: Node, parent: Node) -> bool {
    (parent.is("MemberExpression") && parent.node("object") == Some(node))
        || (parent.is("CallExpression") && parent.node("callee") == Some(node))
        || (parent.is("TaggedTemplateExpression") && parent.node("tag") == Some(node))
        || WRAPPERS.contains(&parent.kind())
}

/// `chainFrom`: the node and the chain links around it, innermost first.
pub fn chain_from(node: Node) -> Vec<Node> {
    let mut links = vec![node];
    while let Some(parent) = links.last().and_then(|link| link.parent().filter(|parent| is_chain_step(*link, *parent))) {
        links.push(parent);
    }
    links
}

/// The outermost link of a call's chain.
pub fn chain_top(call: Node) -> Node {
    chain_from(call).last().copied().unwrap_or(call)
}

/// `innerCalls`: the calls the callee of a call is chained on.
pub fn inner_calls(call: Node) -> Vec<Node> {
    let mut found = Vec::new();
    let mut link = if call.is("CallExpression") { call.node("callee") } else { None };
    while let Some(current) = link {
        if current.is("CallExpression") {
            found.push(current);
        }
        link = match current.kind() {
            "MemberExpression" => current.node("object"),
            "CallExpression" => current.node("callee"),
            _ => None,
        };
    }
    found
}

/// `outerCalls`: the calls chained on a call's result.
pub fn outer_calls(call: Node) -> Vec<Node> {
    chain_from(call).into_iter().skip(1).filter(|link| is_call(*link)).collect()
}

/// `chainArguments`: the arguments of every call of the chain.
pub fn chain_arguments(call: Node) -> Vec<Node> {
    let calls = std::iter::once(call).chain(inner_calls(call)).chain(outer_calls(call));
    calls.filter(|each| each.is("CallExpression")).flat_map(|each| each.nodes("arguments")).collect()
}

fn is_executing_step(link: Node) -> bool {
    let method = if link.is("MemberExpression") && !link.flag("computed") { name_of(link.node("property")) } else { None };
    method.is_some_and(|method| PROMISE_STEPS.contains(&method.as_str()) || is_terminal_method(Some(&method)))
}

fn callee_method(call: Node) -> Option<String> {
    call.node("callee").filter(|callee| callee.is("MemberExpression")).and_then(|callee| name_of(callee.node("property")))
}

/// `isCombinatorCall`: `Promise.all(...)`, `allSettled`, `any` or `race`.
pub fn is_combinator_call(node: Option<Node>) -> bool {
    let Some(call) = node.filter(|node| node.is("CallExpression")) else { return false };
    let Some(callee) = call.node("callee").filter(|callee| callee.is("MemberExpression")) else { return false };
    name_of(callee.node("object")).as_deref() == Some("Promise") && callee_method(call).is_some_and(|method| COMBINATORS.contains(&method.as_str()))
}

fn is_combinator_argument(top: Node) -> bool {
    let parent = top.parent();
    let host = match parent {
        Some(parent) if parent.is("ArrayExpression") => parent.parent(),
        _ => parent,
    };
    is_combinator_call(host)
}

fn is_collected(top: Node) -> bool {
    let method = top.parent().filter(|parent| parent.is("CallExpression")).and_then(callee_method);
    method.is_some_and(|method| COLLECTORS.contains(&method.as_str()))
}

fn callback_result(function: Node) -> Execution {
    if function.flag("async") {
        return Execution::Executed;
    }
    let call = function.parent().filter(|call| call.is("CallExpression") && callee_method(*call).is_some());
    let Some(top) = call.map(chain_top) else { return Execution::Unknown };
    let awaited = top.parent().is_some_and(|parent| parent.is("AwaitExpression"));
    if awaited || is_combinator_argument(top) { Execution::Executed } else { Execution::Unknown }
}

fn returned(top: Node) -> Execution {
    let function = top.ancestors().find(|ancestor| is_function(*ancestor));
    if function.is_some_and(|function| function.flag("async")) { Execution::Executed } else { Execution::Unknown }
}

fn is_discarded_argument(top: Node) -> bool {
    let Some(parent) = top.parent() else { return false };
    parent.is("Property") || (parent.is("CallExpression") && parent.nodes("arguments").contains(&top))
}

fn assignment_target(top: Node) -> Option<Node> {
    let parent = top.parent()?;
    if parent.is("VariableDeclarator") && parent.node("init") == Some(top) {
        return parent.node("id");
    }
    if parent.is("AssignmentExpression") && parent.node("right") == Some(top) { parent.node("left") } else { None }
}

fn direct_execution(node: Node) -> Execution {
    let links = chain_from(node);
    let top = links.last().copied().unwrap_or(node);
    let parent = top.parent();
    if links.iter().any(|link| is_executing_step(*link)) || parent.is_some_and(|parent| parent.is("AwaitExpression")) {
        return Execution::Executed;
    }
    if parent.is_some_and(|parent| parent.is("ReturnStatement")) {
        return returned(top);
    }
    if let Some(arrow) = parent.filter(|parent| parent.is("ArrowFunctionExpression") && parent.node("body") == Some(top)) {
        return callback_result(arrow);
    }
    if is_combinator_argument(top) {
        return Execution::Executed;
    }
    if let Some(target) = assignment_target(top) {
        return if target.is("Identifier") { Execution::Variable } else { Execution::Executed };
    }
    if !is_collected(top) && is_discarded_argument(top) { Execution::Unexecuted } else { Execution::Unknown }
}

fn is_run_later(scopes: &Scopes, top: Node) -> bool {
    let Some(parent) = top.parent() else { return false };
    let variable = if parent.is("VariableDeclarator") {
        parent.node("id").filter(|id| id.is("Identifier")).and_then(|id| scopes.variable_named(id))
    } else {
        let target = parent.node("left").filter(|left| parent.is("AssignmentExpression") && left.is("Identifier"));
        target.and_then(|target| scopes.variable_by_name(&target.name()?, target.start()))
    };
    let Some(variable) = variable else { return false };
    scopes.references(variable).into_iter().any(|reference| !reference.write && direct_execution(reference.identifier) == Execution::Executed)
}

/// `executionOf`.
pub fn execution_of(scopes: &Scopes, call: Node) -> Execution {
    let direct = direct_execution(call);
    if direct != Execution::Variable {
        return direct;
    }
    if is_run_later(scopes, chain_top(call)) { Execution::Executed } else { Execution::Unexecuted }
}
