//! SE_COMPARATOR_SHOULD_BE_SERIALIZABLE (ComparatorIdiom): a concrete named class that is a `Comparator` but not
//! `Serializable`; anonymous and local classes, whose compiled names start with a number after the last `$`, are left
//! alone, as is a class with `@SuppressFBWarnings` for it on a method. A field holding a non-`Serializable`
//! `Comparator`, or a class that likely cannot be serialized as SE_BAD_FIELD judges it from the whole run, hides the
//! finding (priority 3); `java.util` collections and maps do not. CO_COMPARETO_INCORRECT_FLOATING and
//! CO_COMPARETO_RESULTS_MIN_VALUE (FindComparatorProblems) look at the instance `int` methods named `compare` of a
//! `Comparator` and the one-parameter `compareTo` of a `Comparable`.
mod floating;
mod minimum;
mod operands;
mod values;

pub use floating::own_nodes;

use super::classes::Shape;
use super::{Context, names, place};
use crate::engine::source::children;
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &["SE_COMPARATOR_SHOULD_BE_SERIALIZABLE"];
pub const METHOD_PATTERNS: &[&str] = &[floating::PATTERN, minimum::PATTERN];

pub fn check(context: &Context, shape: &Shape) {
    let index = context.resolver.index;
    let concrete = matches!(shape.class.kind(), "class_declaration" | "record_declaration") && !has_modifier(shape.class, "abstract");
    if !concrete || !context.wants(PATTERNS) || !index.is_subtype(&shape.own, "java.util.Comparator") || index.is_subtype(&shape.own, "java.io.Serializable") {
        return;
    }
    let binary = names::binary(context, &shape.own);
    let numbered = binary.rsplit('$').next().is_some_and(|last| last.starts_with(|first: char| first.is_ascii_digit()));
    let Some(first) = shape.first_line.filter(|_| !numbered) else { return };
    if suppressed_by_methods(context, shape.class) {
        return;
    }
    let mut held = Vec::new();
    for member in shape.members.iter().filter(|member| member.kind() == "field_declaration") {
        let mut kind = context.resolver.declared_type(*member, None);
        while let Some(Type::Array(element)) = kind {
            kind = Some(*element);
        }
        let Some(Type::Class(name, _)) = kind else { continue };
        let variable = matches!(member.child_by_field_name("type").and_then(|written| context.resolver.written(written, true)), Some(Type::Variable(_)));
        let comparator = index.is_subtype(&name, "java.util.Comparator") && !index.is_subtype(&name, "java.io.Serializable");
        let collection = ["java.util.Collection", "java.util.Map"].iter().any(|shared| index.is_subtype(&name, shared));
        if comparator && name != shape.own {
            held.push("!".to_string());
        } else if !variable && !collection {
            held.push(name);
        }
    }
    let message = format!("{binary} implements Comparator but not Serializable");
    let Some(mut finding) = context.finding_listed(PATTERNS[0], shape.class, first, message, place::class(context, &shape.own), vec![binary]) else { return };
    finding.priority = Some(2);
    context.comparators.borrow_mut().push((finding, held));
}

/// The compare methods of a class, enum, record, interface or anonymous class.
pub fn comparators<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(METHOD_PATTERNS) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let Some(body) = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")) else { return };
    let index = context.resolver.index;
    let comparator = index.is_subtype(&own, "java.util.Comparator");
    let comparable = index.is_subtype(&own, "java.lang.Comparable");
    if !(comparator || comparable) {
        return;
    }
    for method in place::members(body).into_iter().filter(|member| member.kind() == "method_declaration") {
        let name = method.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
        let returns_int = method.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "int");
        let count = method.child_by_field_name("parameters").map_or(0, |list| children(list).into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter")).count());
        let wanted = (comparator && name == "compare") || (comparable && name == "compareTo" && count == 1);
        let (erased, _, _) = context.resolver.parameters(method.child_by_field_name("parameters"));
        let bridged = !erased.is_empty() && erased.iter().all(|kind| kind.erased().name() == "java.lang.Object") && count == if name == "compare" { 2 } else { 1 };
        let Some(code) = method.child_by_field_name("body").filter(|_| wanted && !bridged && returns_int && !has_modifier(method, "static")) else { continue };
        let label = names::method(context, &own, method, None);
        if context.wants(&[floating::PATTERN]) {
            floating::check(context, &own, &label, code);
        }
        if let Some(found) = minimum::first_return(context, code).filter(|_| context.wants(&[minimum::PATTERN])) {
            let line = super::classes::lines::statement_start(context, found).unwrap_or_else(|| context.line(found));
            let message = format!("{label} returns Integer.MIN_VALUE, which cannot be negated");
            context.report_listed(minimum::PATTERN, found, line, message, place::function(&label), 2, vec![label.clone()]);
        }
    }
}

/// Whether a method declared in the class carries `@SuppressFBWarnings` naming the pattern.
fn suppressed_by_methods(context: &Context, class: Node) -> bool {
    let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"));
    body.is_some_and(|body| place::members(body).into_iter().any(|member| member.kind() == "method_declaration" && context.suppresses(member, PATTERNS[0])))
}
