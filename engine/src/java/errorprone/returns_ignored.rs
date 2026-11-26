//! ReturnValueIgnored: the result of a call to one of a fixed set of side-effect-free methods is dropped.
use super::Context;
use super::ignored_fix::call_site_fixes;
use super::ignored_matchers::expected;
use super::returns::referenced;
use super::unused::{dropped, exception_testing, function_returns_void, mocking, throwing_type};
use crate::engine::source::children;
use crate::java::types::expr::Receiver;
use crate::java::types::model::{ClassInfo, Method, Type};
use tree_sitter::Node;

const NAME: &str = "ReturnValueIgnored";
const VOID: Type = Type::Primitive("void");

fn message(name: &str) -> String {
    format!("Return value of '{name}' must be used")
}

fn call(context: &Context, node: Node) {
    let Some(place) = dropped(node) else { return };
    if place.id() != node.id() && function_returns_void(context, place) != Some(true) {
        return;
    }
    let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
    let Some(resolved) = context.resolver.resolve_call(node) else { return };
    let method = &resolved.method;
    if method.returns == VOID || method.returns.name() == "java.lang.Void" {
        return;
    }
    let index = context.resolver.index;
    let Some(declaring) = index.get(&resolved.declaring) else { return };
    let receiver = if node.child_by_field_name("object").is_some() { resolved.receiver.name() } else { resolved.declaring.clone() };
    if !expected(index, &receiver, &resolved.declaring, &declaring.package, method, &context.resolver.scope.package) {
        return;
    }
    if mocking(context, node) || exception_testing(context, node) {
        return;
    }
    let Some(at) = node.child_by_field_name("arguments").map(|list| list.start_byte()) else { return };
    context.report_fixed(NAME, node, at, &message(name), &call_site_fixes(context, node));
}

fn new_class(context: &Context, node: Node) {
    let Some(place) = dropped(node) else { return };
    if place.id() != node.id() && function_returns_void(context, place) != Some(true) {
        return;
    }
    let Some(created) = node.child_by_field_name("type") else { return };
    let Some(kind) = context.resolver.type_node(created).filter(|kind| matches!(kind, Type::Class(..))) else { return };
    if !context.resolver.index.is_subtype(&kind.name(), "com.google.inject.Module") || mocking(context, node) || exception_testing(context, node) {
        return;
    }
    let start = children(node).into_iter().find(|part| part.kind() == "new").map_or(node.start_byte(), |word| word.start_byte());
    context.report_fixed(NAME, node, start, &format!("Ignored return value of '{}'", context.text(created)), &[]);
}

fn owner(context: &Context, qualifier: Node) -> Option<String> {
    match context.resolver.receiver(qualifier) {
        Some(Receiver::Value(kind)) => Some(kind.name()),
        Some(Receiver::Static(name)) => Some(name),
        None => context.resolver.type_node(qualifier).map(|kind| kind.erased().name()),
    }
}

fn reference(context: &Context, node: Node) {
    let parts = children(node);
    let (Some(qualifier), Some(last)) = (parts.first().copied(), parts.last().copied()) else { return };
    let constructor = last.kind() == "new";
    let index = context.resolver.index;
    let Some(target) = context.resolver.type_of(node) else { return };
    let Some((_, function)) = index.functional_method(&target.name()) else { return };
    if function.returns != VOID || throwing_type(context, &target.name()) {
        return;
    }
    let name = if constructor { "<init>" } else { context.text(last) };
    let Some(receiver) = owner(context, qualifier) else { return };
    let candidates = referenced(context, qualifier, name, function.parameters.len());
    let verdict = |(class, method): &(&ClassInfo, &Method)| {
        let nothing = !constructor && (method.returns == VOID || method.returns.name() == "java.lang.Void");
        !nothing && expected(index, &receiver, &class.name, &class.package, method, &context.resolver.scope.package)
    };
    if !candidates.is_empty() && candidates.iter().all(verdict) {
        let shown = if constructor { context.text(qualifier) } else { name };
        context.report_fixed(NAME, node, node.start_byte(), &message(shown), &[]);
    }
}

pub fn return_value_ignored(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => call(context, node),
        "object_creation_expression" => new_class(context, node),
        "method_reference" => reference(context, node),
        _ => {}
    }
}
