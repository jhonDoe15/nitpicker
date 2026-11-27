//! `no-lookup-per-element`: an RxJS operator (`mergeMap`, `concatMap`, `switchMap`, ...) whose callback looks up a
//! database row or a remote resource for every element of the collection its pipe starts from.
use super::fixed::Fixed;
use super::rxjs::Rxjs;
use crate::typescript::rules::Context;
use crate::typescript::rules::contracts::infrastructure::interpolate;
use crate::typescript::rules::effects::describe_path;
use crate::typescript::rules::effects::summaries::State;
use crate::typescript::rules::effects::tags::{get, has};
use crate::typescript::rules::fan_out::io::{Invocation, Io, Worker, calls_of, worker_of};
use crate::typescript::rules::fan_out::resolve::{Env, skipped};
use crate::typescript::rules::held_scopes::owners::compiler_call;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use std::cell::RefCell;

const RULE: &str = "no-lookup-per-element";
const MESSAGE: &str = concat!(
    "`{{operator}}` runs {{callee}} once for every element of `{{collection}}`: N elements make N queries or requests, ",
    "with or without a concurrency limit. Fetch them in one batched query (`findByIds`, `WHERE id IN (...)`, a batch ",
    "endpoint) before the pipeline and join the rows to the elements in memory. ",
    "An exception fits only when the collection is always tiny."
);
const OPERATORS: [&str; 5] = ["mergeMap", "flatMap", "concatMap", "switchMap", "exhaustMap"];
const UNLIMITED_OPERATORS: [&str; 2] = ["mergeMap", "flatMap"];
const KINDS: [&str; 3] = ["database", "remote", "message"];
const MAX_HELPER_DEPTH: usize = 2;
const MAX_TEXT: usize = 50;

struct Lookup {
    kind: &'static str,
    path: Vec<String>,
    cache: bool,
}

struct Check<'c, 's, 'a, 'v> {
    types: &'c RefCell<Types>,
    state: State,
    scopes: &'c Scopes<'a, 'v>,
    env: Env<'s, 'a, 'v>,
    io: Io<'s, 'a, 'v>,
}

/// The identifiers a function declares: its name and the names its parameters bind.
fn declared_names(function: Node) -> Vec<Node> {
    let mut pending: Vec<Node> = function.node("id").into_iter().chain(function.nodes("params")).collect();
    let mut found = Vec::new();
    while let Some(node) = pending.pop() {
        match node.kind() {
            "Identifier" => found.push(node),
            "AssignmentPattern" => pending.extend(node.node("left")),
            "RestElement" => pending.extend(node.node("argument")),
            "TSParameterProperty" => pending.extend(node.node("parameter")),
            "ArrayPattern" => pending.extend(node.list("elements").into_iter().flatten()),
            "ObjectPattern" => pending.extend(node.nodes("properties").into_iter().filter_map(|property| property.node(if property.is("RestElement") { "argument" } else { "value" }))),
            _ => {}
        }
    }
    found
}

impl<'v> Check<'_, '_, '_, 'v> {
    fn refused(&self) -> bool {
        self.types.borrow().refused.is_some()
    }

    fn parameter_references(&self, function: Option<Node<'v>>) -> Vec<Node<'v>> {
        let Some(function) = function else { return Vec::new() };
        let symbols = declared_names(function).into_iter().filter_map(|name| self.scopes.variable_named(name));
        symbols.flat_map(|symbol| self.scopes.references(symbol)).map(|reference| reference.identifier).collect()
    }

    fn io_effect(&mut self, call: Node<'v>) -> Option<Option<Lookup>> {
        let mut types = self.types.borrow_mut();
        let compiler = compiler_call(&mut types, call)?;
        let effects = self.state.call_effects(&mut types, &compiler);
        if types.refused.is_some() {
            return None;
        }
        if has(&effects, "write") {
            return Some(None);
        }
        let Some(kind) = KINDS.into_iter().find(|kind| has(&effects, kind)) else { return Some(None) };
        let path = get(&effects, kind).cloned().unwrap_or_default();
        let cache = get(&effects, "cache").is_some_and(|cached| cached.join(",") == path.join(","));
        Some(Some(Lookup { kind, path, cache }))
    }

    fn direct_lookup(&mut self, calls: &[Invocation<'v>]) -> Option<Option<Lookup>> {
        let mut found = None;
        for call in calls.iter().filter_map(Invocation::call) {
            let effect = self.io_effect(call)?;
            if found.is_none() {
                found = effect.filter(|effect| effect.kind != "message" && !effect.cache);
            }
        }
        Some(found)
    }

    fn lookup_in(&mut self, body: Vec<Invocation<'v>>) -> Option<Option<Lookup>> {
        let mut pending = vec![(body, 0)];
        let mut at = 0;
        while at < pending.len() {
            let (calls, depth) = std::mem::take(&mut pending[at]);
            at += 1;
            if let Some(effect) = self.direct_lookup(&calls)? {
                return Some(Some(effect));
            }
            if depth < MAX_HELPER_DEPTH {
                let helpers: Vec<Node<'v>> = calls.iter().filter_map(|call| self.io.helper_of(call)).collect();
                pending.extend(helpers.into_iter().map(|helper| (calls_of(&Worker::of_function(helper)), depth + 1)));
            }
        }
        Some(None)
    }

    fn per_element_lookup(&mut self, worker: &Worker<'v>) -> Option<Option<Lookup>> {
        let references = self.parameter_references(worker.function);
        let reads = |call: &Invocation<'v>| call.call().is_some_and(|call| references.iter().any(|identifier| call.contains(*identifier)));
        let calls: Vec<Invocation<'v>> = calls_of(worker).into_iter().filter(|call| worker.function.is_none() || reads(call)).collect();
        self.lookup_in(calls)
    }

    fn is_literal_set(node: Node) -> bool {
        let target = skipped(node);
        let items = target.nodes("arguments").first().copied().filter(|items| items.is("ArrayExpression"));
        target.is("NewExpression")
            && target.node("callee").is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("Set"))
            && items.is_some_and(|items| items.list("elements").iter().all(|item| item.is_some_and(|item| !item.is("SpreadElement"))))
    }

    fn finding(&mut self, node: Node<'v>) -> Option<String> {
        let rxjs = Rxjs { env: &self.env, types: self.types };
        let name = node.node("callee").and_then(|callee| rxjs.name(callee)).filter(|name| OPERATORS.contains(&name.as_str()))?;
        let arguments = node.list("arguments");
        let worker = worker_of(&self.env, arguments.first().copied().flatten())?;
        let collection = rxjs.pipe_source(node)?;
        let effect = self.per_element_lookup(&worker)??;
        let rxjs = Rxjs { env: &self.env, types: self.types };
        let limited = arguments.iter().skip(1).flatten().any(|argument| !rxjs.is_unlimited(*argument));
        let fixed = Fixed { env: &self.env };
        let covered = || UNLIMITED_OPERATORS.contains(&name.as_str()) && !limited && effect.kind == "remote" && self.io.reaches_remote(worker);
        if self.refused() || fixed.is_fixed(collection) || Self::is_literal_set(collection) || covered() {
            return None;
        }
        let text = self.env.text(skipped(collection));
        let shown = if text.encode_utf16().count() <= MAX_TEXT { text } else { "the collection" };
        Some(interpolate(MESSAGE, &[("operator", &name), ("callee", &describe_path(&effect.path)), ("collection", shown)]))
    }
}

pub fn no_lookup_per_element(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let source = context.file.text;
    if !source.contains("rxjs") {
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
    let env = Env { scopes, source };
    let mut check = Check { types, state, scopes, env, io: Io::of(env, view.program()) };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("CallExpression")) {
        if check.refused() {
            break;
        }
        if let Some(message) = check.finding(node) {
            found.push((node.start(), node.end(), message));
        }
    }
    let refused = check.refused();
    let Check { state, .. } = check;
    types.borrow_mut().put_store(if refused { state.after_refusal() } else { state });
    if refused {
        return;
    }
    for (start, end, text) in found {
        context.report_range(RULE, start, Some(end), text);
    }
}
