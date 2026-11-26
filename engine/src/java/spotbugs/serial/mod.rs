//! Serializable classes: SE_NO_SERIALVERSIONID (a class that shows it cares about its serialized form, by a
//! `transient` field, declares no `serialVersionUID`) and SE_BAD_FIELD (an instance field whose type cannot be
//! serialized). How likely a field's type is to be serializable depends on the classes the whole run knows, so
//! SE_BAD_FIELD findings wait for `settle`.
mod settle;

use super::classes::Shape;
use super::{Context, names, observed, place};
use crate::engine::finding::Finding;
use crate::engine::source::{children, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
pub use settle::Serial;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &["SE_BAD_FIELD", "SE_NO_SERIALVERSIONID"];
const SERIALIZABLE: &str = "java.io.Serializable";
const CONTAINERS: &[&str] = &["java.util.Collection", "java.util.Map"];

/// A field that SE_BAD_FIELD reports unless the run knows serializable classes for each type it may hold.
pub struct Pending {
    pub finding: Finding,
    /// The classes whose values the field holds: its own class, the elements of arrays and of collections.
    pub held: Vec<String>,
    /// The class implements `Serializable` itself, writes or reads its serialized form, or has a `transient` field.
    pub committed: bool,
    pub versioned: bool,
    pub throwable: bool,
    /// A member, local or anonymous class that keeps its outer instance.
    pub inner: bool,
}

fn fields<'s, 't>(shape: &'s Shape<'t>) -> impl Iterator<Item = (Node<'t>, Node<'t>)> + 's {
    let declared = shape.members.iter().filter(|member| member.kind() == "field_declaration");
    declared.flat_map(|member| declarators(*member).into_iter().map(move |declarator| (*member, declarator)))
}

fn named(context: &Context, declarator: Node, name: &str) -> bool {
    declarator.child_by_field_name("name").is_some_and(|written| context.text(written) == name)
}

fn method_named(context: &Context, shape: &Shape, name: &str, parameters: usize) -> bool {
    shape.members.iter().any(|member| {
        member.kind() == "method_declaration"
            && member.child_by_field_name("name").is_some_and(|written| context.text(written) == name)
            && member.child_by_field_name("parameters").is_some_and(|list| list.named_child_count() == parameters)
    })
}

/// A static final `serialVersionUID` of a primitive type.
fn versioned(context: &Context, shape: &Shape) -> bool {
    fields(shape).any(|(member, declarator)| {
        let primitive = member.child_by_field_name("type").is_some_and(|kind| matches!(kind.kind(), "integral_type" | "floating_point_type" | "boolean_type"));
        named(context, declarator, "serialVersionUID") && has_modifier(member, "static") && has_modifier(member, "final") && primitive
    })
}

fn listed_directly(context: &Context, shape: &Shape) -> bool {
    if shape.class.kind() == "object_creation_expression" {
        let created = shape.class.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind));
        return created.is_some_and(|kind| kind.name() == SERIALIZABLE);
    }
    context.resolver.index.get(&shape.own).is_some_and(|info| info.interfaces.iter().any(|name| name == SERIALIZABLE))
}

pub fn check(context: &Context, shape: &Shape) {
    let index = context.resolver.index;
    let kind = shape.class.kind();
    let shaped = matches!(kind, "class_declaration" | "object_creation_expression" | "enum_constant") && !has_modifier(shape.class, "abstract");
    if !shaped || !context.wants(PATTERNS) || !index.is_subtype(&shape.own, SERIALIZABLE) || index.is_subtype(&shape.own, "java.io.Externalizable") {
        return;
    }
    let transient = fields(shape).any(|(member, _)| has_modifier(member, "transient"));
    let versioned = versioned(context, shape);
    let throwable = index.is_subtype(&shape.own, "java.lang.Throwable");
    let binary = names::binary(context, &shape.own);
    let named = kind == "class_declaration";
    if let Some(first) = shape.first_line.filter(|_| transient && !versioned && !throwable && named) {
        let message = format!("{binary} is Serializable; consider declaring a serialVersionUID");
        context.report_listed("SE_NO_SERIALVERSIONID", shape.class, first, message, place::class(context, &shape.own), 2, vec![binary.clone()]);
    }
    if !context.wants(&["SE_BAD_FIELD"]) {
        return;
    }
    let inner = inner(shape.class);
    let committed = transient
        || listed_directly(context, shape)
        || method_named(context, shape, "readObject", 1)
        || method_named(context, shape, "writeObject", 1)
        || method_named(context, shape, "readResolve", 0);
    for (member, declarator) in fields(shape) {
        if has_modifier(member, "static") || has_modifier(member, "transient") {
            continue;
        }
        let Some(name) = declarator.child_by_field_name("name").map(|name| context.text(name).to_string()) else { continue };
        let Some(held) = held_by(context, shape, member, &name) else { continue };
        let message = format!("Class {binary} defines non-transient non-serializable instance field {name}");
        let arguments = vec![binary.clone(), name.clone()];
        let Some(finding) = context.finding_listed("SE_BAD_FIELD", declarator, 0, message, place::member(context, &shape.own, &name), arguments) else { continue };
        context.serial.borrow_mut().push(Pending { finding, held, committed, versioned, throwable, inner });
    }
}

fn inner(class: Node) -> bool {
    if class.kind() == "enum_constant" {
        return false;
    }
    if class.kind() == "class_declaration" {
        match class.parent().map(|parent| parent.kind()) {
            Some("class_body" | "enum_body_declarations") => return !has_modifier(class, "static"),
            Some("program" | "interface_body" | "annotation_type_body") | None => return false,
            _ => {}
        }
    }
    let mut at = class.parent();
    while let Some(node) = at {
        match node.kind() {
            "static_initializer" | "enum_constant" | "interface_body" => return false,
            "method_declaration" | "field_declaration" => return !has_modifier(node, "static"),
            "constructor_declaration" | "compact_constructor_declaration" => return true,
            "block" if node.parent().is_some_and(|holder| holder.kind() == "class_body") => return true,
            _ => {}
        }
        at = node.parent();
    }
    true
}

/// The classes the field may hold, or nothing when it only ever holds `null` and cannot change. A field the class
/// only ever gives values of one class holds that class, whatever its declared type; `!` stands for an anonymous
/// class that cannot be serialized.
fn held_by(context: &Context, shape: &Shape, member: Node, name: &str) -> Option<Vec<String>> {
    let stores = observed::field_stores(context);
    let values: Vec<Node> = stores.get(&(shape.own.clone(), name.to_string())).into_iter().flatten().map(|value| unwrap(*value)).collect();
    let given: Vec<Node> = values.iter().copied().filter(|value| value.kind() != "null_literal").collect();
    if has_modifier(member, "final") && !values.is_empty() && given.is_empty() {
        return None;
    }
    let written = member.child_by_field_name("type")?;
    let stored: Vec<Option<String>> = given.iter().map(|value| stored_class(context, *value)).collect();
    let first = stored.first().cloned().flatten();
    let same = first.filter(|first| stored.iter().all(|class| class.as_ref() == Some(first)));
    let mut held = Vec::new();
    match same {
        Some(array) if array.starts_with('[') => {
            held_class(context, &array[1..], &mut held);
        }
        Some(class) => {
            let container = held_class(context, &class, &mut held);
            let arguments = children(written).into_iter().find(|part| part.kind() == "type_arguments");
            if let Some(arguments) = arguments.filter(|_| container) {
                arguments_of(context, arguments, &mut held);
            }
        }
        None => classes_of(context, written, &mut held),
    }
    Some(held)
}

fn stored_class(context: &Context, value: Node) -> Option<String> {
    let anonymous = value.kind() == "object_creation_expression" && children(value).iter().any(|part| part.kind() == "class_body");
    if anonymous {
        let created = value.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind))?;
        return Some(if context.resolver.index.is_subtype(&created.name(), SERIALIZABLE) { created.name() } else { "!".to_string() });
    }
    match context.resolver.type_of(value)? {
        Type::Class(name, _) => Some(name),
        Type::Array(element) => class_in(Some(*element)).map(|name| format!("[{name}")),
        _ => None,
    }
}

fn classes_of(context: &Context, written: Node, held: &mut Vec<String>) {
    match written.kind() {
        "array_type" => {
            if let Some(element) = written.child_by_field_name("element") {
                classes_of(context, element, held);
            }
        }
        "annotated_type" => {
            if let Some(inner) = crate::engine::source::named_children(written).pop() {
                classes_of(context, inner, held);
            }
        }
        _ => {
            if matches!(context.resolver.written(written, true), Some(Type::Variable(_))) {
                return;
            }
            let Some(Type::Class(name, _)) = context.resolver.type_node(written) else { return };
            let container = held_class(context, &name, held);
            let arguments = children(written).into_iter().find(|part| part.kind() == "type_arguments");
            if let Some(arguments) = arguments.filter(|_| container) {
                arguments_of(context, arguments, held);
            }
        }
    }
}

/// Holds the class unless it is a `Collection` or `Map` interface or a serializable one; says whether it is a
/// `Collection` or `Map`, whose type arguments count too.
fn held_class(context: &Context, name: &str, held: &mut Vec<String>) -> bool {
    let index = context.resolver.index;
    let container = CONTAINERS.iter().any(|container| index.is_subtype(name, container));
    let interface = index.get(name).is_some_and(|info| info.is_interface);
    if !(container && (interface || index.is_subtype(name, SERIALIZABLE))) {
        held.push(name.to_string());
    }
    container
}

fn arguments_of(context: &Context, arguments: Node, held: &mut Vec<String>) {
    for argument in crate::engine::source::named_children(arguments) {
        if argument.kind() != "wildcard" && !argument.kind().ends_with("comment") {
            classes_of(context, argument, held);
        }
    }
}

/// The classes a file's compiled form names, as SpotBugs comes to know them: those it only names (cast to, caught,
/// tested, named by a class literal or in the signature of a method or field) and those whose code it loads
/// (created, or holding a called method or a used static field), with their member classes. A local variable's
/// declared type is not among them.
pub fn referenced(context: &Context) -> (Vec<String>, Vec<String>) {
    let (mut named, mut loaded) = (Vec::new(), Vec::new());
    walk(context.file.tree.root_node(), |node| {
        let (written, load) = match node.kind() {
            "object_creation_expression" => (node.child_by_field_name("type"), true),
            "cast_expression" | "method_declaration" | "field_declaration" | "formal_parameter" => (node.child_by_field_name("type"), false),
            "instanceof_expression" => (node.child_by_field_name("right"), false),
            "class_literal" => (node.named_child(0), false),
            "spread_parameter" => (node.named_child(0).filter(|kind| kind.kind() != "modifiers").or_else(|| node.named_child(1)), false),
            "catch_type" => {
                named.extend(children(node).into_iter().filter_map(|kind| class_in(context.resolver.type_node(kind))));
                (None, false)
            }
            "method_invocation" | "field_access" => (node.child_by_field_name("object"), true),
            _ => (None, false),
        };
        let Some(written) = written else { return };
        let text = context.text(written);
        let kind = match written.kind() {
            "identifier" if context.resolver.binding(written, text).is_none() => {
                context.resolver.class_name(written, text).map(|name| Type::Class(name, Vec::new()))
            }
            "scoped_identifier" if context.resolver.class_name(written, text).is_some() => {
                context.resolver.class_name(written, text).map(|name| Type::Class(name, Vec::new()))
            }
            _ if load && node.kind() != "object_creation_expression" => context.resolver.type_of(written),
            _ => context.resolver.type_node(written),
        };
        let target = if load { &mut loaded } else { &mut named };
        target.extend(class_in(kind));
    });
    (named, loaded)
}

fn class_in(kind: Option<Type>) -> Option<String> {
    let mut kind = kind;
    while let Some(Type::Array(element)) = kind {
        kind = Some(*element);
    }
    match kind {
        Some(Type::Class(name, _)) => Some(name),
        _ => None,
    }
}
