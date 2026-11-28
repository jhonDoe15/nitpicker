//! Locks released in a `finally`, the guard of a `Monitor`, and the calls that run a lambda at once.
use super::bind::ast::from_node;
use super::bind::{Env, bind};
use super::lock::Lock;
use crate::engine::source::{ancestor, children, named_children, parent};
use crate::java::errorprone::call_match::{instance_on_exact_class, static_on_class};
use crate::java::errorprone::flogger_calls::on_descendant;
use crate::java::errorprone::Context;
use tree_sitter::Node;

const MONITOR_GUARD: &str = "com.google.common.util.concurrent.Monitor.Guard";
const READ_WRITE_LOCK: &str = "java.util.concurrent.locks.ReadWriteLock";

/// `INVOKES_LAMBDAS_IMMEDIATELY`: methods that run a lambda on the same thread.
pub fn invokes_lambdas_immediately(context: &Context, call: Node) -> bool {
    instance_on_exact_class(context, call, "java.util.Optional", &["ifPresent", "ifPresentOrElse", "filter", "map", "flatMap", "or", "orElseGet", "orElseThrow"])
        || on_descendant(context, call, "java.util.Map", &["forEach", "replaceAll", "computeIfAbsent", "computeIfPresent", "merge"], false)
        || on_descendant(context, call, "java.util.List", &["replaceAll"], false)
        || on_descendant(context, call, "java.lang.Iterable", &["forEach"], false)
        || on_descendant(context, call, "java.util.Iterator", &["forEachRemaining"], false)
        || static_on_class(context, call, "com.google.common.collect.Iterables", &["tryFind", "any", "all", "indexOf"])
}

/// Whether a lambda or method reference is an argument of such a call.
pub fn runs_immediately(context: &Context, node: Node) -> bool {
    let call = parent(node).filter(|list| list.kind() == "argument_list").and_then(parent);
    call.is_some_and(|call| call.kind() == "method_invocation" && invokes_lambdas_immediately(context, call))
}

/// The lock a `Monitor.Guard` creation around the start holds: the monitor it was made for.
pub fn monitor_guard<'t>(context: &Context<'t>, env: &dyn Env<'t>, start: Node<'t>) -> Option<Lock> {
    let creation = ancestor(start, &["object_creation_expression"])?;
    let written = context.resolver.type_node(creation.child_by_field_name("type")?)?;
    if written.erased().name() != MONITOR_GUARD {
        return None;
    }
    let arguments: Vec<Node> = named_children(creation.child_by_field_name("arguments")?).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    match arguments.as_slice() {
        [only] => bind(env, &from_node(context, *only)),
        _ => None,
    }
}

fn is_unlock(context: &Context, call: Node) -> bool {
    on_descendant(context, call, "java.util.concurrent.locks.Lock", &["unlock"], false)
        || on_descendant(context, call, "com.google.common.util.concurrent.Monitor", &["leave"], false)
        || on_descendant(context, call, "java.util.concurrent.Semaphore", &["release"], false)
}

fn released_by<'t>(context: &Context<'t>, env: &dyn Env<'t>, call: Node<'t>, found: &mut Vec<Lock>) {
    if !is_unlock(context, call) {
        return;
    }
    let Some(Lock::Select(receiver, _)) = bind(env, &from_node(context, call)) else { return };
    found.push((*receiver).clone());
    let accessor = call.child_by_field_name("object").is_some_and(|object| on_descendant(context, object, READ_WRITE_LOCK, &["readLock", "writeLock"], false));
    if let (true, Lock::Select(base, _)) = (accessor, &*receiver) {
        found.push((**base).clone());
    }
}

fn find<'t>(context: &Context<'t>, env: &dyn Env<'t>, node: Node<'t>, found: &mut Vec<Lock>) {
    if node.kind() == "method_invocation" {
        released_by(context, env, node, found);
        return;
    }
    for child in children(node) {
        find(context, env, child, found);
    }
}

/// The locks the calls in a `finally` block release.
pub fn released<'t>(context: &Context<'t>, env: &dyn Env<'t>, block: Node<'t>) -> Vec<Lock> {
    let mut found = Vec::new();
    find(context, env, block, &mut found);
    found
}
