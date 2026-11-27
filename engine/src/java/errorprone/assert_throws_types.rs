//! The pieces of AssertThrowsMinimizer's fix: the hoisted variables' types as javac prints them, and the `throws` it
//! adds to the method.
use super::Context;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::positions::arguments;
use crate::engine::source::{children, named_children};
use crate::java::types::model::{Method, Type};
use tree_sitter::Node;

/// `SuggestedFixes.qualifyType` for a type: each class named as it can be written in the method.
pub(super) fn written(context: &Context, at: Node, kind: &Type, fix: &mut Fix) -> String {
    match kind {
        Type::Class(name, arguments) => {
            let base = qualify_type(context, at, name, fix);
            if arguments.is_empty() {
                return base;
            }
            let shown: Vec<String> = arguments.iter().map(|argument| written(context, at, argument, fix)).collect();
            format!("{base}<{}>", shown.join(", "))
        }
        Type::Array(element) => format!("{}[]", written(context, at, element, fix)),
        Type::Bounded(lower, bound) => format!("? {} {}", if *lower { "super" } else { "extends" }, written(context, at, bound, fix)),
        other => super::qualify::qualify_type(context, at, other),
    }
}

fn wildcard(kind: &Type) -> bool {
    match kind {
        Type::Wildcard | Type::Bounded(..) => true,
        Type::Class(_, arguments) => arguments.iter().any(wildcard),
        Type::Array(element) => wildcard(element),
        _ => false,
    }
}

/// The type javac gives the hoisted value; `None` where it would hold a captured or inferred type the engine does not
/// know as javac prints it.
pub(super) fn hoisted_type(context: &Context, site: Node) -> Option<Type> {
    let resolver = &context.resolver;
    let kind = match site.kind() {
        "object_creation_expression" => {
            let written = site.child_by_field_name("type")?;
            let diamond = written.kind() == "generic_type" && named_children(written).into_iter().any(|part| part.kind() == "type_arguments" && part.named_child_count() == 0);
            if diamond { resolver.type_of(site).filter(|kind| matches!(kind, Type::Class(_, arguments) if !arguments.is_empty()))? } else { resolver.type_node(written)? }
        }
        _ => resolver.type_of(site)?,
    };
    let object = site.child_by_field_name("object").filter(|_| matches!(site.kind(), "method_invocation" | "field_access"));
    let generic = site.kind() == "method_invocation" && resolver.resolve_call(site).is_none_or(|call| !inferred_from_arguments(context, site, &call.method));
    let captured = object.is_some_and(|object| resolver.type_of(object).is_some_and(|kind| wildcard(&kind) || variable(&kind)));
    (!wildcard(&kind) && !generic && !captured && !generic_scope(site)).then_some(kind)
}

fn variable(kind: &Type) -> bool {
    match kind {
        Type::Variable(_) => true,
        Type::Class(_, arguments) => arguments.iter().any(variable),
        Type::Array(element) | Type::Bounded(_, element) => variable(element),
        _ => false,
    }
}

/// Whether a class or method around the node declares type parameters: the engine reads their uses as their bounds,
/// where javac keeps the variable.
fn generic_scope(node: Node) -> bool {
    std::iter::successors(crate::engine::source::parent(node), |at| crate::engine::source::parent(*at))
        .any(|at| children(at).into_iter().any(|part| part.kind() == "type_parameters"))
}

fn mentions(kind: &Type, variable: &str) -> bool {
    match kind {
        Type::Variable(name) => name == variable,
        Type::Class(_, arguments) => arguments.iter().any(|argument| mentions(argument, variable)),
        Type::Array(element) | Type::Bounded(_, element) => mentions(element, variable),
        _ => false,
    }
}

/// Whether the engine infers a generic call's type arguments as javac does: each from the arguments, all of one type.
fn inferred_from_arguments(context: &Context, call: Node, method: &Method) -> bool {
    if method.type_parameters.is_empty() {
        return true;
    }
    let from_parameters = method.type_parameters.iter().all(|variable| method.generic_parameters.iter().any(|kind| mentions(kind, variable)));
    let kinds: Vec<Option<Type>> = arguments(call).into_iter().map(|argument| context.resolver.type_of(argument)).collect();
    from_parameters && kinds.iter().all(|kind| kind.is_some() && *kind == kinds[0])
}

/// `addThrows`: ` throws Exception` (or `Throwable`) on the method, unless it already throws a supertype.
pub(super) fn add_throws(context: &Context, method: Node, body: Node, exception: &str, fix: Fix) -> Fix {
    let listed: Vec<Node> = children(method).into_iter().find(|part| part.kind() == "throws").map(named_children).unwrap_or_default();
    let full = format!("java.lang.{exception}");
    if listed.iter().any(|kind| context.resolver.type_node(*kind).is_some_and(|kind| context.resolver.index.is_subtype(&full, &kind.name()))) {
        return fix;
    }
    match listed.last() {
        None => fix.insert(body.start_byte(), format!(" throws {exception}")),
        Some(last) => fix.insert(last.end_byte(), format!(", {exception}")),
    }
}
