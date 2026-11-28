//! RobolectricShadowDirectlyOn: the two-argument `Shadow.directlyOn(object, Class).method(...)`.
use super::call_match::static_on_class;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::java_quote::quote;
use super::parts::arguments;
use super::positions::preferred;
use super::Context;
use crate::engine::source::parent;
use crate::java::types::model::Type;
use tree_sitter::Node;

/// `SuggestedFixes.qualifyType` of an erased type.
fn qualified(context: &Context, at: Node, kind: &Type, fix: &mut Fix) -> String {
    match kind {
        Type::Array(element) => format!("{}[]", qualified(context, at, element, fix)),
        Type::Class(name, _) => qualify_type(context, at, name, fix),
        other => other.name(),
    }
}

pub fn robolectric_shadow_directly_on(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !static_on_class(context, call, "org.robolectric.shadow.api.Shadow", &["directlyOn"]) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let method = &resolved.method;
    let first_is_type_parameter = matches!((method.generic_parameters.first(), method.type_parameters.first()), (Some(Type::Variable(found)), Some(declared)) if found == declared);
    if method.parameters.len() != 2 || !first_is_type_parameter || method.parameters[1] != Type::class("java.lang.Class") {
        return;
    }
    let Some(outer) = parent(call).filter(|up| up.kind() == "method_invocation" && up.child_by_field_name("object").is_some_and(|object| object.id() == call.id())) else { return };
    let Some(called) = context.resolver.resolve_call(outer) else { return };
    let Some(name) = outer.child_by_field_name("name") else { return };
    let mut fix = Fix::new();
    let mut replacement = format!(", \"{}\"", quote(context.text(name)));
    for (parameter, argument) in called.method.parameters.iter().zip(arguments(outer)) {
        let written = qualified(context, call, parameter, &mut fix);
        replacement.push_str(&format!(", ClassParameter.from({written}.class, {})", context.text(argument)));
    }
    let Some(last) = arguments(call).last().copied() else { return };
    let fix = fix.delete(call.end_byte(), outer.end_byte()).insert(last.end_byte(), replacement).with_imports();
    context.report_fixed("RobolectricShadowDirectlyOn", call, preferred(context, call), "Migrate off a deprecated overload of org.robolectric.shadow.api.Shadow#directlyOn", &[fix]);
}
