//! RecordComponentAccessorAnnotationConflict: an annotation on a record component whose `@Target` is only `METHOD`
//! (or only `PARAMETER`) is dropped when the record declares the accessor (or a constructor) itself, unless that
//! declaration carries the annotation too.
use super::Context;
use super::fixes::Fix;
use super::javac_print::annotation_printed;
use crate::engine::source::children;
use crate::java::helpers::modifiers;
use crate::java::types::model::target;
use tree_sitter::Node;

fn annotations(declaration: Node) -> Vec<Node> {
    modifiers(declaration).map(children).unwrap_or_default().into_iter().filter(|part| matches!(part.kind(), "marker_annotation" | "annotation")).collect()
}

fn parameters(declaration: Node) -> Vec<Node> {
    declaration
        .child_by_field_name("parameters")
        .map(children)
        .unwrap_or_default()
        .into_iter()
        .filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter"))
        .collect()
}

fn name_of<'t>(context: &'t Context, declaration: Node) -> &'t str {
    let name = declaration.child_by_field_name("name").or_else(|| children(declaration).into_iter().rev().find(|part| part.kind() == "variable_declarator"));
    name.map_or("", |name| context.text(name.child_by_field_name("name").unwrap_or(name)))
}

fn annotation_class(context: &Context, at: Node, annotation: Node) -> Option<String> {
    let name = annotation.child_by_field_name("name")?;
    context.resolver.class_name(at, context.text(name)).filter(|class| context.resolver.index.has(class))
}

fn check(context: &Context, declaration: Node, only: &str, components: &[Node]) {
    let name = name_of(context, declaration);
    let Some(component) = components.iter().find(|component| name_of(context, **component) == name) else { return };
    let present: Vec<String> = annotations(declaration).into_iter().filter_map(|annotation| annotation_class(context, declaration, annotation)).collect();
    for annotation in annotations(*component) {
        let Some(class) = annotation_class(context, *component, annotation) else { continue };
        let targets = context.resolver.index.get(&class).and_then(|info| info.targets);
        if targets != Some(target::bit(only)) || present.contains(&class) {
            continue;
        }
        let printed = annotation_printed(context.file, annotation);
        let message = if only == "METHOD" {
            format!("Annotation {printed} on record component {name}() with @Target(METHOD) is ignored when an explicit accessor is present.")
        } else {
            format!("Annotation {printed} on record component {name} with @Target(PARAMETER) is ignored when an explicit constructor is present.")
        };
        let name_node = declaration.child_by_field_name("name").or_else(|| children(declaration).into_iter().rev().find(|part| part.kind() == "variable_declarator").and_then(|declarator| declarator.child_by_field_name("name")));
        let at = name_node.map_or(declaration.start_byte(), |name| name.start_byte());
        let fix = Fix::replace(declaration.start_byte(), declaration.start_byte(), printed);
        context.report_fixed("RecordComponentAccessorAnnotationConflict", declaration, at, &message, &[fix]);
    }
}

pub fn record_component_accessor_annotation_conflict(context: &Context, record: Node) {
    if record.kind() != "record_declaration" {
        return;
    }
    let components = parameters(record);
    let Some(body) = record.child_by_field_name("body") else { return };
    for member in children(body) {
        match member.kind() {
            "constructor_declaration" => {
                for parameter in parameters(member) {
                    check(context, parameter, "PARAMETER", &components);
                }
            }
            "method_declaration" if parameters(member).is_empty() => check(context, member, "METHOD", &components),
            _ => {}
        }
    }
}
