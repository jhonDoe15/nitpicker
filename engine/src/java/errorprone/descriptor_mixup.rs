//! MixedDescriptors: a field number of one proto passed to the `Descriptor` of another.
use super::Context;
use super::call_match::static_on_class;
use super::positions::{arguments, preferred};
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE_TYPE: &str = "com.google.protobuf.Message";

/// The class that declares the field a name or a field access stands for.
fn field_owner(context: &Context, argument: Node) -> Option<String> {
    let (owner, name) = match argument.kind() {
        "identifier" => match context.resolver.binding(argument, context.text(argument))? {
            Binding::Field(_, info, field) => return Some(info.name.clone()).filter(|_| field.name == context.text(argument)),
            Binding::Local(_) => return None,
        },
        "field_access" => {
            let object = argument.child_by_field_name("object")?;
            let owner = match context.resolver.receiver(object)? {
                Receiver::Value(kind) => kind.erased().name(),
                Receiver::Static(owner) => owner,
            };
            (owner, context.text(argument.child_by_field_name("field")?).to_string())
        }
        _ => return None,
    };
    context.resolver.index.field(&owner, &name).map(|(info, _)| info.name.clone())
}

fn proto_type(context: &Context, owner: Option<String>) -> Option<String> {
    owner.filter(|class| context.resolver.index.is_subtype(class, MESSAGE_TYPE))
}

fn considered(context: &Context, class: &str) -> bool {
    let package = context.resolver.index.get(class).map(|info| info.package.clone()).unwrap_or_default();
    !(package.contains(".proto1api") || package.contains(".proto2api"))
}

pub fn mixed_descriptors(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|name| context.text(name) != "findFieldByNumber") {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let Some(receiver) = call.child_by_field_name("object") else { return };
    let receiver_owner = if resolved.method.is_static { None } else { Some(resolved.receiver.erased().name()) };
    if !receiver_owner.is_some_and(|owner| context.resolver.index.is_subtype(&owner, "com.google.protobuf.Descriptors.Descriptor")) {
        return;
    }
    if receiver.kind() != "method_invocation" || !context.resolver.resolve_call(receiver).is_some_and(|inner| inner.method.is_static && inner.method.name == "getDescriptor") {
        return;
    }
    let qualifier = receiver.child_by_field_name("object");
    let on_message = match qualifier {
        Some(object) => matches!(context.resolver.receiver(object), Some(Receiver::Static(owner)) if context.resolver.index.is_subtype(&owner, MESSAGE_TYPE)) || context.resolver.type_of(object).is_some_and(|kind| matches!(kind, Type::Class(name, _) if context.resolver.index.is_subtype(&name, MESSAGE_TYPE))),
        None => static_on_class(context, receiver, &context.resolver.resolve_call(receiver).map(|inner| inner.declaring).unwrap_or_default(), &["getDescriptor"]),
    };
    if !on_message {
        return;
    }
    let list = arguments(call);
    let [argument] = list.as_slice() else { return };
    let argument = *argument;
    let simple = match argument.kind() {
        "identifier" => context.text(argument).to_string(),
        "field_access" => argument.child_by_field_name("field").map(|name| context.text(name).to_string()).unwrap_or_default(),
        _ => return,
    };
    if !simple.ends_with("_FIELD_NUMBER") {
        return;
    }
    let from_argument = proto_type(context, field_owner(context, argument)).filter(|class| considered(context, class));
    let inner = context.resolver.resolve_call(receiver).map(|inner| inner.declaring);
    let from_receiver = proto_type(context, inner).filter(|class| considered(context, class));
    if let (Some(a), Some(b)) = (from_argument, from_receiver) {
        if a != b {
            context.report_fixed("MixedDescriptors", call, preferred(context, call), "The field number passed into #findFieldByNumber belongs to a different proto to the Descriptor.", &[]);
        }
    }
}
