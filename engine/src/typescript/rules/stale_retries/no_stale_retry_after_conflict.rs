//! `no-stale-retry-after-conflict`: a retry after an optimistic-lock conflict that saves an entity loaded
//! before the retried scope (every attempt fails the same way), or one re-read inside it without the change.
use super::module_scope::uses_typeorm;
use crate::typescript::rules::Context;
use crate::typescript::rules::collections::loops::{Site, enclosing_loop};
use crate::typescript::rules::contracts::infrastructure::interpolate;
use crate::typescript::rules::effects::summaries::State;
use crate::typescript::rules::held_scopes::estree_calls::calls_within;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::rules::writes::imports::imported_bindings;
use crate::typescript::rules::writes::retry_loops::is_retry_attempt;
use crate::typescript::rules::writes::retry_scopes::{Bindings, retry_scope};
use crate::typescript::rules::writes::syntax::constant_initializer;
use std::cell::RefCell;

const RULE: &str = "no-stale-retry-after-conflict";
const CONFLICT: &str = "OptimisticLockVersionMismatchError";
const STALE: &str = "This retry after an optimistic-lock conflict saves `{{entity}}`, which was loaded before the retried scope and carries the old version: every attempt fails the same way. Retry the whole read-modify-write: re-read the row by id and re-apply the change inside the retried scope (`retry(async () => { const row = await repo.findOneByOrFail({ id }); row.status = next; return repo.save(row); })`). An exception fits only when the retry is not meant for a version conflict.";
const LOST: &str = "This retry after an optimistic-lock conflict saves `{{entity}}` as it was re-read, without re-applying the change: the update is lost. Retry the whole read-modify-write: re-read the row by id and re-apply the change inside the retried scope (`retry(async () => { const row = await repo.findOneByOrFail({ id }); row.status = next; return repo.save(row); })`). An exception fits only when the retry is not meant for a version conflict.";

pub(super) struct Check<'c, 'a, 'v> {
    pub(super) types: &'c RefCell<Types>,
    pub(super) state: State,
    pub(super) scopes: &'c Scopes<'a, 'v>,
    bindings: Bindings,
    source: &'c str,
    found: Vec<(u32, u32, String)>,
}

fn is_callback(node: Node) -> bool {
    node.is("ArrowFunctionExpression") || node.is("FunctionExpression")
}

impl Check<'_, '_, '_> {
    fn refused(&self) -> bool {
        self.types.borrow().refused.is_some()
    }

    fn text(&self, node: Node) -> &str {
        &self.source[node.start() as usize..node.end() as usize]
    }

    fn mentions_conflict(&self, call: Node) -> bool {
        let policy = call.node("callee").filter(|callee| callee.is("MemberExpression")).and_then(|callee| callee.node("object"));
        let named = policy.into_iter().chain(call.nodes("arguments"));
        let initializers = named.filter(|node| node.is("Identifier")).filter_map(|node| constant_initializer(self.scopes, node));
        self.text(call).contains(CONFLICT) || initializers.into_iter().any(|init| self.text(init).contains(CONFLICT))
    }

    fn check(&mut self, call: Node, region: Node) {
        let (entity, message) = match self.stale_entity(call, region) {
            Some(entity) => (entity, STALE),
            None => match self.unchanged_entity(call, region) {
                Some(entity) => (entity, LOST),
                None => return,
            },
        };
        self.found.push((call.start(), call.end(), interpolate(message, &[("entity", &entity)])));
    }

    fn check_wrapper(&mut self, call: Node, retried: Option<Node>) {
        let Some(retried) = retried.filter(|retried| is_callback(*retried)) else { return };
        if !self.mentions_conflict(call) {
            return;
        }
        let Some(body) = retried.node("body") else { return };
        for each in calls_within(body) {
            if self.refused() {
                return;
            }
            if each.is("CallExpression") && self.is_save(each) {
                self.check(each, retried);
            }
        }
    }

    fn check_loop(&mut self, call: Node) {
        if !self.is_save(call) {
            return;
        }
        let Some(Some(Site::Loop(lp))) = enclosing_loop(call, self.types) else { return };
        if is_retry_attempt(call, Some(lp)) && self.text(lp).contains(CONFLICT) {
            self.check(call, lp);
        }
    }

    fn visit(&mut self, call: Node) {
        let scope = retry_scope(&mut self.types.borrow_mut(), self.scopes, call, &self.bindings);
        match scope {
            Some(scope) => self.check_wrapper(call, scope.retried),
            None => self.check_loop(call),
        }
    }
}

pub fn no_stale_retry_after_conflict(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    if !uses_typeorm(view.program()) {
        return;
    }
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
        check.visit(node);
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
