//! EqualsNull, HashtableContains, GetClassOnClass and UnnecessaryTypeArgument: calls that are used the wrong way.
use super::Context;
use super::fixes::Fix;
use super::positions::{arguments, preferred};
use super::testcode::{is_junit_test_code, is_testng_test_code};
use crate::engine::source::{ancestor, parent};
use crate::java::types::model::{OBJECT, Type};
use tree_sitter::Node;

const EQUALS_NULL: &str = "The contract of Object.equals() states that for any non-null reference value x, x.equals(null) should return false. If x is null, a NullPointerException is thrown. Consider replacing equals() with the == operator.";
const ASSERT_OWNERS: [&str; 4] = ["com.google.common.truth.Truth", "com.google.common.truth.Truth8", "junit.framework.Assert", "org.junit.Assert"];

fn instance_equals(context: &Context, call: Node) -> bool {
    if call.child_by_field_name("name").is_none_or(|name| context.text(name) != "equals") {
        return false;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    let method = &resolved.method;
    !method.is_static && method.parameters.len() == 1 && method.parameters[0].name() == "java.lang.Object" && method.returns == Type::Primitive("boolean")
}

fn inside_assert(context: &Context, call: Node) -> bool {
    let class = ancestor(call, &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration"]);
    let name = class.and_then(|class| context.resolver.scope.names.get(&class.id()));
    if name.is_some_and(|name| context.resolver.index.is_subtype(name, "org.junit.Assert") || context.resolver.index.is_subtype(name, "junit.framework.Assert")) {
        return true;
    }
    let mut current = parent(call);
    while let Some(at) = current {
        if at.kind() == "method_invocation" {
            let owner = context.resolver.resolve_call(at).filter(|resolved| resolved.method.is_static).map(|resolved| resolved.receiver.name());
            if owner.is_some_and(|owner| ASSERT_OWNERS.contains(&owner.as_str()) || context.resolver.resolve_call(at).is_some_and(|resolved| ASSERT_OWNERS.contains(&resolved.declaring.as_str()))) {
                return true;
            }
        }
        current = parent(at);
    }
    false
}

pub fn equals_null(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let list = arguments(call);
    if list.len() != 1 || list[0].kind() != "null_literal" || !instance_equals(context, call) {
        return;
    }
    if is_junit_test_code(context, call) || is_testng_test_code(context, call) || inside_assert(context, call) {
        return;
    }
    let Some(receiver) = call.child_by_field_name("object") else { return };
    let outer = parent(call).filter(|up| up.kind() == "unary_expression" && up.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "!"));
    let operator = if outer.is_some() { "!=" } else { "==" };
    let fixed = outer.unwrap_or(call);
    let fix = Fix::replace(fixed.start_byte(), fixed.end_byte(), format!("{} {operator} null", context.text(receiver)));
    context.report_fixed("EqualsNull", fixed, preferred(context, fixed), EQUALS_NULL, &[fix]);
}

pub fn get_class_on_class(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|name| context.text(name) != "getClass") || !arguments(call).is_empty() {
        return;
    }
    let Some(receiver) = call.child_by_field_name("object") else { return };
    if !context.resolver.matches_sig(call, "java.lang.Class#getClass()") || context.resolver.resolve_call(call).is_none_or(|resolved| resolved.receiver.erased().name() != "java.lang.Class") {
        return;
    }
    let (start, end) = (call.start_byte(), call.end_byte());
    let message = "Calling getClass() on an object of type Class returns the Class object for java.lang.Class; you probably meant to operate on the object directly";
    context.report_fixed("GetClassOnClass", call, preferred(context, call), message, &[Fix::replace(start, end, context.text(receiver)), Fix::replace(start, end, "Class.class")]);
}

fn replace_name(context: &Context, call: Node, new_name: &str) -> Fix {
    let (start, end) = match call.child_by_field_name("object") {
        Some(object) => (object.start_byte(), call.child_by_field_name("name").map_or(call.start_byte(), |name| name.end_byte())),
        None => call.child_by_field_name("name").map_or((call.start_byte(), call.start_byte()), |name| (name.start_byte(), name.end_byte())),
    };
    let source = &context.file.text[start..end];
    let at = source.rfind("contains").unwrap_or_default();
    Fix::replace(start, end, format!("{}{new_name}{}", &source[..at], &source[at + "contains".len()..]))
}

fn upper_bound(kind: &Type) -> Type {
    kind.clone()
}

pub fn hashtable_contains(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|name| context.text(name) != "contains") {
        return;
    }
    if !(context.resolver.matches_sig(call, "java.util.Hashtable#contains(_*)") || context.resolver.matches_sig(call, "java.util.concurrent.ConcurrentHashMap#contains(_*)")) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let mut message = "contains() is a legacy method that is equivalent to containsValue()".to_string();
    let mut fixes = Vec::new();
    let implicit = call.child_by_field_name("object").is_none();
    let types = match &resolved.receiver {
        _ if implicit => Some((Type::class(OBJECT), Type::class(OBJECT))),
        Type::Class(_, arguments) if arguments.len() == 2 => Some((upper_bound(&arguments[0]), upper_bound(&arguments[1]))),
        _ => None,
    };
    let argument = arguments(call).first().and_then(|argument| context.resolver.type_of(*argument));
    match (types, argument) {
        (Some((key, value)), Some(argument)) => {
            let value_shaped = context.resolver.assignable(&argument, &value, false);
            let key_shaped = context.resolver.assignable(&argument, &key, false);
            let key_text = super::futures::printed(&key);
            if key_shaped && !value_shaped {
                fixes.push(replace_name(context, call, "containsKey"));
                message = format!("contains() is a legacy method that is equivalent to containsValue(), but the argument type '{key_text}' looks like a key");
            } else if value_shaped && !key_shaped {
                fixes.push(replace_name(context, call, "containsValue"));
            } else {
                fixes.push(replace_name(context, call, "containsValue"));
                fixes.push(replace_name(context, call, "containsKey"));
                message = format!("contains() is a legacy method that is equivalent to containsValue(), but the argument type '{key_text}' could be a key or a value");
            }
        }
        _ => fixes.push(replace_name(context, call, "containsValue")),
    }
    context.report_fixed("HashtableContains", call, preferred(context, call), &message, &fixes);
}

pub fn unnecessary_type_argument(context: &Context, node: Node) {
    if !matches!(node.kind(), "method_invocation" | "object_creation_expression") {
        return;
    }
    let Some(written) = node.child_by_field_name("type_arguments").filter(|list| list.named_child_count() > 0) else { return };
    let actual = crate::engine::source::named_children(written).iter().filter(|part| !part.kind().ends_with("comment")).count();
    let (expected, generic_super) = if node.kind() == "method_invocation" {
        let Some(resolved) = context.resolver.resolve_call(node) else { return };
        let index = context.resolver.index;
        let Some(origin) = index.get(&resolved.declaring) else { return };
        let supers = super::hierarchy::super_methods(index, origin, &resolved.method);
        (resolved.method.type_parameters.len(), supers.iter().any(|(_, above)| !above.type_parameters.is_empty()))
    } else {
        return;
    };
    if actual <= expected || generic_super {
        return;
    }
    let fix = Fix::replace(written.start_byte(), written.end_byte(), "");
    context.report_fixed("UnnecessaryTypeArgument", node, preferred(context, node), "Non-generic methods should not be invoked with type arguments", &[fix]);
}
