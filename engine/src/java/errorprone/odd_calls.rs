//! FuzzyEqualsShouldNotBeUsedInEqualsMethod, GetClassOnAnnotation, IndexOfChar, InexactVarargsConditional and
//! IdentityHashMapBoxing: calls that are used the wrong way.
use super::Context;
use super::equals_methods::equals_declaration;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::positions::{arguments, preferred};
use crate::engine::source::{named_children, parent};
use crate::java::types::model::{OBJECT, Type};
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

fn name_of<'f>(context: &'f Context, call: Node) -> &'f str {
    call.child_by_field_name("name").map_or("", |name| context.text(name))
}

/// The class `ASTHelpers.getReceiverType` gives for a call: the type of the receiver, or the class that declares the method.
/// A method of `Object` called on an interface is seen as the interface's own.
pub fn receiver_class(context: &Context, call: Node) -> Option<String> {
    let resolved = context.resolver.resolve_call(call)?;
    match call.child_by_field_name("object").filter(|object| object.kind() != "super") {
        Some(_) => Some(resolved.receiver.name()),
        None if resolved.declaring == OBJECT => {
            let class = enclosing_type(context.file, context.resolver.scope, call)?;
            let interface = context.resolver.index.get(&class).is_some_and(|info| info.is_interface);
            Some(if interface { class } else { resolved.declaring })
        }
        None => Some(resolved.declaring),
    }
}

fn enclosing_method(node: Node) -> Option<Node> {
    let mut current = parent(node);
    while let Some(at) = current {
        if matches!(at.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration") {
            return Some(at);
        }
        current = parent(at);
    }
    None
}

pub fn fuzzy_equals_in_equals(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || name_of(context, call) != "fuzzyEquals" {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if !resolved.method.is_static || receiver_class(context, call).as_deref() != Some("com.google.common.math.DoubleMath") {
        return;
    }
    if enclosing_method(call).is_some_and(|method| equals_declaration(context, method)) {
        let message = "DoubleMath.fuzzyEquals should never be used in an Object.equals() method";
        context.report_fixed("FuzzyEqualsShouldNotBeUsedInEqualsMethod", call, preferred(context, call), message, &[]);
    }
}

pub fn get_class_on_annotation(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || name_of(context, call) != "getClass" || !arguments(call).is_empty() {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if resolved.method.is_static || !resolved.method.parameters.is_empty() {
        return;
    }
    let Some(receiver) = receiver_class(context, call) else { return };
    if !context.resolver.index.is_subtype(&receiver, "java.lang.annotation.Annotation") {
        return;
    }
    let Some(name) = call.child_by_field_name("name") else { return };
    let fix = Fix::replace(name.start_byte(), name.end_byte(), "annotationType");
    context.report_fixed("GetClassOnAnnotation", call, preferred(context, call), "Calling getClass() on an annotation may return a proxy class", &[fix]);
}

fn unboxed(kind: Option<Type>) -> Option<Type> {
    kind.map(Type::unboxed_or_same)
}

pub fn index_of_char(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !matches!(name_of(context, call), "indexOf" | "lastIndexOf") {
        return;
    }
    let list = arguments(call);
    if list.len() != 2 || receiver_class(context, call).as_deref() != Some("java.lang.String") {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if resolved.method.is_static || resolved.method.parameters != [Type::Primitive("int"), Type::Primitive("int")] {
        return;
    }
    let first = unboxed(context.resolver.type_of(list[0]));
    let second = unboxed(context.resolver.type_of(list[1]));
    if first != Some(Type::Primitive("int")) || second != Some(Type::Primitive("char")) {
        return;
    }
    let fix = Fix::replace(list[0].start_byte(), list[0].end_byte(), context.text(list[1])).and(list[1].start_byte(), list[1].end_byte(), context.text(list[0]));
    let message = "The first argument to indexOf is a Unicode code point, and the second is the index to start the search from";
    context.report_fixed("IndexOfChar", call, preferred(context, call), message, &[fix]);
}

/// A type the way `SuggestedFixes.qualifyType` writes it, adding imports to the fix.
fn qualified(context: &Context, at: Node, kind: &Type, fix: &mut Fix) -> String {
    match kind {
        Type::Class(name, given) => {
            let base = qualify_type(context, at, name, fix);
            if given.is_empty() {
                base
            } else {
                format!("{base}<{}>", given.iter().map(|part| qualified(context, at, part, fix)).collect::<Vec<_>>().join(", "))
            }
        }
        Type::Array(element) => format!("{}[]", qualified(context, at, element, fix)),
        other => super::futures::printed(other),
    }
}

pub fn inexact_varargs_conditional(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let list = arguments(call);
    let Some(last) = list.last().filter(|last| last.kind() == "ternary_expression") else { return };
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let method = &resolved.method;
    if !method.varargs || list.len() != method.generic_parameters.len() {
        return;
    }
    let is_array = |node: Node| matches!(context.resolver.type_of(node), Some(Type::Array(_)));
    if is_array(*last) {
        return;
    }
    let (Some(when_true), Some(when_false)) = (last.child_by_field_name("consequence"), last.child_by_field_name("alternative")) else { return };
    let true_array = is_array(when_true);
    if true_array == is_array(when_false) {
        return;
    }
    let Some(Type::Array(element)) = method.generic_parameters.last() else { return };
    let mut fix = Fix::new();
    let written = qualified(context, call, element, &mut fix);
    let target = if true_array { when_false } else { when_true };
    let fix = fix.insert(target.start_byte(), format!("new {written}[] {{")).insert(target.end_byte(), "}");
    let message = "Conditional expression in varargs call contains array and non-array arguments";
    context.report_fixed("InexactVarargsConditional", call, preferred(context, call), message, &[fix]);
}

const BOXED_KEYS: [&str; 4] = ["java.lang.Integer", "java.lang.Long", "java.lang.Double", "java.lang.Float"];

fn identity_map_arguments(context: &Context, node: Node) -> Option<Vec<Type>> {
    match context.resolver.type_of(node)? {
        Type::Class(_, given) => Some(given),
        _ => None,
    }
}

pub fn identity_hash_map_boxing(context: &Context, node: Node) {
    let matched = match node.kind() {
        "object_creation_expression" => {
            node.child_by_field_name("type").is_some_and(|written| context.text(written).contains("IdentityHashMap"))
                && node.child_by_field_name("object").is_none()
                && !named_children(node).iter().any(|part| part.kind() == "class_body")
                && context.resolver.resolve_constructor(node).is_some_and(|resolved| resolved.receiver.erased().name() == "java.util.IdentityHashMap")
        }
        "method_invocation" => {
            name_of(context, node) == "newIdentityHashMap"
                && context.resolver.resolve_call(node).is_some_and(|resolved| resolved.method.is_static && resolved.declaring == "com.google.common.collect.Maps")
                && receiver_class(context, node).as_deref() == Some("com.google.common.collect.Maps")
        }
        _ => false,
    };
    if !matched {
        return;
    }
    let Some(given) = identity_map_arguments(context, node) else { return };
    if given.len() != 2 || !matches!(&given[0], Type::Class(name, _) if BOXED_KEYS.contains(&name.as_str())) {
        return;
    }
    let message = "Using IdentityHashMap with a boxed type as the key is risky since boxing may produce distinct instances";
    context.report_fixed("IdentityHashMapBoxing", node, preferred(context, node), message, &[]);
}
