//! IgnoredPureGetter and RxReturnValueIgnored: results of calls dropped where Error Prone's `AbstractReturnValueIgnored`
//! looks, for getters that cost nothing and for Rx objects that do nothing until subscribed.
use super::Context;
use super::fixes::Fix;
use super::hierarchy::super_methods;
use super::returns::referenced;
use super::unused::{dropped, exception_testing, function_returns_void, mocking, throwing_type};
use crate::engine::source::{children, parent};
use crate::java::types::expr::Receiver;
use crate::java::types::model::{ClassInfo, Method, Type, flag};
use tree_sitter::Node;

const VOID: Type = Type::Primitive("void");
const MESSAGE_LITE: &str = "com.google.protobuf.MessageLite";
const MUTABLE_MESSAGE_LITE: &str = "com.google.protobuf.MutableMessageLite";
const GETTER_MESSAGE: &str = "Getters on AutoValues, AutoBuilders, and Protobuf Messages are side-effect free, so there is no point in calling them if the return value is ignored. While there are no side effects from the getter, the receiver may have side effects.";
const RX_MESSAGE: &str = "Returned Rx objects must be checked. Ignoring a returned Rx value means it is never scheduled for execution";
const RX_TYPES: [&str; 8] = [
    "io.reactivex.Observable", "io.reactivex.Flowable", "io.reactivex.Single", "io.reactivex.Maybe", "io.reactivex.Completable", "rx.Observable", "rx.Single", "rx.Completable",
];

/// The result of the call or creation is dropped where it matters, and nothing about the place excuses it.
fn dropped_here(context: &Context, node: Node) -> bool {
    let Some(place) = dropped(node) else { return false };
    (place.id() == node.id() || function_returns_void(context, place) == Some(true)) && !mocking(context, node) && !exception_testing(context, node)
}

fn pure_getter(context: &Context, owner: &ClassInfo, method: &Method) -> bool {
    let index = context.resolver.index;
    if method.is_abstract && method.parameters.is_empty() {
        if owner.flags & flag::AUTO_VALUE != 0 {
            return true;
        }
        if owner.flags & flag::AUTO_BUILDER != 0 {
            let vars = owner.type_parameters.iter().map(|(name, _)| Type::Variable(name.clone())).collect();
            if method.generic_returns != Type::Class(owner.name.clone(), vars) {
                return true;
            }
        }
    }
    let under = |above: &str| index.has(above) && index.is_subtype(&owner.name, above);
    under(MESSAGE_LITE) && !under(MUTABLE_MESSAGE_LITE)
}

fn call(context: &Context, node: Node) {
    if !dropped_here(context, node) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(node) else { return };
    if resolved.method.returns == VOID || resolved.method.returns.name() == "java.lang.Void" {
        return;
    }
    let Some(owner) = context.resolver.index.get(&resolved.declaring) else { return };
    if !pure_getter(context, owner, &resolved.method) {
        return;
    }
    let holder = parent(node).filter(|holder| holder.kind() == "expression_statement");
    let target = holder.unwrap_or(node);
    let mut fixes = vec![Fix::new().delete(target.start_byte(), target.end_byte())];
    if let Some(receiver) = node.child_by_field_name("object").filter(|receiver| receiver.kind() == "method_invocation") {
        fixes.push(Fix::replace(node.start_byte(), node.end_byte(), context.text(receiver)));
    }
    let at = node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte());
    context.report_fixed("IgnoredPureGetter", node, at, GETTER_MESSAGE, &fixes);
}

fn creation(context: &Context, node: Node) {
    if !dropped_here(context, node) {
        return;
    }
    let (Some(created), Some(resolved)) = (node.child_by_field_name("type"), context.resolver.resolve_constructor(node)) else { return };
    let Some(owner) = context.resolver.index.get(&resolved.declaring) else { return };
    if !pure_getter(context, owner, &resolved.method) {
        return;
    }
    let start = children(node).into_iter().find(|part| part.kind() == "new").map_or(node.start_byte(), |word| word.start_byte());
    context.report_fixed("IgnoredPureGetter", node, start, &format!("Ignored return value of '{}'", context.text(created)), &[]);
}

fn owner_of_qualifier(context: &Context, qualifier: Node) -> Option<String> {
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
    if function.returns != VOID || throwing_type(context, &target.name()) || owner_of_qualifier(context, qualifier).is_none() {
        return;
    }
    let name = if constructor { "<init>" } else { context.text(last) };
    let candidates = referenced(context, qualifier, name, function.parameters.len());
    let verdict = |(class, method): &(&ClassInfo, &Method)| {
        let nothing = !constructor && (method.returns == VOID || method.returns.name() == "java.lang.Void");
        !nothing && pure_getter(context, class, method)
    };
    if !candidates.is_empty() && candidates.iter().all(verdict) {
        context.report_fixed("IgnoredPureGetter", node, node.start_byte(), GETTER_MESSAGE, &[]);
    }
}

pub fn ignored_pure_getter(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => call(context, node),
        "object_creation_expression" => creation(context, node),
        "method_reference" => reference(context, node),
        _ => {}
    }
}

fn can_ignore(context: &Context, owner: &ClassInfo, method: &Method) -> bool {
    if method.flags & flag::MAY_IGNORE != 0 {
        return true;
    }
    let index = context.resolver.index;
    super_methods(index, owner, method).into_iter().any(|(_, above)| above.flags & flag::MAY_IGNORE != 0 && above.returns.name() == method.returns.name())
}

pub fn rx_return_value_ignored(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !dropped_here(context, node) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(node) else { return };
    let index = context.resolver.index;
    if resolved.method.returns == VOID || resolved.method.returns.name() == "java.lang.Void" {
        return;
    }
    let Some(result) = context.resolver.type_of(node) else { return };
    let result = result.erased().name();
    if !RX_TYPES.iter().any(|rx| index.is_subtype(&result, rx)) {
        return;
    }
    let Some(owner) = index.get(&resolved.declaring) else { return };
    if can_ignore(context, owner, &resolved.method) || (resolved.method.name == "put" && index.is_subtype(&owner.name, "java.util.Map")) {
        return;
    }
    let at = node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte());
    context.report_fixed("RxReturnValueIgnored", node, at, RX_MESSAGE, &[]);
}
