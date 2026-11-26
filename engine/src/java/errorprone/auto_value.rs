//! ExtendsAutoValue: a class that extends or implements a class with an AutoValue family annotation.
use super::Context;
use super::nodes::class_position;
use crate::engine::source::{children, named_children};
use crate::java::types::model::Type;
use tree_sitter::Node;

/// The short name of an AutoValue family annotation, by its full name with `.` between a class and its member class.
fn auto_annotation(name: &str) -> Option<&'static str> {
    match name {
        "com.google.auto.value.AutoValue" => Some("AutoValue"),
        "com.google.auto.value.AutoValue.Builder" => Some("AutoValue.Builder"),
        "com.google.auto.value.AutoBuilder" => Some("AutoBuilder"),
        "com.google.auto.value.AutoOneOf" => Some("AutoOneOf"),
        _ => None,
    }
}

/// `@Generated` with a `value`, or without elements, as `ASTHelpers.getGeneratedBy` sees it.
pub(super) fn generated(context: &Context, class: Node) -> bool {
    let Some(holder) = crate::java::helpers::modifiers(class) else { return false };
    children(holder).into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).any(|annotation| {
        let named = annotation.child_by_field_name("name").is_some_and(|name| context.text(name).rsplit('.').next() == Some("Generated"));
        let squeezed: String = annotation.child_by_field_name("arguments").map(|arguments| context.text(arguments).split_whitespace().collect()).unwrap_or_default();
        named && squeezed != "({})" && squeezed != "(value={})"
    })
}

fn in_generated_code(context: &Context, class: Node) -> bool {
    let mut current = Some(class);
    while let Some(at) = current {
        if matches!(at.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration") && generated(context, at) {
            return true;
        }
        current = crate::engine::source::parent(at);
    }
    false
}

fn parents(class: Node) -> Vec<Node> {
    let mut found = Vec::new();
    if class.kind() == "object_creation_expression" {
        found.extend(class.child_by_field_name("type"));
        return found;
    }
    for clause in children(class).into_iter().filter(|part| matches!(part.kind(), "superclass" | "super_interfaces" | "extends_interfaces")) {
        for part in named_children(clause) {
            if part.kind() == "type_list" {
                found.extend(named_children(part));
            } else {
                found.push(part);
            }
        }
    }
    found
}

pub fn extends_auto_value(context: &Context, class: Node) {
    let anonymous = class.kind() == "object_creation_expression" && children(class).into_iter().any(|part| part.kind() == "class_body");
    if !anonymous && !matches!(class.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration") {
        return;
    }
    for parent in parents(class) {
        let Some(Type::Class(name, _)) = context.resolver.type_node(parent) else { continue };
        let Some(auto) = context.resolver.index.get(&name).and_then(|info| info.class_annotations.iter().find_map(|full| auto_annotation(full))) else { continue };
        if in_generated_code(context, class) {
            return;
        }
        let at = if anonymous { children(class).into_iter().find(|part| part.kind() == "class_body").map_or(class.start_byte(), |body| body.start_byte()) } else { class_position(class) };
        return context.report_fixed("ExtendsAutoValue", class, at, &format!("Do not extend an @{auto} class in non-generated code."), &[]);
    }
}
