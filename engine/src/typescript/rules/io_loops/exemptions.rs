//! `chunked-loops.mts`, `concurrent-batches.mts` and `unexecuted-calls.mts`: a call that takes a whole chunk of
//! the items, a callback or a pushed promise that runs concurrently under `Promise.all`, and a query builder that
//! is only built, not run, in the loop.
use crate::typescript::rules::collections::loops::Site;
use crate::typescript::rules::effects::tags::words_of;
use crate::typescript::rules::held_scopes::estree_calls::call_view;
use crate::typescript::rules::loop_repeats::chains::{Execution, execution_of, inner_calls, is_combinator_call, outer_calls};
use crate::typescript::rules::loop_repeats::names::{callee_name, descendants, name_of, never, pattern_identifiers};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use oxc_semantic::SymbolId;
use std::cell::RefCell;

const CHUNK_WORDS: [&str; 6] = ["chunk", "chunks", "chunked", "batch", "batches", "batched"];
const SLICES: [&str; 3] = ["slice", "splice", "subarray"];
const FRAGMENT_BUILDERS: [&str; 3] = ["raw", "createQueryBuilder", "createQueryRunner"];

fn is_chunk_source(node: Node) -> bool {
    let target = if node.is("AwaitExpression") { node.node("argument") } else { Some(node) };
    let Some(target) = target else { return false };
    if target.is("CallExpression") {
        return words_of(&callee_name(target.node("callee"))).iter().any(|word| CHUNK_WORDS.contains(&word.as_str()));
    }
    let name = if target.is("Identifier") { name_of(Some(target)).unwrap_or_default() } else { callee_name(Some(target)) };
    words_of(&name).last().is_some_and(|word| CHUNK_WORDS.contains(&word.as_str()))
}

fn is_slice(init: Option<Node>) -> bool {
    init.is_some_and(|init| init.is("CallExpression") && SLICES.contains(&callee_name(init.node("callee")).as_str()))
}

fn variables_of(scopes: &Scopes, pattern: Option<Node>) -> Vec<SymbolId> {
    pattern_identifiers(pattern).into_iter().filter_map(|identifier| scopes.variable_named(identifier)).collect()
}

/// `hasArrayType(node, false) === 'yes'` for an identifier; `None` when the compiler refused.
fn is_typed_chunk(types: &RefCell<Types>, node: Option<Node>) -> Option<bool> {
    let Some(node) = node.filter(|node| node.is("Identifier")) else { return Some(false) };
    let mut types = types.borrow_mut();
    let Some(members) = types.non_nullable_members(node.start(), node.end()) else {
        types.refuse("the compiler gives no type for a loop item");
        return None;
    };
    Some(members.iter().all(|member| types.is_array_type(member)))
}

fn for_of_chunks(types: &RefCell<Types>, scopes: &Scopes, lp: Node) -> Option<Vec<SymbolId>> {
    let Some(left) = lp.node("left").filter(|left| left.is("VariableDeclaration")) else { return Some(Vec::new()) };
    let declarators = left.nodes("declarations");
    let is_chunk = lp.node("right").is_some_and(is_chunk_source) || is_typed_chunk(types, declarators.first().and_then(|first| first.node("id")))?;
    Some(if is_chunk { declarators.into_iter().flat_map(|declarator| variables_of(scopes, declarator.node("id"))).collect() } else { Vec::new() })
}

fn callback_chunks(types: &RefCell<Types>, scopes: &Scopes, callback: Node) -> Option<Vec<SymbolId>> {
    let Some(param) = callback.list("params").first().copied().flatten() else { return Some(Vec::new()) };
    let callee = callback.parent().filter(|call| call.is("CallExpression")).and_then(|call| call.node("callee"));
    let iterable = callee.filter(|callee| callee.is("MemberExpression")).and_then(|callee| callee.node("object"));
    let is_chunk = iterable.is_some_and(is_chunk_source) || is_typed_chunk(types, Some(param))?;
    Some(if is_chunk { variables_of(scopes, Some(param)) } else { Vec::new() })
}

fn sliced_chunks(scopes: &Scopes, lp: Node) -> Vec<SymbolId> {
    let statements = lp.node("body").filter(|body| body.is("BlockStatement")).map(|body| body.nodes("body")).unwrap_or_default();
    let declarators = statements.into_iter().filter(|statement| statement.is("VariableDeclaration")).flat_map(|statement| statement.nodes("declarations"));
    declarators.filter(|declarator| is_slice(declarator.node("init"))).flat_map(|declarator| variables_of(scopes, declarator.node("id"))).collect()
}

fn chunk_variables(types: &RefCell<Types>, scopes: &Scopes, found: &Site) -> Option<Vec<SymbolId>> {
    match found {
        Site::Callback(callback) => callback_chunks(types, scopes, *callback),
        Site::Loop(lp) => {
            let mut iterated = if lp.is("ForOfStatement") { for_of_chunks(types, scopes, *lp)? } else { Vec::new() };
            iterated.extend(sliced_chunks(scopes, *lp));
            Some(iterated)
        }
    }
}

fn slices_inline(arguments: &[Node]) -> bool {
    arguments.iter().any(|argument| descendants(*argument, never).into_iter().any(|node| is_slice(Some(node)) || (node.is("CallExpression") && is_chunk_source(node))))
}

/// `passesChunk`; `None` when the compiler refused.
pub fn passes_chunk(types: &RefCell<Types>, scopes: &Scopes, call: Node, found: &Site) -> Option<bool> {
    let arguments = if call.is("CallExpression") { call.nodes("arguments") } else { call.node("quasi").into_iter().collect() };
    if slices_inline(&arguments) {
        return Some(true);
    }
    let variables = chunk_variables(types, scopes, found)?;
    Some(variables.into_iter().any(|variable| {
        scopes.references(variable).into_iter().any(|reference| arguments.iter().any(|argument| argument.contains(reference.identifier)))
    }))
}

fn is_combinator_argument(node: Node) -> bool {
    let parent = node.parent();
    is_combinator_call(parent) && parent.is_some_and(|parent| parent.nodes("arguments").contains(&node))
}

fn is_method_call(node: Option<Node>, name: &str) -> bool {
    let callee = node.filter(|node| node.is("CallExpression")).and_then(|call| call.node("callee"));
    callee.is_some_and(|callee| callee.is("MemberExpression") && name_of(callee.node("property")).as_deref() == Some(name))
}

fn is_push_target(identifier: Node) -> bool {
    let member = identifier.parent().filter(|member| member.is("MemberExpression") && member.node("object") == Some(identifier));
    member.is_some_and(|member| is_method_call(member.parent(), "push"))
}

fn only_combined(scopes: &Scopes, variable: Option<SymbolId>, allowed: fn(Node) -> bool) -> bool {
    let Some(variable) = variable else { return false };
    let declared: Vec<Node> = scopes.defs(variable).into_iter().map(|definition| definition.name).collect();
    let uses: Vec<Node> = scopes.references(variable).into_iter().map(|reference| reference.identifier).filter(|identifier| !declared.contains(identifier)).collect();
    uses.iter().any(|identifier| is_combinator_argument(*identifier)) && uses.iter().all(|identifier| is_combinator_argument(*identifier) || allowed(*identifier))
}

fn mapped_constant(scopes: &Scopes, call: Node) -> bool {
    let Some(declarator) = call.parent().filter(|declarator| declarator.is("VariableDeclarator") && declarator.node("init") == Some(call)) else { return false };
    let constant = declarator.parent().is_some_and(|declaration| declaration.text("kind").as_deref() == Some("const"));
    let id = declarator.node("id").filter(|id| id.is("Identifier") && constant);
    only_combined(scopes, id.and_then(|id| scopes.variable_named(id)), never)
}

/// `isConcurrentBatch`: the iteration call of a callback feeds `Promise.all`, or is a `map` into a constant
/// only `Promise.all` reads.
pub fn is_concurrent_batch(scopes: &Scopes, callback: Node) -> bool {
    let Some(call) = callback.parent() else { return false };
    is_combinator_call(call.parent()) || (is_method_call(Some(call), "map") && mapped_constant(scopes, call))
}

/// `isPushedForConcurrency`: the call is pushed onto an array that only `Promise.all` reads.
pub fn is_pushed_for_concurrency(scopes: &Scopes, call: Node) -> bool {
    let Some(push) = call.parent().filter(|push| is_method_call(Some(*push), "push") && push.nodes("arguments").contains(&call)) else { return false };
    let target = push.node("callee").and_then(|callee| callee.node("object")).filter(|target| target.is("Identifier"));
    let Some(target) = target else { return false };
    let variable = target.name().and_then(|name| scopes.variable_by_name(&name, target.start()));
    only_combined(scopes, variable, is_push_target)
}

/// `isUnexecutedBuilder`.
pub fn is_unexecuted_builder(scopes: &Scopes, call: Node) -> bool {
    let Some(method) = call_view(call).and_then(|view| view.method) else { return false };
    let fragment = FRAGMENT_BUILDERS.contains(&method.as_str());
    let chained = !outer_calls(call).is_empty() || !inner_calls(call).is_empty();
    if !(chained || fragment) {
        return false;
    }
    let execution = execution_of(scopes, call);
    execution == Execution::Unexecuted || (execution == Execution::Unknown && fragment)
}
