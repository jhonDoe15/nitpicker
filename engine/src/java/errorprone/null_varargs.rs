//! NullNeedsCastForVarargs: a bare `null` passed as the whole varargs array.
use super::fixes::Fix;
use super::owners::{is_descendant, receiver_name};
use super::parts::arguments;
use super::shape::qualify_type;
use super::Context;
use crate::java::types::model::Type;
use tree_sitter::Node;

const SUBJECT: &str = "com.google.common.truth.Subject";
const CORRESPONDENCE: &str = "com.google.common.truth.IterableSubject.UsingCorrespondence";

enum Place {
    Object(usize),
    Generic(usize),
}

fn object_array() -> Type {
    Type::Array(Box::new(Type::class("java.lang.Object")))
}

fn static_named(context: &Context, call: Node, classes: &[&str], names: &[&str], parameters: Option<&[Type]>, found: &[Type]) -> bool {
    let name = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    names.contains(&name)
        && parameters.is_none_or(|wanted| wanted == found)
        && receiver_name(context, call, true).is_some_and(|owner| classes.contains(&owner.as_str()))
}

fn place(context: &Context, call: Node) -> Option<Place> {
    let resolved = context.resolver.resolve_call(call)?;
    let name = context.text(call.child_by_field_name("name")?);
    let found = &resolved.method.parameters;
    let objects = Type::class("java.lang.Object");
    let array = [object_array()];
    if !resolved.method.is_static {
        let owner = receiver_name(context, call, false)?;
        let below = |class: &str| is_descendant(context, &owner, &[class]);
        if below(SUBJECT) && name == "containsExactly" && found == &array {
            return Some(Place::Object(0));
        }
        if below("com.google.common.reflect.Invokable") && name == "invoke" && found == &[objects.clone(), object_array()] {
            return Some(Place::Object(1));
        }
        if below(SUBJECT) && matches!(name, "containsAnyOf" | "containsAtLeast" | "containsNoneOf" | "isAnyOf" | "isNoneOf") && found == &[objects.clone(), objects, object_array()] {
            return Some(Place::Object(2));
        }
        if below(CORRESPONDENCE) && name == "containsExactly" {
            return Some(Place::Generic(0));
        }
        if below(CORRESPONDENCE) && matches!(name, "containsAnyOf" | "containsAtLeast" | "containsNoneOf") {
            return Some(Place::Generic(2));
        }
        return None;
    }
    let one = Some(&array[..]);
    let hit = static_named(context, call, &["com.google.common.collect.AndroidAccessToCompactDataStructures"], &["newCompactHashSet", "newCompactLinkedHashSet"], one, found)
        || static_named(context, call, &["com.google.common.collect.CompactHashSet", "com.google.common.collect.CompactLinkedHashSet"], &["create"], one, found)
        || static_named(context, call, &["com.google.common.collect.Iterables", "com.google.common.collect.Iterators"], &["cycle", "forArray"], one, found)
        || static_named(context, call, &["com.google.common.collect.Lists"], &["newArrayList", "newLinkedList"], one, found)
        || static_named(context, call, &["com.google.common.collect.Sets"], &["newHashSet", "newLinkedHashSet"], one, found)
        || static_named(context, call, &["java.util.Arrays"], &["asList"], None, found)
        || static_named(context, call, &["java.util.stream.Stream"], &["of"], one, found);
    hit.then_some(Place::Generic(0))
}

fn is_cast_of_null_to_array(context: &Context, arg: Node) -> Option<Type> {
    if arg.kind() != "cast_expression" || arg.child_by_field_name("value")?.kind() != "null_literal" {
        return None;
    }
    match context.resolver.type_node(arg.child_by_field_name("type")?)? {
        array @ Type::Array(_) => Some(array),
        _ => None,
    }
}

fn subtype(context: &Context, sub: &Type, sup: &Type) -> bool {
    let index = context.resolver.index;
    match (sub, sup) {
        (Type::Primitive(a), Type::Primitive(b)) => a == b,
        (Type::Array(a), Type::Array(b)) => subtype(context, a, b),
        (Type::Array(_), Type::Class(name, _)) => matches!(name.as_str(), "java.lang.Object" | "java.lang.Cloneable" | "java.io.Serializable"),
        (Type::Class(a, args), Type::Class(b, wanted)) => {
            index.is_subtype(a, b) && (wanted.is_empty() || args.is_empty() || index.arguments_as(sub, b).is_none_or(|given| given == *wanted))
        }
        _ => false,
    }
}

fn written(context: &Context, at: Node, kind: &Type) -> String {
    match kind {
        Type::Class(name, args) if args.is_empty() => qualify_type(context, at, name),
        Type::Class(name, args) => {
            let shown: Vec<String> = args.iter().map(|arg| written(context, at, arg)).collect();
            format!("{}<{}>", qualify_type(context, at, name), shown.join(", "))
        }
        Type::Array(element) => format!("{}[]", written(context, at, element)),
        Type::Variable(name) => name.clone(),
        Type::Wildcard => "?".to_string(),
        other => other.name(),
    }
}

/// What the type the call is expected to give says about the method's own type variables: javac takes them from there first.
fn from_target(context: &Context, call: Node, resolved: &crate::java::types::expr::Call, map: &mut std::collections::HashMap<String, Type>) {
    let Some(Type::Class(wanted, given)) = context.resolver.expected(call) else { return };
    let Some(shown) = context.resolver.index.arguments_as(&resolved.method.generic_returns, &wanted) else { return };
    if shown.len() != given.len() {
        return;
    }
    for (own, target) in shown.iter().zip(&given) {
        if let (Type::Variable(name), Type::Class(..) | Type::Array(_)) = (own, target) {
            if resolved.method.type_parameters.contains(name) {
                map.insert(name.clone(), target.clone());
            }
        }
    }
}

pub fn null_needs_cast_for_varargs(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none() {
        return;
    }
    let args = arguments(node);
    let Some(last) = args.last().copied() else { return };
    let message = "This call passes a null *array*, so it always produces NullPointerException. To pass a null *element*, cast to the element type.";
    let Some(place) = place(context, node) else { return };
    let (Place::Object(start) | Place::Generic(start)) = place;
    if args.len() != start + 1 {
        return;
    }
    let replacement = match place {
        Place::Object(_) => {
            if last.kind() != "null_literal" && is_cast_of_null_to_array(context, last).is_none() {
                return;
            }
            "(Object) null".to_string()
        }
        Place::Generic(_) => {
            let Some(resolved) = context.resolver.resolve_call(node) else { return };
            let mut map = context.resolver.call_map(&resolved, node, true);
            from_target(context, node, &resolved, &mut map);
            let Some(Type::Array(element)) = resolved.method.generic_parameters.last().map(|last| last.substitute(&map)) else { return };
            if last.kind() != "null_literal" && !is_cast_of_null_to_array(context, last).is_some_and(|cast| matches!(cast, Type::Array(component) if subtype(context, &component, &element))) {
                return;
            }
            format!("({}) null", written(context, node, &element))
        }
    };
    let fix = Fix::replace(last.start_byte(), last.end_byte(), replacement);
    context.report_fixed("NullNeedsCastForVarargs", last, last.start_byte(), message, &[fix]);
}
