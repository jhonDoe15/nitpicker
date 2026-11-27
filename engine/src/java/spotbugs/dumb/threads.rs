//! The thread, exit and collector calls of DumbMethods, measured on test code:
//! - DM_GC: `System.gc()` or `Runtime.gc()`, unless the method's name starts or ends with `gc`, starts with `test`
//!   or the method is a non-private `void main()` or `void main(String[])`; priority 1, once per method.
//! - DM_EXIT: `System.exit(int)` (not `Runtime.exit` or `halt`), unless the method's name contains `exit`, `Exit`
//!   or `main`; priority 2, 3 (hidden) in a static method or a lambda that does not use `this`.
//! - DM_RUN_FINALIZERS_ON_EXIT: `System.runFinalizersOnExit` or `Runtime.runFinalizersOnExit` (gone since JDK 11,
//!   so matched by name); priority 1, once per method.
//! - DMI_THREAD_PASSED_WHERE_RUNNABLE_EXPECTED: an argument declared exactly `java.lang.Thread` for a parameter
//!   declared `Runnable`, of a method or constructor; priority 2, once per method and called method. The SARIF
//!   place is the called method, owned by the receiver's class when that inherits it; the shown name drops the
//!   current class and package.
//! - DMI_FUTILE_ATTEMPT_TO_CHANGE_MAXPOOL_SIZE_OF_SCHEDULED_THREAD_POOL_EXECUTOR: `setMaximumPoolSize` written
//!   against `ScheduledThreadPoolExecutor` itself, not through `super` or an anonymous subclass; priority 1.
//! - DM_MONITOR_WAIT_ON_CONDITION: `wait(…)` on a receiver declared as a class that implements `Condition` (javac
//!   writes `Object.wait` for an interface), seen through casts to `Object`; priority 1, once per method.
//! - DM_USELESS_THREAD is priority 3 only; DMI_SCHEDULED_THREAD_POOL_EXECUTOR_WITH_ZERO_CORE_THREADS is not
//!   reported for `new ScheduledThreadPoolExecutor(0)` nor `Executors.newScheduledThreadPool(0)`.
use super::super::idioms::{Compiled, called};
use super::super::idioms::encoding::written_owner;
use super::super::taint::lines::line as invoke_line;
use super::super::{Context, names, place};
use crate::engine::source::{named_children, walk};
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::enclosing_types;
use std::collections::HashSet;
use tree_sitter::Node;

pub const GC: &str = "DM_GC";
pub const EXIT: &str = "DM_EXIT";
pub const FINALIZERS: &str = "DM_RUN_FINALIZERS_ON_EXIT";
pub const THREAD_PASSED: &str = "DMI_THREAD_PASSED_WHERE_RUNNABLE_EXPECTED";
pub const FUTILE: &str = "DMI_FUTILE_ATTEMPT_TO_CHANGE_MAXPOOL_SIZE_OF_SCHEDULED_THREAD_POOL_EXECUTOR";
pub const CONDITION_WAIT: &str = "DM_MONITOR_WAIT_ON_CONDITION";
pub const USELESS_THREAD: &str = "DM_USELESS_THREAD";
pub const ZERO_CORE: &str = "DMI_SCHEDULED_THREAD_POOL_EXECUTOR_WITH_ZERO_CORE_THREADS";
pub const PATTERNS: &[&str] = &[GC, EXIT, FINALIZERS, THREAD_PASSED, FUTILE, CONDITION_WAIT, USELESS_THREAD, ZERO_CORE];

const RUNNABLE: &str = "java.lang.Runnable";
const THREAD: &str = "java.lang.Thread";

fn arguments(node: Node) -> Vec<Node> {
    node.child_by_field_name("arguments").map(|list| named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()).unwrap_or_default()
}

fn call_line(context: &Context, node: Node) -> usize {
    node.child_by_field_name("arguments").map_or_else(|| context.line(node), |arguments| context.line(arguments))
}

/// The name of the method javac writes: `<init>`, `<clinit>`, or the name in the label.
fn method_name(label: &str) -> &str {
    if label.starts_with("new ") {
        return "<init>";
    }
    let open = label.find('(').unwrap_or(label.len());
    let name = &label[label[..open].rfind('.').map_or(0, |dot| dot + 1)..open];
    if name.starts_with("<static initializer") { "<clinit>" } else { name }
}

/// Whether the method javac writes is static: a static method or initializer, or a lambda that does not use `this`.
fn is_static(context: &Context, method: &Compiled) -> bool {
    if method.lambda {
        let mut instance = false;
        walk(method.member, |node| {
            instance |= match node.kind() {
                "this" | "super" => true,
                "method_invocation" if node.child_by_field_name("object").is_none() => context.resolver.resolve_call(node).is_some_and(|call| !call.method.is_static),
                "identifier" => matches!(context.resolver.binding(node, context.text(node)), Some(Binding::Field(_, _, field)) if field.flags & flag::STATIC == 0),
                _ => false,
            };
        });
        return !instance;
    }
    let member = method.member;
    match member.kind() {
        "method_declaration" => crate::java::helpers::has_modifier(member, "static"),
        "constructor_declaration" | "compact_constructor_declaration" => false,
        _ => method.label.contains("<static initializer"),
    }
}

/// Whether the method is a launcher SpotBugs leaves alone: a non-private `void main()` or `void main(String...)`.
fn launcher(context: &Context, method: &Compiled) -> bool {
    let member = method.member;
    if method.lambda || member.kind() != "method_declaration" || crate::java::helpers::has_modifier(member, "private") {
        return false;
    }
    let spread = |part: &Node| part.kind() == "spread_parameter" && named_children(*part).into_iter().find(|inner| inner.kind() != "modifiers").and_then(|kind| context.resolver.type_node(kind)).is_some_and(|kind| kind.name() == "java.lang.String");
    let void = member.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "void");
    let given: Vec<Node> = member.child_by_field_name("parameters").map(named_children).unwrap_or_default().into_iter().filter(|part| part.kind().ends_with("parameter")).collect();
    let strings = |part: &Node| part.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)).is_some_and(|kind| kind == Type::Array(Box::new(Type::class("java.lang.String"))));
    void && method_name(&method.label) == "main" && (given.is_empty() || (given.len() == 1 && (strings(&given[0]) || spread(&given[0]))))
}

fn declared_class(context: &Context, node: Node) -> Option<String> {
    match context.resolver.type_of(node)?.erased() {
        Type::Class(name, _) => Some(name),
        _ => None,
    }
}

fn static_on(context: &Context, node: Node, class: &str, name: &str) -> bool {
    let named = node.child_by_field_name("name").is_some_and(|written| context.text(written) == name);
    named && context.resolver.resolve_call(node).is_some_and(|call| call.method.is_static && call.declaring == class)
}

fn collects(context: &Context, own: &str, node: Node) -> bool {
    if !arguments(node).is_empty() || node.child_by_field_name("name").is_none_or(|name| context.text(name) != "gc") {
        return false;
    }
    static_on(context, node, "java.lang.System", "gc") || written_owner(context, own, node).as_deref() == Some("java.lang.Runtime")
}

fn finalizes(context: &Context, node: Node) -> bool {
    let named = node.child_by_field_name("name").is_some_and(|name| context.text(name) == "runFinalizersOnExit");
    let object = node.child_by_field_name("object").map(|object| context.text(object)).unwrap_or_default();
    named && matches!(object, "System" | "Runtime" | "java.lang.System" | "java.lang.Runtime")
}

fn waits_on_condition(context: &Context, node: Node) -> bool {
    if node.child_by_field_name("name").is_none_or(|name| context.text(name) != "wait") {
        return false;
    }
    let mut object = node.child_by_field_name("object").map(unwrap);
    while let Some(cast) = object.filter(|object| object.kind() == "cast_expression") {
        let upcast = cast.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)).is_some_and(|kind| kind.name() == "java.lang.Object");
        object = upcast.then(|| cast.child_by_field_name("value").map(unwrap)).flatten();
    }
    let Some(class) = object.and_then(|object| declared_class(context, object)) else { return false };
    let index = context.resolver.index;
    index.get(&class).is_some_and(|info| !info.is_interface) && index.is_subtype(&class, "java.util.concurrent.locks.Condition")
}

/// The method or constructor a call hands a `Thread` where it asks for a `Runnable`, as SpotBugs names it.
fn thread_passed(context: &Context, node: Node) -> Option<(String, String)> {
    let call = match node.kind() {
        "object_creation_expression" => context.resolver.resolve_constructor(node)?,
        "method_invocation" if node.child_by_field_name("object").is_none_or(|object| object.kind() != "super") => context.resolver.resolve_call(node)?,
        _ => return None,
    };
    let given = arguments(node);
    let passed = call.method.parameters.iter().zip(&given).any(|(formal, argument)| formal.erased().name() == RUNNABLE && !super::urls::generic_return(context, *argument) && declared_class(context, *argument).as_deref() == Some(THREAD));
    if !passed {
        return None;
    }
    let name = if node.kind() == "object_creation_expression" { "<init>".to_string() } else { context.text(node.child_by_field_name("name")?).to_string() };
    let own = enclosing_types(context.resolver.scope, node).into_iter().next().map(|own| names::binary(context, &own)).unwrap_or_default();
    let written = (node.kind() == "method_invocation").then(|| written_owner(context, &own, node)).flatten();
    let owner = written.filter(|written| context.resolver.index.is_subtype(written, &call.declaring)).unwrap_or(call.declaring);
    let label = called(context, &owner, &name, &call.method.parameters);
    let package = names::package_of(&own);
    let shown = label.strip_prefix(&format!("{own}.")).map_or_else(|| label.clone(), String::from);
    let shown = match (package.is_empty(), shown.strip_prefix("new ")) {
        (false, Some(rest)) => rest.strip_prefix(&format!("{package}.")).map_or(shown.clone(), |rest| format!("new {rest}")),
        (false, None) => shown.strip_prefix(&format!("{package}.")).map_or(shown.clone(), String::from),
        _ => shown,
    };
    Some((label, shown))
}

fn report(context: &Context, pattern: &'static str, node: Node, line: usize, method: &Compiled, priority: u8, message: String) {
    context.report_listed(pattern, node, line, message, place::function(&method.label), priority, vec![method.label.clone()]);
}

pub fn check(context: &Context, own: &str, methods: &[Compiled]) {
    if !context.wants(PATTERNS) {
        return;
    }
    for method in methods {
        let name = method_name(&method.label);
        let mut seen: HashSet<String> = HashSet::new();
        let label = &method.label;
        for node in method.nodes.iter().copied() {
            if let Some((called, shown)) = thread_passed(context, node).filter(|(called, _)| seen.insert(called.clone())) {
                let line = if node.kind() == "method_invocation" { call_line(context, node) } else { invoke_line(context, node) };
                let message = format!("Thread passed where Runnable expected in {label}");
                let owner = enclosing_types(context.resolver.scope, node).into_iter().next().map(|own| names::binary(context, &own)).unwrap_or_default();
                let place = format!("function:{called}|{}@{shown}", names::package_of(&owner));
                context.report_listed(THREAD_PASSED, node, line, message, place, 2, vec![label.clone()]);
            }
            if node.kind() != "method_invocation" {
                continue;
            }
            let skip_gc = name.starts_with("gc") || name.ends_with("gc") || name.starts_with("test") || launcher(context, method);
            if !skip_gc && collects(context, own, node) && seen.insert(GC.to_string()) {
                let message = format!("{label} forces garbage collection; extremely dubious except in benchmarking code");
                report(context, GC, node, call_line(context, node), method, 1, message);
            }
            let skip_exit = name.contains("exit") || name.contains("Exit") || name.contains("main");
            if !skip_exit && static_on(context, node, "java.lang.System", "exit") && seen.insert(EXIT.to_string()) {
                let priority = if is_static(context, method) { 3 } else { 2 };
                let message = format!("{label} invokes System.exit(...), which shuts down the entire virtual machine");
                if priority == 2 {
                    report(context, EXIT, node, call_line(context, node), method, 2, message);
                }
            }
            if finalizes(context, node) && seen.insert(FINALIZERS.to_string()) {
                report(context, FINALIZERS, node, call_line(context, node), method, 1, format!("{label} invokes dangerous method runFinalizersOnExit"));
            }
            let plain = node.child_by_field_name("object").map(unwrap).is_none_or(|object| object.kind() != "super" && !(object.kind() == "object_creation_expression" && crate::engine::source::children(object).iter().any(|part| part.kind() == "class_body")));
            let futile = plain && node.child_by_field_name("name").is_some_and(|written| context.text(written) == "setMaximumPoolSize")
                && written_owner(context, own, node).as_deref() == Some("java.util.concurrent.ScheduledThreadPoolExecutor");
            if futile && seen.insert(FUTILE.to_string()) {
                let message = format!("Futile attempt to change max pool size of ScheduledThreadPoolExecutor in {label}");
                report(context, FUTILE, node, call_line(context, node), method, 1, message);
            }
            if waits_on_condition(context, node) && seen.insert(CONDITION_WAIT.to_string()) {
                report(context, CONDITION_WAIT, node, call_line(context, node), method, 1, format!("Monitor wait() called on a Condition in {label}"));
            }
        }
    }
}
