//! `no-retry-without-idempotency`: a write with no idempotency contract (an `unsafe` effect) run by a retry
//! wrapper or inside the `try` of a retry loop.
use super::imports::imported_bindings;
use super::retry_loops::is_retry_attempt;
use super::retry_scopes::{Bindings, RetryScope, retry_scope};
use super::syntax::member_name;
use crate::typescript::rules::Context;
use crate::typescript::rules::collections::loops::{Site, enclosing_loop};
use crate::typescript::rules::contracts::infrastructure::interpolate;
use crate::typescript::rules::effects::describe_path;
use crate::typescript::rules::effects::summaries::State;
use crate::typescript::rules::effects::tags::get;
use crate::typescript::rules::effects::views::At;
use crate::typescript::rules::held_scopes::estree_calls::calls_within;
use crate::typescript::rules::held_scopes::owners::compiler_call;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::kind as k;
use std::cell::RefCell;

const RULE: &str = "no-retry-without-idempotency";
const UNSAFE: &str = "unsafe";
const MESSAGE: &str = "This retries {{callee}} inside {{scope}}: when a timeout hits after the server accepted the write, the retry runs it twice. Give the write a stable idempotency key derived from the request (Stripe `{ idempotencyKey }`), a provider deduplication id (SQS or SNS FIFO `MessageDeduplicationId`, BullMQ `jobId`), an upsert (`ON CONFLICT`), or retry only the read. An exception fits only when running the write twice is harmless.";

type Found = Vec<(u32, u32, String)>;

struct Check<'c, 'a, 'v> {
    types: &'c RefCell<Types>,
    state: State,
    scopes: &'c Scopes<'a, 'v>,
    bindings: Bindings,
    source: &'c str,
    found: Found,
}

/// `isBindCall`.
pub fn is_bind_call(node: Node) -> bool {
    node.is("CallExpression") && node.node("callee").is_some_and(|callee| callee.is("MemberExpression") && member_name(callee).as_deref() == Some("bind"))
}

fn is_callback(node: Node) -> bool {
    node.is("ArrowFunctionExpression") || node.is("FunctionExpression")
}

/// The compiler's node of an expression of the file, by its extent and, for names and member accesses, its kind.
pub fn compiler_node(types: &mut Types, node: Node) -> Option<At> {
    let kind = match node.kind() {
        "Identifier" => Some(k::IDENTIFIER),
        "MemberExpression" if node.flag("computed") => Some(k::ELEMENT_ACCESS_EXPRESSION),
        "MemberExpression" => Some(k::PROPERTY_ACCESS_EXPRESSION),
        "CallExpression" => Some(k::CALL_EXPRESSION),
        _ => None,
    };
    let found = types.handle_at(kind, node.start(), node.end()).and_then(|handle| At::of(types, &handle));
    if found.is_none() {
        types.refuse("the compiler has no node for an expression of the file");
    }
    found
}

impl Check<'_, '_, '_> {
    fn refused(&self) -> bool {
        self.types.borrow().refused.is_some()
    }

    fn unsafe_path(&mut self, call: Node) -> Option<Vec<String>> {
        let mut types = self.types.borrow_mut();
        let compiler = compiler_call(&mut types, call)?;
        let effects = self.state.call_effects(&mut types, &compiler);
        get(&effects, UNSAFE).cloned()
    }

    fn reference_path(&mut self, node: Node) -> Option<Vec<String>> {
        let target = if is_bind_call(node) { node.node("callee").and_then(|callee| callee.node("object"))? } else { node };
        let mut types = self.types.borrow_mut();
        let compiler = compiler_node(&mut types, target)?;
        let text = &self.source[target.start() as usize..target.end() as usize];
        let effects = self.state.reference_effects(&mut types, &compiler, text);
        get(&effects, UNSAFE).cloned()
    }

    fn report(&mut self, node: Node, path: &[String], scope: &str) {
        self.found.push((node.start(), node.end(), interpolate(MESSAGE, &[("callee", &describe_path(path)), ("scope", scope)])));
    }

    fn check_scope(&mut self, node: Node, scope: RetryScope) {
        let Some(retried) = scope.retried else { return };
        if is_callback(retried) {
            let Some(body) = retried.node("body") else { return };
            for call in calls_within(body) {
                if let Some(path) = self.unsafe_path(call) {
                    self.report(call, &path, &scope.label);
                }
            }
            return;
        }
        let reference = retried.is("Identifier") || retried.is("MemberExpression") || is_bind_call(retried);
        if let Some(path) = reference.then(|| self.reference_path(retried)).flatten() {
            self.report(node, &path, &scope.label);
        }
    }

    fn check_loop(&mut self, node: Node) {
        let found = enclosing_loop(node, self.types).flatten();
        let lp = match found {
            Some(Site::Loop(lp)) => Some(lp),
            _ => None,
        };
        if lp.is_none() || !is_retry_attempt(node, lp) {
            return;
        }
        if let Some(path) = self.unsafe_path(node) {
            self.report(node, &path, "a retry loop");
        }
    }

    fn check(&mut self, node: Node) {
        let scope = retry_scope(&mut self.types.borrow_mut(), self.scopes, node, &self.bindings);
        match scope {
            Some(scope) => self.check_scope(node, scope),
            None => self.check_loop(node),
        }
    }
}

pub fn no_retry_without_idempotency(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let setting = context.setting(&format!("{RULE}.test-sources")).map(str::to_string);
    let mut state: State = {
        let mut borrowed = types.borrow_mut();
        if borrowed.refused.is_some() {
            return;
        }
        borrowed.take_store()
    };
    state.with_tests(setting.as_deref());
    let mut check = Check { types, state, scopes, bindings: imported_bindings(view.program()), source: context.file.text, found: Vec::new() };
    for node in view.nodes().filter(|node| node.is("CallExpression")) {
        if check.refused() {
            break;
        }
        check.check(node);
    }
    let refused = check.refused();
    let Check { state, found, .. } = check;
    types.borrow_mut().put_store(if refused { state.after_refusal() } else { state });
    if refused {
        return;
    }
    for (start, end, text) in found {
        context.report_range(RULE, start, Some(end), text);
    }
}
