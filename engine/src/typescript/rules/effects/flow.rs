//! Where a call or a function sits in the compiler's tree: whether the call's result is consumed (awaited,
//! returned, chained with `then`, collected), and whether a nested function runs while its caller runs.
use super::views::At;
use crate::typescript::types::tables::kind as k;

const PROMISE_STEPS: [&str; 3] = ["then", "catch", "finally"];
const COMBINATORS: [&str; 4] = ["all", "allSettled", "any", "race"];
const TERMINAL_METHODS: [&str; 15] = [
    "exec", "then", "first", "execute", "executeTakeFirst", "executeTakeFirstOrThrow", "getMany", "getOne", "getOneOrFail", "getRawMany",
    "getRawOne", "getManyAndCount", "getCount", "getExists", "stream",
];
const ITERATION_METHODS: [&str; 14] =
    ["map", "forEach", "flatMap", "filter", "reduce", "reduceRight", "some", "every", "find", "findIndex", "findLast", "findLastIndex", "sort", "toSorted"];
const SCOPE_OPENERS: [&str; 8] = ["$transaction", "transaction", "transactional", "runExclusive", "acquire", "request", "using", "afterCommit"];
const RETRY_WRAPPERS: [&str; 4] = ["pRetry", "retry", "backOff", "execute"];
const FUNCTION_LIKES: [u32; 7] = [k::FUNCTION_DECLARATION, k::METHOD_DECLARATION, k::CONSTRUCTOR, k::GET_ACCESSOR, k::SET_ACCESSOR, k::FUNCTION_EXPRESSION, k::ARROW_FUNCTION];
const SIGNATURES: [u32; 7] =
    [k::METHOD_SIGNATURE, k::CALL_SIGNATURE, k::JS_DOC_SIGNATURE, k::CONSTRUCT_SIGNATURE, k::INDEX_SIGNATURE, k::FUNCTION_TYPE, k::CONSTRUCTOR_TYPE];

pub fn is_terminal_method(method: Option<&str>) -> bool {
    method.is_some_and(|method| TERMINAL_METHODS.contains(&method))
}

/// `SYNC_CALLEES` of the sync-callback check.
pub fn is_sync_callee(name: &str) -> bool {
    ITERATION_METHODS.contains(&name) || PROMISE_STEPS.contains(&name) || SCOPE_OPENERS.contains(&name) || RETRY_WRAPPERS.contains(&name)
}

/// `ts.isFunctionLike`.
pub fn is_function_like(kind: u32) -> bool {
    FUNCTION_LIKES.contains(&kind) || SIGNATURES.contains(&kind)
}

pub fn is_class_like(kind: u32) -> bool {
    kind == k::CLASS_DECLARATION || kind == k::CLASS_EXPRESSION
}

fn outer_of(node: &At, through: &[u32]) -> At {
    let mut current = node.clone();
    while let Some(parent) = current.parent().filter(|parent| through.contains(&parent.kind())) {
        current = parent;
    }
    current
}

fn same(left: Option<At>, right: &At) -> bool {
    left.is_some_and(|left| left.same(right))
}

fn in_arguments(parent: &At, node: &At) -> bool {
    parent.listed("arguments").iter().any(|argument| argument.same(node))
}

fn callee_name(callee: Option<At>) -> Option<String> {
    let callee = callee?;
    match callee.kind() {
        k::IDENTIFIER => callee.text(),
        k::PROPERTY_ACCESS_EXPRESSION => callee.child("name")?.text(),
        _ => None,
    }
}

/// `tsRunsWithCaller`: a function called in place, or passed to `new Promise` or a callee that runs it before
/// it returns (array iteration, promise steps, scope openers, retry wrappers).
pub fn runs_with_caller(function: &At) -> bool {
    let outer = outer_of(function, &[k::PARENTHESIZED_EXPRESSION]);
    let Some(parent) = outer.parent() else { return false };
    if parent.is(k::CALL_EXPRESSION) && same(parent.child("expression"), &outer) {
        return true;
    }
    let is_argument = (parent.is(k::CALL_EXPRESSION) || parent.is(k::NEW_EXPRESSION)) && in_arguments(&parent, &outer);
    if !is_argument {
        return false;
    }
    let name = callee_name(parent.child("expression"));
    if parent.is(k::NEW_EXPRESSION) { name.as_deref() == Some("Promise") } else { name.is_some_and(|name| is_sync_callee(&name)) }
}

fn is_collected(node: &At) -> bool {
    let Some(parent) = node.parent() else { return false };
    let host = if parent.is(k::ARRAY_LITERAL_EXPRESSION) { parent.parent() } else { Some(parent) };
    let Some(host) = host.filter(|host| host.is(k::CALL_EXPRESSION)) else { return false };
    let Some(access) = host.child("expression").filter(|access| access.is(k::PROPERTY_ACCESS_EXPRESSION)) else { return false };
    let name = access.child("name").and_then(|name| name.text()).unwrap_or_default();
    let promise = access.child("expression").and_then(|object| object.identifier()).is_some_and(|object| object == "Promise");
    name == "push" || (COMBINATORS.contains(&name.as_str()) && promise)
}

/// `isTsConsumed`: awaited, returned, yielded, an arrow's body, chained with a promise step, or collected.
pub fn is_consumed(call: &At) -> bool {
    let node = outer_of(call, &[k::PARENTHESIZED_EXPRESSION, k::AS_EXPRESSION]);
    let Some(parent) = node.parent() else { return false };
    let sink = matches!(parent.kind(), k::AWAIT_EXPRESSION | k::RETURN_STATEMENT | k::YIELD_EXPRESSION)
        || (parent.is(k::ARROW_FUNCTION) && same(parent.child("body"), &node));
    if sink {
        return true;
    }
    let stepped = parent.is(k::PROPERTY_ACCESS_EXPRESSION)
        && same(parent.child("expression"), &node)
        && parent.child("name").and_then(|name| name.text()).is_some_and(|name| PROMISE_STEPS.contains(&name.as_str()));
    stepped || is_collected(&node)
}
