//! ArrayEquals, ArraysAsListPrimitiveArray and CollectionToArraySafeParameter: array arguments that are used the wrong way.
use super::Context;
use super::call_match::static_on_class;
use super::compat::castable;
use super::fixes::Fix;
use super::positions::{arguments, preferred};
use crate::java::types::model::{OBJECT, Type};
use crate::engine::source::{ancestor, children, named_children, parent};
use tree_sitter::Node;

fn is_array(context: &Context, node: Node) -> bool {
    matches!(context.resolver.type_of(node), Some(Type::Array(_)))
}

/// Whether the call is one of the recognised static equality methods with `(Object, Object)` parameters.
pub(super) fn static_equals(context: &Context, call: Node) -> bool {
    let known = [
        ("android.support.v4.util.ObjectsCompat", "equals"),
        ("androidx.v4.util.ObjectsCompat", "equals"),
        ("java.util.Objects", "equals"),
        ("com.google.common.base.Objects", "equal"),
    ];
    known.iter().any(|(owner, name)| static_on_class(context, call, owner, &[name])) && {
        let method = context.resolver.resolve_call(call).map(|resolved| resolved.method);
        method.is_some_and(|method| method.parameters.len() == 2 && method.parameters.iter().all(|kind| kind.name() == OBJECT) && method.returns == Type::Primitive("boolean"))
    }
}

pub fn array_equals(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return };
    if name != "equals" && name != "equal" {
        return;
    }
    let list = arguments(call);
    let (first, second) = match (call.child_by_field_name("object"), list.as_slice()) {
        (Some(receiver), [argument]) if name == "equals" && is_array(context, receiver) && is_array(context, *argument) => (receiver, *argument),
        (_, [left, right]) if is_array(context, *left) && is_array(context, *right) && static_equals(context, call) => (*left, *right),
        _ => return,
    };
    let text = format!("Arrays.equals({}, {})", context.text(first), context.text(second));
    let fix = Fix::replace(call.start_byte(), call.end_byte(), text).with_imports();
    context.report_fixed("ArrayEquals", call, preferred(context, call), "Reference equality used to compare arrays", &[fix]);
}

fn guava_utils(primitive: &str) -> Option<&'static str> {
    Some(match primitive {
        "boolean" => "Booleans",
        "byte" => "Bytes",
        "short" => "Shorts",
        "int" => "Ints",
        "long" => "Longs",
        "char" => "Chars",
        "float" => "Floats",
        "double" => "Doubles",
        _ => return None,
    })
}

pub fn arrays_as_list_primitive_array(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !static_on_class(context, call, "java.util.Arrays", &["asList"]) {
        return;
    }
    let [argument] = arguments(call)[..] else { return };
    let Some(Type::Array(element)) = context.resolver.type_of(argument) else { return };
    let Type::Primitive(primitive) = *element else { return };
    let Some(utils) = guava_utils(primitive) else { return };
    let Some(name) = call.child_by_field_name("name") else { return };
    let fix = Fix::replace(call.start_byte(), name.end_byte(), format!("{utils}.asList")).with_imports();
    let message = "Arrays.asList does not autobox primitive arrays, as one might expect.";
    context.report_fixed("ArraysAsListPrimitiveArray", call, preferred(context, call), message, &[fix]);
}

/// The bound of the type variable that a method parameter used as the receiver is declared with.
fn parameter_bound(context: &Context, call: Node, object: Node) -> Option<Type> {
    if object.kind() != "identifier" {
        return None;
    }
    let method = ancestor(call, &["method_declaration", "constructor_declaration"])?;
    let formals = method.child_by_field_name("parameters")?;
    let written = named_children(formals).into_iter().filter(|part| part.kind() == "formal_parameter").find_map(|part| {
        let name = part.child_by_field_name("name")?;
        (context.text(name) == context.text(object)).then(|| part.child_by_field_name("type"))?
    })?;
    variable_bound(context, call, context.text(written))
}

/// The first written bound of a type parameter declared on an enclosing method or class.
pub(super) fn variable_bound(context: &Context, usage: Node, name: &str) -> Option<Type> {
    let mut current = parent(usage);
    while let Some(node) = current {
        if let Some(list) = node.child_by_field_name("type_parameters") {
            for parameter in named_children(list).into_iter().filter(|part| part.kind() == "type_parameter") {
                let declared = children(parameter).into_iter().find(|part| part.kind() == "type_identifier" || part.kind() == "identifier");
                if declared.is_some_and(|declared| context.text(declared) == name) {
                    let bound = children(parameter).into_iter().find(|part| part.kind() == "type_bound")?;
                    return context.resolver.type_node(*named_children(bound).first()?);
                }
            }
        }
        current = parent(node);
    }
    None
}

/// A receiver that is a type variable has no resolved call: its first bound stands in.
fn bounded_receiver(context: &Context, call: Node, variable: &Type) {
    let Some(object) = call.child_by_field_name("object") else { return };
    let Some(bound) = parameter_bound(context, call, object) else { return };
    report_unsafe(context, call, &bound, variable);
}

fn report_unsafe(context: &Context, call: Node, receiver: &Type, variable: &Type) {
    if !context.resolver.index.is_subtype(&receiver.name(), "java.util.Collection") {
        return;
    }
    let Some(arguments) = context.resolver.index.arguments_as(receiver, "java.util.Collection") else { return };
    let [element] = arguments.as_slice() else { return };
    if !castable(context, &variable.erased(), &element.erased()) {
        let message = "The type of the array parameter of Collection.toArray needs to be compatible with the array type";
        context.report_fixed("CollectionToArraySafeParameter", call, preferred(context, call), message, &[]);
    }
}

pub fn collection_to_array_safe_parameter(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|name| context.text(name) != "toArray") {
        return;
    }
    let [argument] = arguments(call)[..] else { return };
    let Some(Type::Array(variable)) = context.resolver.type_of(argument) else { return };
    let Some(resolved) = context.resolver.resolve_call(call) else {
        bounded_receiver(context, call, &variable);
        return;
    };
    let method = &resolved.method;
    let bounded = call.child_by_field_name("object").and_then(|object| parameter_bound(context, call, object));
    let receiver = bounded.unwrap_or_else(|| resolved.receiver.clone());
    let single = matches!(method.generic_parameters.as_slice(), [Type::Array(element)] if matches!(&**element, Type::Variable(name) if method.type_parameters.len() == 1 && *name == method.type_parameters[0]));
    if method.is_static || !single || !context.resolver.index.is_subtype(&receiver.name(), "java.util.Collection") {
        return;
    }
    let Some(arguments) = context.resolver.index.arguments_as(&receiver, "java.util.Collection") else { return };
    let [element] = arguments.as_slice() else { return };
    if !castable(context, &variable.erased(), &element.erased()) {
        let message = "The type of the array parameter of Collection.toArray needs to be compatible with the array type";
        context.report_fixed("CollectionToArraySafeParameter", call, preferred(context, call), message, &[]);
    }
}
