//! ObjectsHashCodePrimitive, LogicalAssignment, ArrayAsKeyOfSetOrMap and ComputeIfAbsentAmbiguousReference.
use super::fixes::Fix;
use super::inference::created_arguments;
use super::nodes::{position, token};
use super::Context;
use crate::engine::source::{children, named_children};
use crate::java::types::model::{OBJECT, Type};
use tree_sitter::Node;

fn arguments(call: Node) -> Vec<Node> {
    call.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn call_name<'a>(context: &'a Context, call: Node) -> &'a str {
    call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

fn boxed_simple(kind: &Type) -> Option<&'static str> {
    match kind {
        Type::Primitive("int") => Some("Integer"),
        Type::Primitive("long") => Some("Long"),
        Type::Primitive("short") => Some("Short"),
        Type::Primitive("byte") => Some("Byte"),
        Type::Primitive("char") => Some("Character"),
        Type::Primitive("double") => Some("Double"),
        Type::Primitive("float") => Some("Float"),
        Type::Primitive("boolean") => Some("Boolean"),
        _ => None,
    }
}

pub fn objects_hash_code_primitive(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || call_name(context, node) != "hashCode" {
        return;
    }
    let Some(call) = context.resolver.resolve_call(node) else { return };
    if !call.method.is_static || call.receiver.name() != "java.util.Objects" {
        return;
    }
    let Some(first) = arguments(node).first().copied() else { return };
    let Some(boxed) = context.resolver.type_of(first).as_ref().and_then(boxed_simple) else { return };
    let fix = Fix::new()
        .insert(node.start_byte(), format!("{boxed}.hashCode("))
        .and(node.start_byte(), node.end_byte(), context.text(first))
        .insert(node.end_byte(), ")");
    context.report_fixed("ObjectsHashCodePrimitive", node, position(node), "Objects.hashCode(Object o) should not be passed a primitive value", &[fix]);
}

fn checked_condition(statement: Node) -> Option<Node> {
    let condition = statement.child_by_field_name("condition")?;
    match statement.kind() {
        "for_statement" => Some(condition),
        _ => (condition.kind() == "parenthesized_expression").then(|| condition.named_child(0)).flatten(),
    }
}

const LOGICAL_ASSIGNMENT: &str = "Assignment where a boolean expression was expected; use == if this assignment wasn't expected or add parentheses for clarity.";

pub fn logical_assignment(context: &Context, node: Node) {
    if !matches!(node.kind(), "if_statement" | "while_statement" | "do_statement" | "for_statement") {
        return;
    }
    let Some(assign) = checked_condition(node).filter(|condition| condition.kind() == "assignment_expression") else { return };
    if assign.child_by_field_name("operator").is_none_or(|operator| context.text(operator) != "=") {
        return;
    }
    let (Some(left), Some(right)) = (assign.child_by_field_name("left"), assign.child_by_field_name("right")) else { return };
    let wrapped = Fix::new().insert(assign.start_byte(), "(").insert(assign.end_byte(), ")");
    let compared = Fix::replace(left.end_byte(), right.start_byte(), " == ");
    context.report_fixed("LogicalAssignment", assign, position(assign), LOGICAL_ASSIGNMENT, &[wrapped, compared]);
}

const ARRAY_KEY: &str = "Arrays do not override equals() or hashCode, so comparisons will be done on reference equality only. If neither deduplication nor lookup are needed, consider using a List instead. Otherwise, use IdentityHashMap/Set, a Map from a library that handles object arrays, or an Iterable/List of pairs.";

const CREATED: &[&str] =
    &["java.util.HashSet", "java.util.HashMap", "java.util.LinkedHashMap", "java.util.concurrent.ConcurrentHashMap"];

const FACTORIES: &[(&str, &str)] = &[
    ("com.google.common.collect.Sets", "newHashSet"),
    ("com.google.common.collect.HashMultiset", "create"),
    ("com.google.common.collect.LinkedHashMultiset", "create"),
    ("com.google.common.collect.Maps", "newHashMap"),
    ("com.google.common.collect.Maps", "newLinkedHashMap"),
    ("com.google.common.collect.HashBiMap", "create"),
    ("com.google.common.collect.HashMultimap", "create"),
    ("com.google.common.collect.LinkedHashMultimap", "create"),
    ("com.google.common.collect.ArrayListMultimap", "create"),
    ("com.google.common.collect.LinkedListMultimap", "create"),
];

fn first_is_array(arguments: &[Type]) -> bool {
    matches!(arguments.first(), Some(Type::Array(_)))
}

pub fn array_as_key_of_set_or_map(context: &Context, node: Node) {
    match node.kind() {
        "object_creation_expression" => {
            if token(node, "class_body").is_some() {
                return;
            }
            let Some(Type::Class(created, _)) = node.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)) else { return };
            if CREATED.contains(&created.as_str()) && created_arguments(context, node).is_some_and(|found| first_is_array(&found)) {
                context.report_fixed("ArrayAsKeyOfSetOrMap", node, position(node), ARRAY_KEY, &[]);
            }
        }
        "method_invocation" => {
            let name = call_name(context, node);
            if !FACTORIES.iter().any(|(_, method)| *method == name) {
                return;
            }
            let Some(call) = context.resolver.resolve_call(node) else { return };
            let owner = call.receiver.name();
            let listed = FACTORIES.iter().any(|(class, method)| *class == owner && *method == name);
            let no_parameters = owner != "com.google.common.collect.HashMultiset" || call.method.parameters.is_empty();
            if !call.method.is_static || !listed || !no_parameters {
                return;
            }
            if let Some(Type::Class(_, found)) = context.resolver.type_of(node) {
                if first_is_array(&found) {
                    context.report_fixed("ArrayAsKeyOfSetOrMap", node, position(node), ARRAY_KEY, &[]);
                }
            }
        }
        _ => {}
    }
}

fn constructors(context: &Context, class: &str) -> Option<Vec<Vec<String>>> {
    let info = context.resolver.index.get(class)?;
    let mut found: Vec<Vec<String>> = info.methods.iter().filter(|method| method.name == "<init>").map(|method| method.names.clone().into_iter().chain(std::iter::repeat_n(String::new(), method.parameters.len().saturating_sub(method.names.len()))).collect()).collect();
    if found.is_empty() && !info.is_interface {
        found.push(Vec::new());
    }
    Some(found)
}

pub fn compute_if_absent_ambiguous_reference(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || call_name(context, node) != "computeIfAbsent" {
        return;
    }
    let all = arguments(node);
    let [key, function] = all.as_slice() else { return };
    if function.kind() != "method_reference" || children(*function).last().is_none_or(|last| last.kind() != "new") {
        return;
    }
    let Some(call) = context.resolver.resolve_call(node) else { return };
    let owner = if node.child_by_field_name("object").is_some() { call.receiver.name() } else { call.declaring.clone() };
    let selected = call.method.parameters == [Type::class(OBJECT), Type::class("java.util.function.Function")];
    if call.method.is_static || !selected || !context.resolver.index.is_subtype(&owner, "java.util.Map") {
        return;
    }
    let Some(qualifier) = function.named_child(0).map(|part| if part.kind() == "generic_type" { part.named_child(0).unwrap_or(part) } else { part }) else { return };
    if !matches!(qualifier.kind(), "type_identifier" | "scoped_type_identifier" | "identifier" | "field_access" | "scoped_identifier") {
        return;
    }
    let text: String = context.text(qualifier).split_whitespace().collect();
    let Some(class) = context.resolver.class_name(qualifier, &text).filter(|name| context.resolver.index.has(name)) else { return };
    let Some(found) = constructors(context, &class) else { return };
    if found.iter().filter(|names| names.is_empty()).count() != 1 {
        return;
    }
    let single: Vec<&Vec<String>> = found.iter().filter(|names| names.len() == 1).collect();
    let Some(first) = single.first() else { return };
    if key.kind() == "identifier" && first[0] == context.text(*key) {
        return;
    }
    context.report_fixed("ComputeIfAbsentAmbiguousReference", *function, function.start_byte(), "computeIfAbsent passes the map key to the provided class's constructor", &[]);
}
