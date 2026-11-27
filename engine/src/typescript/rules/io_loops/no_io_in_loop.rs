//! `no-io-in-loop`: a database query or a remote request made once per item of a loop or an iteration
//! callback, unless the loop pages, drains, polls or retries, the call takes a whole chunk, relays a published
//! row, builds an entity or a query it does not run, or runs concurrently (requests only).
use super::advice::{Advice, advice_of, batch_form, message};
use super::exemptions::{is_concurrent_batch, is_pushed_for_concurrency, is_unexecuted_builder, passes_chunk};
use crate::typescript::rules::Context;
use crate::typescript::rules::collections::loops::{Site, enclosing_loop};
use crate::typescript::rules::contracts::infrastructure::interpolate;
use crate::typescript::rules::effects::callees::calls::callee_origin;
use crate::typescript::rules::effects::describe_path;
use crate::typescript::rules::effects::packages::package_from_path;
use crate::typescript::rules::effects::summaries::State;
use crate::typescript::rules::effects::tags::{Effects, get, has, words_of};
use crate::typescript::rules::held_scopes::estree_calls::{call_view, calls_within};
use crate::typescript::rules::held_scopes::owners::compiler_call;
use crate::typescript::rules::loop_repeats::chains::{is_call, outer_calls};
use crate::typescript::rules::loop_repeats::drains::Drained;
use crate::typescript::rules::loop_repeats::names::pattern_identifiers;
use crate::typescript::rules::loop_repeats::paging::is_paging_call;
use crate::typescript::rules::loop_repeats::polling::{is_polling_call, is_reread_in_catch};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::rules::writes::retry_loops::is_retry_attempt;
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::tables::kind as k;
use oxc_semantic::SymbolId;
use std::cell::RefCell;
use std::rc::Rc;

const RULE: &str = "no-io-in-loop";
const KINDS: [&str; 3] = ["database", "remote", "message"];
const FACTORY_OWNERS: [&str; 2] = ["repo", "repository"];

struct IoEffect {
    kind: &'static str,
    path: Vec<String>,
    cache: bool,
}

struct Element<'v> {
    variables: Vec<SymbolId>,
    iterable: Option<Node<'v>>,
    scope: Node<'v>,
}

struct Check<'c, 'a, 'v> {
    types: &'c RefCell<Types>,
    scopes: &'c Scopes<'a, 'v>,
    state: State,
    drained: Drained,
    found: Vec<(u32, u32, String)>,
}

fn awaited(node: Option<Node>) -> Option<Node> {
    node.and_then(|node| if node.is("AwaitExpression") { node.node("argument") } else { Some(node) })
}

fn message_id(effect: &IoEffect, concurrent: bool, advice: Advice) -> &'static str {
    match advice {
        Advice::DependentQuery => "dependentQuery",
        _ if effect.kind == "remote" => "request",
        _ if effect.cache => "cacheQuery",
        Advice::SetQuery => "setQuery",
        Advice::ForeignKeyQuery => "foreignKeyQuery",
        Advice::Query if concurrent => "concurrentQuery",
        Advice::Query => "query",
    }
}

impl<'v> Check<'_, '_, 'v> {
    fn refused(&self) -> bool {
        self.types.borrow().refused.is_some()
    }

    fn effects_of(&mut self, call: Node<'v>) -> Option<Rc<Effects>> {
        let mut types = self.types.borrow_mut();
        let compiler = compiler_call(&mut types, call)?;
        Some(self.state.call_effects(&mut types, &compiler))
    }

    /// `ioEffect`; `None` when the compiler refused.
    fn io_effect(&mut self, call: Node<'v>) -> Option<Option<IoEffect>> {
        let effects = self.effects_of(call)?;
        let Some(kind) = KINDS.into_iter().find(|kind| has(&effects, kind)) else { return Some(None) };
        let Some(path) = get(&effects, kind).cloned() else { return Some(None) };
        let cache = get(&effects, "cache").is_some_and(|cached| cached.join(",") == path.join(","));
        Some(Some(IoEffect { kind, path, cache }))
    }

    fn variables_of(&self, patterns: impl Iterator<Item = Node<'v>>) -> Vec<SymbolId> {
        patterns.flat_map(|pattern| pattern_identifiers(Some(pattern))).filter_map(|identifier| self.scopes.variable_named(identifier)).collect()
    }

    fn loop_element(&self, found: &Site<'v>) -> Option<Element<'v>> {
        match found {
            Site::Loop(lp) if lp.is("ForOfStatement") => {
                let declarators = lp.node("left").filter(|left| left.is("VariableDeclaration")).map(|left| left.nodes("declarations")).unwrap_or_default();
                let variables = self.variables_of(declarators.into_iter().filter_map(|declarator| declarator.node("id")));
                Some(Element { variables, iterable: lp.node("right"), scope: *lp })
            }
            Site::Loop(_) => None,
            Site::Callback(callback) => {
                let call = callback.parent().filter(|call| call.is("CallExpression") || call.is("NewExpression"))?;
                let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
                let variables = self.variables_of(callback.list("params").into_iter().take(1).flatten());
                Some(Element { variables, iterable: callee.node("object"), scope: *callback })
            }
        }
    }

    fn references(&self, variables: &[SymbolId], call: Node) -> bool {
        variables.iter().any(|variable| self.scopes.references(*variable).iter().any(|reference| call.contains(reference.identifier)))
    }

    fn init_of(&self, variable: Option<SymbolId>) -> Option<Node<'v>> {
        let definition = self.scopes.defs(variable?).into_iter().next()?;
        if definition.kind == DefKind::Variable { definition.node.node("init") } else { None }
    }

    /// `isDatabaseRead`; `None` when the compiler refused.
    fn is_database_read(&mut self, iterable: Option<Node<'v>>) -> Option<bool> {
        let value = awaited(iterable);
        let source = match value {
            Some(identifier) if identifier.is("Identifier") => {
                let variable = identifier.name().and_then(|name| self.scopes.variable_by_name(&name, identifier.start()));
                awaited(self.init_of(variable))
            }
            other => other,
        };
        let Some(call) = source.filter(|call| call.is("CallExpression")) else { return Some(false) };
        let effects = self.effects_of(call)?;
        Some(has(&effects, "database") && !has(&effects, "write"))
    }

    /// `isRelayMark`: a write of a row read from the database, after the loop published that row.
    fn is_relay_mark(&mut self, call: Node<'v>, found: &Site<'v>) -> Option<bool> {
        let Some(element) = self.loop_element(found) else { return Some(false) };
        if !self.references(&element.variables, call) {
            return Some(false);
        }
        let Some(body) = element.scope.node("body") else { return Some(false) };
        let mut published = false;
        for each in calls_within(body) {
            if each.end() <= call.start() && self.references(&element.variables, each) && has(&*self.effects_of(each)?, "message") {
                published = true;
            }
        }
        if !published || !has(&*self.effects_of(call)?, "write") {
            return Some(false);
        }
        self.is_database_read(element.iterable)
    }

    /// `isEntityFactory`: `repository.create(...)` of a TypeORM repository or entity manager.
    fn is_entity_factory(&mut self, call: Node<'v>) -> bool {
        let Some(view) = call_view(call) else { return false };
        let owner_word = view.owner().and_then(|owner| words_of(owner).pop());
        let factory = view.method.as_deref() == Some("create") && owner_word.is_some_and(|word| FACTORY_OWNERS.contains(&word.as_str()));
        if !factory || !call.is("CallExpression") {
            return false;
        }
        let mut types = self.types.borrow_mut();
        let Some(declaration) = types.resolved_declaration(k::CALL_EXPRESSION, call.start(), call.end()) else { return false };
        let Some((_, _, path)) = parse_handle(&declaration) else { return false };
        let typeorm = package_from_path(path).is_some_and(|name| name == "typeorm" || name == "@nestjs/typeorm");
        typeorm && types.owner_name(&declaration).is_some_and(|owner| owner.ends_with("Repository") || owner.ends_with("EntityManager"))
    }

    fn is_loop_call(&mut self, call: Node<'v>, found: &Site<'v>) -> Option<bool> {
        let lp = match found {
            Site::Loop(lp) => Some(*lp),
            Site::Callback(_) => None,
        };
        let repeated = is_retry_attempt(call, lp)
            || is_paging_call(call, lp)
            || self.drained.is_drain_call(call, lp)
            || is_polling_call(self.types, call, lp)?
            || is_reread_in_catch(call, lp);
        Some(!repeated)
    }

    fn is_exempt(&mut self, call: Node<'v>, found: &Site<'v>) -> Option<bool> {
        Some(
            passes_chunk(self.types, self.scopes, call, found)?
                || self.is_relay_mark(call, found)?
                || self.is_entity_factory(call)
                || is_unexecuted_builder(self.scopes, call),
        )
    }

    fn reported_by_outer(&mut self, call: Node<'v>, kind: &str) -> Option<bool> {
        for outer in outer_calls(call) {
            if self.io_effect(outer)?.is_some_and(|effect| effect.kind == kind) {
                return Some(true);
            }
        }
        Some(false)
    }

    fn check(&mut self, call: Node<'v>) -> Option<()> {
        let Some(found) = enclosing_loop(call, self.types)? else { return Some(()) };
        if !self.is_loop_call(call, &found)? {
            return Some(());
        }
        let Some(effect) = self.io_effect(call)? else { return Some(()) };
        if effect.kind == "message" || self.is_exempt(call, &found)? {
            return Some(());
        }
        let batched = matches!(found, Site::Callback(callback) if is_concurrent_batch(self.scopes, callback));
        let concurrent = batched || is_pushed_for_concurrency(self.scopes, call);
        let reported = self.reported_by_outer(call, effect.kind)?;
        if (concurrent && effect.kind == "remote") || reported {
            return Some(());
        }
        let advice = advice_of(call, &found);
        let package = {
            let mut types = self.types.borrow_mut();
            let compiler = compiler_call(&mut types, call)?;
            callee_origin(&mut types, &compiler).and_then(|origin| origin.package)
        };
        let form = batch_form(effect.path.first().map(String::as_str).unwrap_or_default(), package.as_deref());
        let text = interpolate(&message(message_id(&effect, concurrent, advice)), &[("callee", &describe_path(&effect.path)), ("form", form)]);
        if !self.refused() {
            self.found.push((call.start(), call.end(), text));
        }
        Some(())
    }
}

pub fn no_io_in_loop(context: &mut Context) {
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
    let mut check = Check { types, scopes, state, drained: Drained::default(), found: Vec::new() };
    for node in view.nodes().filter(|node| is_call(*node)) {
        if check.check(node).is_none() {
            types.borrow_mut().refuse("a question of the per-item input/output check had no answer");
        }
        if check.refused() {
            break;
        }
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
