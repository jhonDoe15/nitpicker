//! `item-loops.mts`: the work a job loop does for each item, and whether the item's failure is caught.
use crate::typescript::rules::effects::summaries::State;
use crate::typescript::rules::effects::tags::{get, has};
use crate::typescript::rules::held_scopes::estree_calls::calls_within;
use crate::typescript::rules::held_scopes::owners::compiler_call;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;

const ITEM_IO: [&str; 2] = ["database", "remote"];
const WRAPPERS: [&str; 4] = ["ChainExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression"];
const SINKS: [&str; 3] = ["AwaitExpression", "ReturnStatement", "YieldExpression"];
const PROMISE_STEPS: [&str; 3] = ["then", "catch", "finally"];
const COMBINATORS: [&str; 4] = ["all", "allSettled", "any", "race"];

pub struct Work<'v> {
    pub call: Node<'v>,
    pub path: Vec<String>,
}

fn is_callback(node: Node) -> bool {
    node.is("ArrowFunctionExpression") || node.is("FunctionExpression")
}

fn member_name(node: Option<Node>) -> Option<String> {
    let member = node.filter(|node| node.is("MemberExpression") && !node.flag("computed"))?;
    member.node("property").and_then(|property| property.name()).map(|name| name.into_owned())
}

fn is_collected(node: Node) -> bool {
    let Some(parent) = node.parent() else { return false };
    let host = if parent.is("ArrayExpression") { parent.parent() } else { Some(parent) };
    let Some(host) = host.filter(|host| host.is("CallExpression")) else { return false };
    let callee = host.node("callee");
    let collector = member_name(callee);
    let on_promise = callee.and_then(|callee| callee.node("object")).and_then(|object| object.name()).as_deref() == Some("Promise");
    collector.as_deref() == Some("push") || (collector.is_some_and(|name| COMBINATORS.contains(&name.as_str())) && on_promise)
}

/// `isEstreeConsumed`: the call's result is awaited, returned, yielded, chained as a promise or collected.
pub fn is_consumed(call: Node) -> bool {
    let mut node = call;
    while let Some(parent) = node.parent().filter(|parent| WRAPPERS.contains(&parent.kind())) {
        node = parent;
    }
    let Some(parent) = node.parent() else { return false };
    if SINKS.contains(&parent.kind()) {
        return true;
    }
    if parent.is("ArrowFunctionExpression") && parent.node("body") == Some(node) {
        return true;
    }
    let stepped = parent.is("MemberExpression") && parent.node("object") == Some(node);
    let step = member_name(Some(parent));
    (stepped && step.is_some_and(|name| PROMISE_STEPS.contains(&name.as_str()))) || is_collected(node)
}

/// `itemWork`: consumed calls of the loop body with a database or remote effect, in source order.
pub fn item_work<'v>(types: &std::cell::RefCell<Types>, state: &mut State, loop_node: Node<'v>) -> Vec<Work<'v>> {
    let Some(body) = loop_node.node("body") else { return Vec::new() };
    let mut found = Vec::new();
    for call in calls_within(body).into_iter().filter(|call| call.is("CallExpression") && is_consumed(*call)) {
        let mut borrowed = types.borrow_mut();
        let Some(compiler) = compiler_call(&mut borrowed, call) else { return Vec::new() };
        let effects = state.call_effects(&mut borrowed, &compiler);
        let path = ITEM_IO.iter().find(|kind| has(&effects, kind)).and_then(|kind| get(&effects, kind));
        if let Some(path) = path {
            found.push(Work { call, path: path.clone() });
        }
    }
    found
}

fn rethrows(handler: Node) -> bool {
    let Some(body) = handler.node("body") else { return false };
    if body.is("BlockStatement") { body.nodes("body").iter().any(|statement| statement.is("ThrowStatement")) } else { body.is("ThrowStatement") }
}

fn catch_handler(call: Node) -> Option<Node> {
    let member = call.parent().filter(|member| member.is("MemberExpression"))?;
    let outer = member.parent().filter(|outer| outer.is("CallExpression") && outer.node("callee") == Some(member))?;
    let method = member.node("property").and_then(|property| property.name());
    let index = match method.as_deref() {
        Some("catch") => 0,
        Some("then") => 1,
        _ => return None,
    };
    outer.list("arguments").get(index).copied().flatten()
}

fn in_try_with_catch(call: Node, loop_node: Node) -> bool {
    let Some(body) = loop_node.node("body") else { return false };
    call.ancestors().filter(|ancestor| body.contains(*ancestor)).any(|ancestor| {
        ancestor.is("TryStatement")
            && ancestor.node("handler").is_some_and(|handler| !rethrows(handler))
            && ancestor.node("block").is_some_and(|block| block.contains(call))
    })
}

/// `isIsolated`: the call's failure is caught per item, by `.catch`, `.then(ok, fail)` or an enclosing `try`.
pub fn is_isolated(call: Node, loop_node: Node) -> bool {
    let caught = catch_handler(call).is_some_and(|handler| !(is_callback(handler) && rethrows(handler)));
    caught || in_try_with_catch(call, loop_node)
}

/// `settlesAll`: the loop body calls `Promise.allSettled`.
pub fn settles_all(loop_node: Node) -> bool {
    let Some(body) = loop_node.node("body") else { return false };
    calls_within(body).into_iter().any(|call| {
        let callee = call.node("callee").filter(|callee| call.is("CallExpression") && callee.is("MemberExpression"));
        let object = callee.and_then(|callee| callee.node("object")).and_then(|object| object.name());
        let property = callee.and_then(|callee| callee.node("property")).and_then(|property| property.name());
        object.as_deref() == Some("Promise") && property.as_deref() == Some("allSettled")
    })
}
