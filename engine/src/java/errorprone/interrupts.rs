//! InterruptedExceptionSwallowed: an interruption is caught or declared as a plain `Exception` or `Throwable`.
use super::Context;
use super::fixes::Fix;
use super::fix_helpers::qualify_type;
use super::unused::statements;
use super::hierarchy::formals;
use super::throws::{thrown_by, thrown_in_try};
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

const NAME: &str = "InterruptedExceptionSwallowed";
const INTERRUPTED: &str = "java.lang.InterruptedException";
const CAUGHT: &str = "This catch block appears to be catching an explicitly declared InterruptedException as an Exception/Throwable and not handling the interruption separately.";
const DECLARED: &str = "This method can throw InterruptedException but declares that it throws Exception/Throwable. This makes it difficult for callers to recognize the need to handle interruption properly.";

fn listed(context: &Context, method: Node) -> Vec<Option<String>> {
    let clause = children(method).into_iter().find(|part| part.kind() == "throws");
    clause.map(named_children).unwrap_or_default().into_iter().map(|kind| context.resolver.type_node(kind).map(|kind| kind.erased().name())).collect()
}

fn main_method(context: &Context, method: Node) -> bool {
    let parameters = formals(method);
    let name = method.child_by_field_name("name").map(|name| context.text(name));
    let void = method.child_by_field_name("type").is_some_and(|kind| kind.kind() == "void_type");
    let strings = parameters.first().filter(|only| only.kind() == "formal_parameter").and_then(|only| context.resolver.declared_type(*only, None));
    parameters.len() == 1
        && name == Some("main")
        && void
        && has_modifier(method, "public")
        && has_modifier(method, "static")
        && strings.is_some_and(|kind| matches!(&kind, Type::Array(element) if element.name() == "java.lang.String"))
}

fn method(context: &Context, node: Node) {
    let Some(body) = node.child_by_field_name("body") else { return };
    let index = context.resolver.index;
    let under = |name: &str, above: &str| index.is_subtype(name, above);
    let declared = listed(context, node);
    if declared.is_empty() || declared.iter().any(|kind| kind.as_ref().is_none_or(|kind| under(kind, INTERRUPTED))) {
        return;
    }
    if node.kind() == "method_declaration" && main_method(context, node) {
        return;
    }
    let Some(thrown) = thrown_by(context, &[body]) else { return };
    if !thrown.iter().any(|kind| under(kind, INTERRUPTED)) || thrown.iter().any(|kind| kind != INTERRUPTED && under(INTERRUPTED, kind)) {
        return;
    }
    let mut all: Vec<String> = thrown.into_iter().filter(|kind| !under(kind, "java.lang.RuntimeException")).collect();
    for kind in declared.into_iter().flatten().filter(|kind| !under(INTERRUPTED, kind)) {
        if !all.contains(&kind) {
            all.push(kind);
        }
    }
    let kept: Vec<&String> = all.iter().filter(|kind| !all.iter().any(|other| other != *kind && under(kind, other))).collect();
    if kept.len() <= 5 {
        let at = node.child_by_field_name("name").map_or(node.start_byte(), |name| name.start_byte());
        let fix = narrowed(context, node, &kept);
        context.report_fixed(NAME, node, at, DECLARED, &[fix]);
    }
}

/// The `throws` clause gives the exceptions the body throws, written the shortest way, in order.
fn narrowed(context: &Context, method: Node, kept: &[&String]) -> Fix {
    let mut fix = Fix::new();
    let mut names: Vec<String> = kept.iter().map(|kind| qualify_type(context, method, kind, &mut fix)).collect();
    names.sort();
    let clause = children(method).into_iter().find(|part| part.kind() == "throws");
    let types = clause.map(named_children).unwrap_or_default();
    match (types.first(), types.last()) {
        (Some(first), Some(last)) => fix.and(first.start_byte(), last.end_byte(), names.join(", ")),
        _ => fix,
    }
}

/// Lets the catch clause restore the interrupt when it caught one.
fn restoring(context: &Context, clause: Node, name: &str) -> Fix {
    let text = format!("if ({name} instanceof InterruptedException) {{\nThread.currentThread().interrupt();\n}}\n");
    let Some(block) = clause.child_by_field_name("body") else { return Fix::new() };
    match statements(block).first() {
        Some(first) => Fix::new().insert(first.start_byte(), text),
        None => Fix::replace(block.start_byte(), block.end_byte(), format!("{{{text}}}")),
    }
}

fn checks_interruption(context: &Context, block: Node) -> bool {
    let mut found = false;
    walk(block, |part| {
        if part.kind() != "instanceof_expression" {
            return;
        }
        let written = part.child_by_field_name("right").or_else(|| {
            let pattern = part.child_by_field_name("pattern").filter(|pattern| pattern.kind() == "type_pattern")?;
            named_children(pattern).into_iter().find(|inner| inner.kind() != "modifiers")
        });
        let kind = written.and_then(|written| context.resolver.type_node(written));
        found |= kind.is_some_and(|kind| context.resolver.index.is_subtype(&kind.erased().name(), INTERRUPTED));
    });
    found
}

fn rethrown(context: &Context, clause: Node, name: &str) -> bool {
    let mut found = false;
    walk(clause, |part| {
        if part.kind() == "throw_statement" {
            let thrown = named_children(part).into_iter().find(|inner| !inner.kind().ends_with("comment"));
            found |= thrown.is_some_and(|thrown| thrown.kind() == "identifier" && context.text(thrown) == name && holds(context, clause, thrown));
        }
    });
    found
}

/// The name still stands for the variable of the catch clause where it is used.
fn holds(context: &Context, clause: Node, usage: Node) -> bool {
    match super::vars::named(context, usage) {
        Some(super::vars::Named::Other(found)) => parent(found).is_some_and(|holder| holder.id() == clause.id()) && found.kind() == "catch_formal_parameter",
        _ => false,
    }
}

fn declares_interruption(context: &Context, clause: Node) -> bool {
    let around = std::iter::successors(parent(clause), |at| parent(*at))
        .find(|at| matches!(at.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration"));
    around.is_some_and(|around| listed(context, around).iter().any(|kind| kind.as_deref() == Some(INTERRUPTED)))
}

fn attempt(context: &Context, node: Node) {
    let index = context.resolver.index;
    for clause in children(node).into_iter().filter(|part| part.kind() == "catch_clause") {
        let Some(parameter) = children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter") else { return };
        let written = children(parameter).into_iter().filter(|part| part.kind() == "catch_type").flat_map(named_children);
        let caught: Vec<Option<String>> = written.map(|kind| context.resolver.type_node(kind).map(|kind| kind.erased().name())).collect();
        if caught.iter().any(|kind| kind.as_ref().is_none_or(|kind| index.is_subtype(kind, INTERRUPTED))) {
            return;
        }
        if !caught.iter().flatten().any(|kind| index.is_subtype(INTERRUPTED, kind)) {
            continue;
        }
        let Some(thrown) = thrown_in_try(context, node) else { return };
        let name = parameter.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
        let Some(block) = clause.child_by_field_name("body") else { return };
        if thrown.iter().any(|kind| index.is_subtype(kind, INTERRUPTED))
            && !checks_interruption(context, block)
            && !(rethrown(context, clause, name) && declares_interruption(context, clause))
            && !context.suppressed(NAME, parameter)
        {
            context.report_fixed(NAME, clause, clause.start_byte(), CAUGHT, &[restoring(context, clause, name)]);
            return;
        }
    }
}

pub fn interrupted_exception_swallowed(context: &Context, node: Node) {
    match node.kind() {
        "method_declaration" | "constructor_declaration" => method(context, node),
        "try_statement" | "try_with_resources_statement" => attempt(context, node),
        _ => {}
    }
}
