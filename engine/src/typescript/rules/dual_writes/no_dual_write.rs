//! `no-dual-write`: a function (or the module) that publishes a message and writes to the database, unless the
//! publish relays a row it read and writes again. A publish after the transaction commits, or in an
//! `afterCommit` hook, gets the other message.
use super::publishers::{Publishers, may_publish};
use super::sites::{Site, sites_with};
use crate::typescript::rules::Context;
use crate::typescript::rules::contracts::infrastructure::interpolate;
use crate::typescript::rules::effects::describe_path;
use crate::typescript::rules::effects::summaries::State;
use crate::typescript::rules::effects::tags::{Effects, get};
use crate::typescript::rules::held_scopes::estree_calls::{calls_within, is_function, runs_with_caller};
use crate::typescript::rules::held_scopes::owners::compiler_call;
use crate::typescript::rules::held_scopes::scopes::Held;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use std::cell::RefCell;
use std::rc::Rc;

const RULE: &str = "no-dual-write";
const WRITE: &str = "write";
const CACHE: &str = "cache";
const MESSAGE: &str = "message";
const OUTBOX: &str = "Write the message to an outbox table in the same transaction and let a relay publish it (or use change data capture or a database-backed queue); a relay loop that reads rows from the database, publishes each and then updates that row is fine.";
const DUAL_WRITE: &str = "This publishes {{message}} in the same function that writes {{write}}: if the write rolls back after the publish, consumers act on a change that never happened, and if the write commits and the process stops before the publish, the message is lost. Write the message to an outbox table in the same transaction and let a relay publish it (or use change data capture or a database-backed queue); a relay loop that reads rows from the database, publishes each and then updates that row is fine. An exception fits only when a lost or phantom message is acceptable.";
const AFTER_COMMIT: &str = "This publishes {{message}} after the transaction that writes {{write}} commits: a rolled-back change is no longer published, but a crash between the commit and the publish loses the message. Write the message to an outbox table in the same transaction and let a relay publish it (or use change data capture or a database-backed queue); a relay loop that reads rows from the database, publishes each and then updates that row is fine. An exception fits only when a lost message is acceptable.";

pub struct Check<'a, 'v> {
    pub types: &'v RefCell<Types>,
    pub state: State,
    pub scopes: &'v Scopes<'a, 'v>,
    pub held: Held<'a, 'v>,
    pub program: Node<'v>,
    found: Vec<(u32, u32, String)>,
}

impl<'a, 'v> Check<'a, 'v> {
    fn refused(&self) -> bool {
        self.types.borrow().refused.is_some()
    }

    pub fn effects_of(&mut self, call: Node<'v>) -> Option<Rc<Effects>> {
        let mut types = self.types.borrow_mut();
        let compiler = compiler_call(&mut types, call)?;
        Some(self.state.call_effects(&mut types, &compiler))
    }

    fn check(&mut self, unit: Node<'v>, body: Node<'v>) -> Option<()> {
        let mut sites = Vec::new();
        for call in calls_within(body) {
            sites.push(Site { call, effects: self.effects_of(call)? });
        }
        let publishes = sites_with(&sites, MESSAGE, &[WRITE]);
        if publishes.is_empty() {
            return Some(());
        }
        let writes = sites_with(&sites, WRITE, &[MESSAGE, CACHE]);
        let mut chosen = None;
        for publish in &publishes {
            if !self.is_relay_publish(publish, &writes)? {
                chosen = Some(publish);
                break;
            }
        }
        let (Some(publish), Some(first)) = (chosen, writes.first()) else { return Some(()) };
        let after_commit = self.publishes_after_commit(publish, &writes, unit);
        let describe = |site: &Site, tag: &str| describe_path(get(&site.effects, tag).map(Vec::as_slice).unwrap_or_default());
        let text = interpolate(if after_commit { AFTER_COMMIT } else { DUAL_WRITE }, &[("message", &describe(publish, MESSAGE)), ("write", &describe(first, WRITE))]);
        if self.refused() {
            return None;
        }
        self.found.push((publish.call.start(), publish.call.end(), text));
        Some(())
    }

    fn run(&mut self, nodes: impl Iterator<Item = Node<'v>>) {
        if self.check(self.program, self.program).is_none() {
            return;
        }
        for function in nodes.filter(|node| is_function(*node) && !runs_with_caller(*node)) {
            let Some(body) = function.node("body") else { continue };
            if self.check(function, body).is_none() {
                return;
            }
        }
    }
}

pub fn no_dual_write(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let setting = context.setting(&format!("{RULE}.test-sources")).map(str::to_string);
    let (mut state, mut publishers): (State, Publishers) = {
        let mut borrowed = types.borrow_mut();
        if borrowed.refused.is_some() {
            return;
        }
        (borrowed.take_store(), borrowed.take_store())
    };
    state.with_tests(setting.as_deref());
    let may = may_publish(&mut types.borrow_mut(), &mut publishers);
    let mut check = Check { types, state, scopes, held: Held::of(scopes), program: view.program(), found: Vec::new() };
    if may == Some(true) {
        check.run(view.nodes());
    }
    let refused = check.refused();
    let Check { state, found, .. } = check;
    {
        let mut borrowed = types.borrow_mut();
        borrowed.put_store(if refused { state.after_refusal() } else { state });
        borrowed.put_store(publishers);
    }
    if refused {
        return;
    }
    for (start, end, text) in found {
        context.report_range(RULE, start, Some(end), text);
    }
}
