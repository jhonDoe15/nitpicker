//! `fan-out-io.mts`, `workerOf`/`callsOf` of `sites.mts` and `remoteIn` of `unbounded-fan-out.mts`: the calls a
//! callback makes for each element, which go to a remote service or a broker by their client's origin, the helpers
//! a call runs, and whether a worker reaches such a call outside a limiter.
use super::bounds::Bounds;
use super::origins::{Origin, Origins};
use super::resolve::{Env, is_function_node, member_name, name_of, path_up, skipped, unwrapped};
use super::specs::{Kind, client_spec};
use crate::typescript::rules::support::view::Node;
use std::cell::OnceCell;

/// `Invocation`: a call, or a callee that a callback passed by name stands for.
#[derive(Clone, Copy)]
pub enum Invocation<'v> {
    Call(Node<'v>),
    Callee(Node<'v>),
}

impl<'v> Invocation<'v> {
    pub fn callee(&self) -> Option<Node<'v>> {
        match self {
            Invocation::Call(call) => call.node("callee"),
            Invocation::Callee(callee) => Some(*callee),
        }
    }

    pub fn parent(&self) -> Option<Node<'v>> {
        match self {
            Invocation::Call(call) => call.parent(),
            Invocation::Callee(_) => None,
        }
    }

    /// The call node, when this is a `CallExpression`.
    pub fn call(&self) -> Option<Node<'v>> {
        match self {
            Invocation::Call(call) if call.is("CallExpression") => Some(*call),
            _ => None,
        }
    }
}

#[derive(Clone, Copy)]
pub struct Worker<'v> {
    pub root: Node<'v>,
    pub function: Option<Node<'v>>,
    /// A callee passed by name: the worker's only call.
    pub callee: Option<Node<'v>>,
}

impl<'v> Worker<'v> {
    pub fn of_function(function: Node<'v>) -> Worker<'v> {
        Worker { root: function, function: Some(function), callee: None }
    }
}

/// `workerOf`.
pub fn worker_of<'v>(env: &Env<'_, '_, 'v>, callback: Option<Node<'v>>) -> Option<Worker<'v>> {
    let target = callback.map(skipped)?;
    if is_function_node(target) {
        return Some(Worker::of_function(target));
    }
    if let Some(resolved) = env.resolve_function(Some(target)).filter(|resolved| is_function_node(*resolved)) {
        return Some(Worker::of_function(resolved));
    }
    (target.is("Identifier") || target.is("MemberExpression")).then_some(Worker { root: target, function: None, callee: Some(target) })
}

fn runs_inside(node: Node, root: Node) -> bool {
    let path = path_up(node);
    let end = path.iter().position(|each| *each == root).unwrap_or(path.len());
    path.get(1..end.max(1)).unwrap_or_default().iter().all(|current| !is_function_node(*current) || current.parent().is_some_and(|parent| parent.is("CallExpression")))
}

/// `callsOf`: the calls a worker makes, nested callbacks included, nested functions declared for later left out.
pub fn calls_of<'v>(worker: &Worker<'v>) -> Vec<Invocation<'v>> {
    if let Some(callee) = worker.callee {
        return vec![Invocation::Callee(callee)];
    }
    let Some(body) = worker.function.and_then(|function| function.node("body")) else { return Vec::new() };
    body.estree_descendants().into_iter().filter(|node| node.is("CallExpression") && runs_inside(*node, body)).map(Invocation::Call).collect()
}

const GLOBAL_OBJECTS: [&str; 4] = ["globalThis", "window", "self", "global"];
const FETCH: &str = "fetch";
const MAX_HELPER_DEPTH: usize = 3;

pub struct Io<'s, 'a, 'v> {
    origins: Origins<'s, 'a, 'v>,
    program: Node<'v>,
    bounds: OnceCell<Bounds<'s, 'a, 'v>>,
}

fn member_kind(base: Option<Origin>, name: Option<String>) -> Option<Kind> {
    let (base, name) = (base?, name?);
    match base {
        Origin::Instance { spec, .. } => spec.has_method(&name).then_some(spec.kind),
        Origin::Module { spec, member, .. } => {
            let listed = spec.methods.as_ref().is_some_and(|methods| methods.contains(&name.as_str()));
            let calls_module = member.is_none() && (listed || spec.functions.contains(&name.as_str()) || (name == "default" && spec.callable));
            calls_module.then_some(spec.kind)
        }
    }
}

fn identifier_kind(found: Option<Origin>) -> Option<Kind> {
    let Some(Origin::Module { reference, spec, .. }) = found else { return None };
    let named = reference.imported.as_deref().is_some_and(|imported| spec.functions.contains(&imported));
    (named || (reference.imported.as_deref() == Some("default") && spec.callable)).then_some(spec.kind)
}

impl<'s, 'a, 'v> Io<'s, 'a, 'v> {
    /// `createIo`, with the bounds `lazyScope` makes on first use.
    pub fn of(env: Env<'s, 'a, 'v>, program: Node<'v>) -> Self {
        Io { origins: Origins::of(env, program, client_spec), program, bounds: OnceCell::new() }
    }

    fn env(&self) -> &Env<'s, 'a, 'v> {
        &self.origins.env
    }

    fn bounds(&self) -> &Bounds<'s, 'a, 'v> {
        self.bounds.get_or_init(|| Bounds::of(self.origins.env, self.program))
    }

    /// `isGlobalFetch`.
    pub fn is_global_fetch(&self, callee: Node<'v>) -> bool {
        let Some(target) = self.env().resolve_constant(Some(unwrapped(callee))).map(unwrapped) else { return false };
        if target.is("MemberExpression") {
            let owner = target.node("object").map(unwrapped);
            return owner.is_some_and(|owner| owner.is("Identifier") && name_of(Some(owner)).is_some_and(|name| GLOBAL_OBJECTS.contains(&name.as_str())))
                && member_name(target).as_deref() == Some(FETCH);
        }
        target.is("Identifier") && target.name().as_deref() == Some(FETCH) && self.env().undeclared(target, FETCH)
    }

    /// `ioKind` of `fan-out-io.mts`.
    pub fn io_kind(&self, call: &Invocation<'v>) -> Option<Kind> {
        let callee = skipped(call.callee()?);
        if callee.is("ArrowFunctionExpression") || callee.is("FunctionExpression") {
            return None;
        }
        if self.is_global_fetch(callee) {
            return Some(Kind::Remote);
        }
        if callee.is("Identifier") {
            return identifier_kind(self.origins.origin_of(callee));
        }
        if !callee.is("MemberExpression") {
            return None;
        }
        member_kind(callee.node("object").and_then(|object| self.origins.origin_of(object)), member_name(callee))
    }

    fn method_of(&self, callee: Node<'v>) -> Option<Node<'v>> {
        let member = skipped(callee);
        let this_call = member.is("MemberExpression") && member.node("object").is_some_and(|object| object.is("ThisExpression"));
        if !this_call {
            return None;
        }
        let body = member.ancestors().find(|node| node.is("ClassBody"))?;
        let name = member_name(member);
        let found = body.nodes("body").into_iter().find(|entry| entry.is("MethodDefinition") && name_of(entry.node("key")) == name)?;
        found.node("value")
    }

    /// `helperOf`: the function a call runs, when the file declares it.
    pub fn helper_of(&self, call: &Invocation<'v>) -> Option<Node<'v>> {
        let callee = skipped(call.callee()?);
        let helper = self.env().resolve_function(Some(callee)).or_else(|| self.method_of(callee));
        helper.filter(|helper| is_function_node(*helper))
    }

    fn inspect(&self, worker: &Worker<'v>, depth: usize) -> Result<Vec<Node<'v>>, ()> {
        let mut helpers = Vec::new();
        if worker.function.is_some_and(|function| self.bounds().acquires_in(function)) {
            return Ok(helpers);
        }
        for call in calls_of(worker) {
            if self.bounds().wraps_in_function(&call, worker.root) {
                continue;
            }
            if self.io_kind(&call).is_some() {
                return Err(());
            }
            if let Some(helper) = (depth < MAX_HELPER_DEPTH).then(|| self.helper_of(&call)).flatten() {
                helpers.push(helper);
            }
        }
        Ok(helpers)
    }

    /// Whether `remoteIn` finds a remote or broker call the worker makes outside a limiter, through helpers too.
    pub fn reaches_remote(&self, worker: Worker<'v>) -> bool {
        let mut seen: Vec<Node<'v>> = Vec::new();
        let mut pending = vec![(worker, 0)];
        let mut at = 0;
        while at < pending.len() {
            let (worker, depth) = pending[at];
            at += 1;
            let Ok(helpers) = self.inspect(&worker, depth) else { return true };
            let fresh: Vec<Node<'v>> = helpers.into_iter().filter(|helper| !seen.contains(helper)).collect();
            for helper in fresh {
                seen.push(helper);
                pending.push((Worker::of_function(helper), depth + 1));
            }
        }
        false
    }
}
