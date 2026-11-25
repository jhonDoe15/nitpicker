//! The handlers around a place in a body, the way SpotBugs reads them from the compiled exception table.
use super::Context;
use crate::engine::source::{children, named_children};
use tree_sitter::Node;

pub const UNKNOWN: &str = "?";

/// The exception types a method declares, by name. One that cannot be read counts as `Throwable`.
pub fn declares(method: &crate::java::types::model::Method) -> Vec<String> {
    let named = |kind: &crate::java::types::model::Type| Some(kind.erased().name()).filter(|name| name != UNKNOWN);
    method.throws.iter().map(|kind| named(kind).unwrap_or_else(|| "java.lang.Throwable".to_string())).collect()
}

/// What stands between a place in a body and the caller, as the compiled exception table has it: only the
/// innermost handler around the place is asked.
#[derive(Clone)]
pub enum Guard {
    /// No handler around the place.
    Open,
    /// The handler the compiler makes for a `finally` block or a `synchronized` block: it passes everything on.
    Passes,
    /// The body of a `try` with resources: the handler that closes the resources takes everything first.
    Closes,
    /// The `catch` clauses of the innermost `try`.
    Takes(Vec<String>),
}

/// Whether the innermost handler takes the exception. For a call in a method, as opposed to a constructor,
/// SpotBugs wants every `catch` clause of the `try` to take it.
pub fn caught(context: &Context, thrown: &str, guard: &Guard, every: bool) -> bool {
    let index = context.resolver.index;
    let takes = |caught: &String| {
        caught == "java.lang.Throwable" || (thrown == UNKNOWN && caught == "java.lang.Exception") || (thrown != UNKNOWN && index.is_subtype(thrown, caught))
    };
    match guard {
        Guard::Open | Guard::Passes => false,
        Guard::Closes => true,
        Guard::Takes(catches) if every => catches.iter().all(takes),
        Guard::Takes(catches) => catches.iter().any(takes),
    }
}

/// What closing the resources of a `try` can throw: the exceptions `close()` declares for each resource.
pub fn closing(context: &Context, statement: Node) -> Vec<String> {
    let resolver = context.resolver;
    let index = resolver.index;
    let mut thrown = Vec::new();
    for resource in children(statement).into_iter().filter(|part| part.kind() == "resource_specification").flat_map(named_children) {
        let declared = resource.child_by_field_name("type").and_then(|kind| resolver.type_node(kind));
        let kind = match resource.kind() {
            "resource" => declared
                .or_else(|| resource.child_by_field_name("value").and_then(|value| resolver.type_of(value)))
                .or_else(|| resource.named_child(0).filter(|_| resource.named_child_count() == 1).and_then(|used| resolver.type_of(used))),
            _ => resolver.type_of(resource),
        };
        // A resource class missing from the class path is one SpotBugs cannot follow: its closing does not count.
        let Some(kind) = kind.filter(|kind| !matches!(kind, crate::java::types::model::Type::Class(..)) || index.get(&kind.erased().name()).is_some()) else {
            continue;
        };
        let close = Some(&kind).and_then(|kind| index.methods(&kind.erased().name(), "close").into_iter().find(|(_, method)| method.parameters.is_empty()));
        match close {
            Some((_, method)) => thrown.extend(declares(method)),
            None => thrown.push("java.lang.Exception".to_string()),
        }
    }
    thrown
}

pub fn catch_types(context: &Context, statement: Node) -> Vec<String> {
    let mut found = Vec::new();
    for clause in children(statement).into_iter().filter(|part| part.kind() == "catch_clause") {
        for parameter in children(clause).into_iter().filter(|part| part.kind() == "catch_formal_parameter") {
            for listed in children(parameter).into_iter().filter(|part| part.kind() == "catch_type").flat_map(named_children) {
                found.push(context.resolver.type_node(listed).map_or_else(|| UNKNOWN.to_string(), |kind| kind.erased().name()));
            }
        }
    }
    found
}
