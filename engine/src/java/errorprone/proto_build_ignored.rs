//! ProtoBuilderReturnValueIgnored: a proto builder's `build()` whose result nobody uses.
use super::fixes::Fix;
use super::owners::{is_descendant, receiver_name};
use super::parts::preferred;
use super::unused::{dropped, exception_testing, function_returns_void, mocking, throwing_type};
use super::Context;
use crate::engine::source::{children, parent};
use crate::java::types::expr::Receiver;
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "Unnecessary call to proto's #build() method.  If you don't consume the return value of #build(), the result is discarded and the only effect is to verify that all required fields are set, which can be expressed more directly with #isInitialized().";
const BUILDER: &str = "com.google.protobuf.MessageLite.Builder";

fn name_of<'f>(context: &'f Context, node: Node) -> &'f str {
    node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

fn is_root_invocation(context: &Context, call: Node) -> bool {
    match name_of(context, call) {
        "newBuilder" => receiver_name(context, call, true).is_some_and(|owner| is_descendant(context, &owner, &["com.google.protobuf.MessageLite"])),
        "toBuilder" => receiver_name(context, call, false).is_some_and(|owner| is_descendant(context, &owner, &["com.google.protobuf.MessageLite"])),
        _ => false,
    }
}

/// Whether the receivers of the expression, outward, include a call that starts a builder.
fn terminates_in_new_builder(context: &Context, start: Option<Node>) -> bool {
    let mut current = start;
    while let Some(receiver) = current {
        if receiver.kind() == "method_invocation" && is_root_invocation(context, receiver) {
            return true;
        }
        current = match receiver.kind() {
            "method_invocation" => receiver.child_by_field_name("object"),
            "field_access" => receiver.child_by_field_name("object"),
            _ => None,
        };
    }
    false
}

fn call(context: &Context, node: Node) {
    if !matches!(name_of(context, node), "build" | "buildPartial") || !receiver_name(context, node, false).is_some_and(|owner| is_descendant(context, &owner, &[BUILDER])) {
        return;
    }
    if terminates_in_new_builder(context, node.child_by_field_name("object")) {
        return;
    }
    let Some(place) = dropped(node) else { return };
    if place.id() != node.id() && function_returns_void(context, place) != Some(true) {
        return;
    }
    if mocking(context, node) || exception_testing(context, node) {
        return;
    }
    let Some(receiver) = node.child_by_field_name("object") else { return };
    let simple = match matches!(receiver.kind(), "identifier" | "field_access") {
        true => {
            let statement = parent(node).filter(|up| up.kind() != "for_statement").unwrap_or(node);
            Fix::replace(statement.start_byte(), statement.end_byte(), "")
        }
        false => Fix::replace(receiver.end_byte(), node.end_byte(), ""),
    };
    let checked = Fix::new().insert(node.start_byte(), "checkState(").and(receiver.end_byte(), node.end_byte(), ".isInitialized())").with_imports();
    context.report_fixed("ProtoBuilderReturnValueIgnored", node, preferred(node), MESSAGE, &[simple, checked]);
}

fn reference(context: &Context, node: Node) {
    let parts = children(node);
    let (Some(qualifier), Some(last)) = (parts.first().copied(), parts.last().copied()) else { return };
    if !matches!(context.text(last), "build" | "buildPartial") {
        return;
    }
    let owner = match context.resolver.receiver(qualifier) {
        Some(Receiver::Value(kind)) => kind.erased().name(),
        Some(Receiver::Static(name)) => name,
        None => match context.resolver.type_node(qualifier) {
            Some(kind) => kind.erased().name(),
            None => return,
        },
    };
    if !is_descendant(context, &owner, &[BUILDER]) {
        return;
    }
    let Some(target) = context.resolver.type_of(node) else { return };
    let Some((_, function)) = context.resolver.index.functional_method(&target.name()) else { return };
    if function.returns != Type::Primitive("void") || throwing_type(context, &target.name()) {
        return;
    }
    if terminates_in_new_builder(context, Some(qualifier)) {
        return;
    }
    context.report_fixed("ProtoBuilderReturnValueIgnored", node, node.start_byte(), MESSAGE, &[]);
}

pub fn proto_builder_return_value_ignored(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => call(context, node),
        "method_reference" => reference(context, node),
        _ => {}
    }
}
