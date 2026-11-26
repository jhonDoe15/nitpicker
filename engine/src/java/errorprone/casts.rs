//! Checks on casts: FloatCast and UnsafeReflectiveConstructionCast.
use super::Context;
use super::call_match::{instance_on_exact_class, static_on_class};
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use crate::engine::source::{named_children, parent};
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
use tree_sitter::Node;

const FLOAT_CAST: &str = "Use parentheses to make the precedence explicit";
const UNSAFE_CAST: &str = "Prefer `asSubclass` instead of casting the result of `newInstance`, to detect classes of incorrect type before invoking their constructors. This way, if the class is of the incorrect type, it will throw an exception before invoking its constructor.";

fn primitive(kind: Option<Type>) -> Option<&'static str> {
    match kind? {
        Type::Primitive(name) => Some(name),
        _ => None,
    }
}

fn math_call(context: &Context, expression: Node, names: &[&str]) -> bool {
    static_on_class(context, expression, "java.lang.Math", names)
}

fn integral_arguments(context: &Context, pow: Node) -> bool {
    let arguments = pow.child_by_field_name("arguments").map(named_children).unwrap_or_default();
    arguments
        .into_iter()
        .filter(|argument| !argument.kind().ends_with("comment"))
        .filter_map(|argument| context.resolver.type_of(argument))
        .all(|kind| matches!(kind.unboxed_or_same(), Type::Primitive("int" | "long")))
}

pub fn float_cast(context: &Context, node: Node) {
    if node.kind() != "cast_expression" {
        return;
    }
    let Some(binary) = parent(node).filter(|holder| holder.kind() == "binary_expression") else { return };
    let multiply = binary.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "*");
    if binary.child_by_field_name("left") != Some(node) || !multiply {
        return;
    }
    let (Some(target), Some(value)) = (node.child_by_field_name("type"), node.child_by_field_name("value")) else { return };
    let cast = primitive(context.resolver.type_node(target));
    let operand = primitive(context.resolver.type_of(value));
    if !matches!(cast, Some("long" | "int" | "short" | "char" | "byte")) || !matches!(operand, Some("float" | "double")) {
        return;
    }
    if math_call(context, value, &["floor", "ceil", "signum", "rint"]) {
        return;
    }
    if math_call(context, value, &["pow"]) && integral_arguments(context, value) {
        return;
    }
    let mut enclosing = binary;
    while let Some(outer) = parent(enclosing).filter(|outer| outer.kind() == "binary_expression") {
        if outer.child_by_field_name("left") != Some(enclosing) {
            break;
        }
        enclosing = outer;
    }
    let first = Fix::new().insert(value.start_byte(), "(").insert(enclosing.end_byte(), ")");
    let second = Fix::new().insert(node.start_byte(), "(").insert(node.end_byte(), ")");
    context.report_fixed("FloatCast", node, node.start_byte(), FLOAT_CAST, &[first, second]);
}

pub fn unsafe_reflective_construction_cast(context: &Context, node: Node) {
    if node.kind() != "cast_expression" {
        return;
    }
    let (Some(target), Some(value)) = (node.child_by_field_name("type"), node.child_by_field_name("value")) else { return };
    let created = unwrap(value);
    if !instance_on_exact_class(context, created, "java.lang.reflect.Constructor", &["newInstance"]) {
        return;
    }
    let Some(constructor) = created.child_by_field_name("object") else { return };
    if !instance_on_exact_class(context, constructor, "java.lang.Class", &["getDeclaredConstructor", "getConstructor"]) {
        return;
    }
    let Some(class_for_name) = constructor.child_by_field_name("object") else { return };
    if !static_on_class(context, class_for_name, "java.lang.Class", &["forName"]) || !matches!(target.kind(), "type_identifier" | "scoped_type_identifier" | "generic_type") {
        return;
    }
    let Some(written) = context.resolver.type_node(target) else { return };
    let Type::Class(..) = written else { return };
    let erased = written.erased().name();
    if erased == "java.lang.Object" {
        return;
    }
    let mut fix = Fix::new();
    let source = qualify_type(context, node, &erased, &mut fix);
    fix = fix.insert(class_for_name.end_byte(), format!(".asSubclass({source}.class)"));
    if target.kind() != "generic_type" {
        fix = fix.and(node.start_byte(), value.start_byte(), "");
    }
    let at = class_for_name.child_by_field_name("arguments").map_or(class_for_name.start_byte(), |list| list.start_byte());
    context.report_fixed("UnsafeReflectiveConstructionCast", class_for_name, at, UNSAFE_CAST, &[fix]);
}
