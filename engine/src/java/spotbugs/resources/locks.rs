//! FindUnreleasedLock: a `lock()` call on a `java.util.concurrent.locks.Lock` that some way out of the method still
//! holds, in a method that calls `unlock()` on some lock (a method that never unlocks takes a lock for its caller).
//! UL_UNRELEASED_LOCK (priority 1) when a path without exceptions holds it at a `return` or the end,
//! UL_UNRELEASED_LOCK_EXCEPTION_PATH (priority 2) when only paths through an exception edge do; each pattern once per
//! method, on the line of its first such `lock()` call. Measured on SpotBugs 4.9.8:
//! - methods whose name holds `lock` in any case are skipped (a lambda is named after the method around it);
//! - `lockInterruptibly()` and `tryLock()` take nothing; an `unlock()` on an object that is no `Lock` is no unlock;
//! - `unlock()` releases the locks taken on the same object: a field by its name (even after a store to it), the same
//!   parameter or local value, any array element, and any call result (`readLock()` then `writeLock()`), but not
//!   a value of another kind or another `new`; a lock reached through the instance around an inner class takes
//!   nothing, and neither does a field of the file that nothing stores into (SpotBugs takes it to be null);
//! - the calls to `lock()`, `unlock()` and a `ReadWriteLock`'s `readLock()` and `writeLock()` are taken
//!   not to throw, nor is the read of a field of another object, while its
//!   write, calls, `new`, array use, casts, integer division and boxing do.
use super::super::dead::flow::throws::{Thrown, throws};
use super::super::{Context, names, place};
use super::flow::{Event, Keys, Resource, leaks};
use crate::java::flow::cfg::{self, unwrap};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_types;
use std::collections::HashSet;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &["UL_UNRELEASED_LOCK", "UL_UNRELEASED_LOCK_EXCEPTION_PATH"];
const LOCK: &str = "java.util.concurrent.locks.Lock";
const READ_WRITE: &str = "java.util.concurrent.locks.ReadWriteLock";

struct Locks;

fn is_lock(context: &Context, object: Node) -> bool {
    let Some(kind) = context.resolver.type_of(object) else { return false };
    let name = kind.erased().name();
    name == LOCK || context.resolver.index.is_subtype(&name, LOCK)
}

impl Resource for Locks {
    fn event(&self, context: &Context, step: Node, keys: &Keys) -> Option<Event> {
        if step.kind() != "method_invocation" {
            return None;
        }
        let empty = step.child_by_field_name("arguments").is_some_and(|arguments| arguments.named_child_count() == 0);
        let object = step.child_by_field_name("object")?;
        if !empty || !is_lock(context, object) {
            return None;
        }
        match context.text(step.child_by_field_name("name")?) {
            "lock" => Some(keys.of(context, object)).filter(|key| !Keys::is_outer(key) && !unwritten(context, key)).map(Event::Open),
            "unlock" => Some(Event::Close(keys.of(context, object))),
            _ => None,
        }
    }
    fn parted(&self, context: &Context, open: Node, close: Node) -> bool {
        super::loops::parted(context, open, close)
    }
    fn throws(&self, context: &Context, step: Node) -> Option<Thrown> {
        let other = |target: Option<Node>| target.map(unwrap).is_some_and(|target| match target.kind() {
            "array_access" => true,
            "field_access" => target.child_by_field_name("object").map(unwrap).is_some_and(|object| !matches!(object.kind(), "this" | "super")),
            _ => false,
        });
        match step.kind() {
            "method_invocation" if self.event(context, step, &Keys::default()).is_some() || half(context, step) => None,
            "field_access" => {
                let length = step.child_by_field_name("field").is_some_and(|field| context.text(field) == "length");
                let object = step.child_by_field_name("object").and_then(|object| context.resolver.type_of(object));
                let array = object.is_some_and(|kind| matches!(kind, Type::Array(..)));
                (length && array).then_some(Thrown::Implicit)
            }
            "update_expression" if other(step.named_child(0)) => Some(Thrown::Implicit),
            "cast_expression" if upcast(context, step) => None,
            "binary_expression" if folded(step) => None,
            _ => throws(context, step),
        }
    }
}

/// A field of a class of this file that nothing stores into: SpotBugs takes it to hold null, so `lock()` on it throws.
fn unwritten(context: &Context, key: &str) -> bool {
    let Some((class, name)) = key.strip_prefix("field:").and_then(|field| field.rsplit_once('.')) else { return false };
    if !context.classes.contains_key(class) {
        return false;
    }
    let counts = context.memo.counts.get_or_init(|| super::super::fields::stored(context).into_iter().map(|(key, values)| (key, values.len())).collect());
    counts.get(&(class.to_string(), name.to_string())).copied().unwrap_or(0) == 0
}

/// `readLock()` or `writeLock()` of a `ReadWriteLock`: SpotBugs takes these calls not to throw.
fn half(context: &Context, step: Node) -> bool {
    let named = step.child_by_field_name("name").is_some_and(|name| matches!(context.text(name), "readLock" | "writeLock"));
    let empty = step.child_by_field_name("arguments").is_some_and(|arguments| arguments.named_child_count() == 0);
    let typed = step.child_by_field_name("object").and_then(|object| context.resolver.type_of(object)).is_some_and(|kind| {
        let name = kind.erased().name();
        name == READ_WRITE || context.resolver.index.is_subtype(&name, READ_WRITE)
    });
    named && empty && typed
}

/// Arithmetic on two literals, which javac works out itself.
fn folded(step: Node) -> bool {
    let literal = |side: Option<Node>| side.map(unwrap).is_some_and(|side| side.kind().ends_with("_literal"));
    literal(step.child_by_field_name("left")) && literal(step.child_by_field_name("right"))
}

/// A cast to a type the value already has: javac writes no check for it.
fn upcast(context: &Context, step: Node) -> bool {
    let target = step.child_by_field_name("type").and_then(|written| context.resolver.type_node(written));
    let value = step.child_by_field_name("value").and_then(|value| context.resolver.type_of(unwrap(value)));
    match (target, value) {
        (Some(target), Some(value)) => {
            let (target, value) = (target.erased().name(), value.erased().name());
            target == value || target == "java.lang.Object" || context.resolver.index.is_subtype(&value, &target)
        }
        _ => false,
    }
}

/// The classes whose own code calls a method or constructor of a class (not an interface) of
/// `java.util.concurrent.locks`: SpotBugs looks at no other class.
fn screened(context: &Context) -> HashSet<String> {
    let index = context.resolver.index;
    super::screen::callers(context, &|owner| in_package(owner) && index.get(owner).is_some_and(|info| !info.is_interface))
}

fn in_package(name: &str) -> bool {
    name.starts_with("java.util.concurrent.locks.")
}

pub fn unreleased(context: &Context) {
    let screened = screened(context);
    for body in super::bodies(context) {
        if !context.text(body).contains("lock") {
            continue;
        }
        let class = enclosing_types(context.resolver.scope, body).into_iter().next();
        if !class.is_some_and(|class| screened.contains(&class)) {
            continue;
        }
        let Some(label) = names::around(context, body) else { continue };
        if super::method_name(&label).to_lowercase().contains("lock") {
            continue;
        }
        let graph = cfg::build_with(context.file, body, &|_| false, true);
        let found = leaks(context, &graph, &Locks);
        if !found.closes {
            continue;
        }
        let counted = |site: &usize| found.closed_after[*site];
        let first = |held: &dyn Fn(usize) -> bool| {
            (0..found.sites.len()).filter(counted).filter(|site| held(*site)).min_by_key(|site| found.sites[*site].start_byte())
        };
        let normal = first(&|site| found.normal[site]);
        let exceptional = first(&|site| !found.normal[site] && found.exceptional[site]);
        for (site, pattern, priority, text) in [(normal, PATTERNS[0], 1, "all paths"), (exceptional, PATTERNS[1], 2, "all exception paths")] {
            let Some(site) = site else { continue };
            let at = found.sites[site];
            let message = format!("{label} does not release lock on {text}");
            context.report_placed(pattern, at, context.line(at), message, place::function(&label), priority);
        }
    }
}
