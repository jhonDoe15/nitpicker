//! DefaultPackage, EmptyTopLevelDeclaration, DeprecatedVariable, ClosingStandardOutputStreams and the two AssistedInject checks.
use super::Context;
use super::auto_value::generated;
use super::fixes::Fix;
use super::inject_checks::{INJECT, annotation_class, annotations_of, is_one_of};
use super::members::members;
use super::nodes::class_position;
use super::positions::preferred;
use crate::engine::source::{children, parent};
use crate::java::helpers::declarators;
use crate::java::types::expr::Receiver;
use tree_sitter::Node;

const TYPES: [&str; 5] = ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

pub fn default_package(context: &Context, root: Node) {
    let top = children(root);
    if top.iter().any(|part| part.kind() == "package_declaration") {
        return;
    }
    let types: Vec<Node> = top.iter().copied().filter(|part| TYPES.contains(&part.kind())).collect();
    if types.is_empty() {
        return;
    }
    if types.iter().any(|class| context.suppressed("DefaultPackage", *class)) || types.iter().any(|class| generated(context, *class)) {
        return;
    }
    if context.file.path.rsplit('/').next().is_some_and(|name| name.strip_suffix(".java") == Some("module-info")) {
        return;
    }
    let first = top.iter().find(|part| !part.kind().ends_with("comment")).map_or(root.end_byte(), |part| part.start_byte());
    context.report_always_fixed("DefaultPackage", first, "Java classes shouldn't use default package", &[]);
}

pub fn empty_top_level_declaration(context: &Context, root: Node) {
    if !children(root).into_iter().any(|part| TYPES.contains(&part.kind())) {
        return;
    }
    let stray: Vec<Node> = children(root).into_iter().filter(|part| part.kind() == ";").collect();
    let Some(first) = stray.first() else { return };
    let mut fix = Fix::new();
    for semicolon in &stray {
        fix = fix.delete(semicolon.start_byte(), semicolon.end_byte().max(semicolon.start_byte() + 1));
    }
    context.report_fixed("EmptyTopLevelDeclaration", *first, first.start_byte(), "Empty top-level type declarations should be omitted", &[fix]);
}

fn variable_deprecated(context: &Context, holder: Node, names: &[Node]) {
    report_deprecated(context, holder, &annotations_of(holder), names);
}

fn report_deprecated(context: &Context, holder: Node, annotations: &[Node], names: &[Node]) {
    if !annotations.iter().any(|annotation| annotation_class(context, *annotation).as_deref() == Some("java.lang.Deprecated")) {
        return;
    }
    let simple = annotations.iter().find(|annotation| {
        annotation.child_by_field_name("name").is_some_and(|name| context.text(name).rsplit('.').next() == Some("Deprecated"))
    });
    for name in names {
        let fixes: Vec<Fix> = simple.iter().map(|annotation| Fix::new().delete(annotation.start_byte(), annotation.end_byte())).collect();
        context.report_fixed("DeprecatedVariable", holder, name.start_byte(), "Applying the @Deprecated annotation to local variables or parameters has no effect", &fixes);
    }
}

fn annotated_binding(context: &Context, holder: Node, kind: Node, name: Node) {
    if kind.kind() != "annotated_type" {
        return;
    }
    let annotations: Vec<Node> = children(kind).into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).collect();
    report_deprecated(context, holder, &annotations, &[name]);
}

pub fn deprecated_variable(context: &Context, node: Node) {
    match node.kind() {
        "local_variable_declaration" => {
            let names: Vec<Node> = declarators(node).into_iter().filter_map(|declarator| declarator.child_by_field_name("name")).collect();
            variable_deprecated(context, node, &names);
        }
        "formal_parameter" | "spread_parameter" => {
            let in_record = parent(node).and_then(parent).is_some_and(|owner| owner.kind() == "record_declaration");
            if in_record {
                return;
            }
            let name = if node.kind() == "spread_parameter" {
                children(node).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|declarator| declarator.child_by_field_name("name"))
            } else {
                node.child_by_field_name("name")
            };
            variable_deprecated(context, node, name.as_slice());
        }
        "instanceof_expression" => {
            let (Some(name), Some(kind)) = (node.child_by_field_name("name"), node.child_by_field_name("right")) else { return };
            annotated_binding(context, node, kind, name);
        }
        "type_pattern" | "record_pattern_component" => {
            let named = children(node);
            if let (Some(kind), Some(name)) = (named.first().filter(|part| part.kind() == "annotated_type"), named.iter().rfind(|part| part.kind() == "identifier")) {
                annotated_binding(context, node, *kind, *name);
            }
        }
        "enhanced_for_statement" => {
            if let Some(name) = node.child_by_field_name("name") {
                variable_deprecated(context, node, &[name]);
            }
        }
        _ => {}
    }
}

fn is_standard_stream(context: &Context, access: Node) -> bool {
    let (Some(object), Some(field)) = (access.child_by_field_name("object"), access.child_by_field_name("field")) else { return false };
    matches!(context.text(field), "out" | "err") && matches!(context.resolver.receiver(object), Some(Receiver::Static(owner)) if owner == "java.lang.System")
}

fn scan_resources(context: &Context, node: Node) {
    if matches!(node.kind(), "try_with_resources_statement" | "try_statement") {
        return;
    }
    if node.kind() == "field_access" && is_standard_stream(context, node) {
        let message = "Don't use try-with-resources to manage standard output streams, closing the stream will cause subsequent output to standard output or standard error to be lost";
        context.report_fixed("ClosingStandardOutputStreams", node, preferred(context, node), message, &[]);
        return;
    }
    for part in children(node) {
        scan_resources(context, part);
    }
}

pub fn closing_standard_output_streams(context: &Context, node: Node) {
    if node.kind() == "try_with_resources_statement" {
        if let Some(resources) = node.child_by_field_name("resources") {
            for part in children(resources) {
                scan_resources(context, part);
            }
        }
    }
}

const ASSISTED_INJECT: &str = "com.google.inject.assistedinject.AssistedInject";

fn constructors<'t>(class: Node<'t>) -> Vec<Node<'t>> {
    let Some(body) = class.child_by_field_name("body") else { return Vec::new() };
    members(body).into_iter().filter(|member| matches!(member.kind(), "constructor_declaration" | "compact_constructor_declaration")).collect()
}

fn has_annotation_among(context: &Context, declaration: Node, names: &[&str]) -> bool {
    annotations_of(declaration).into_iter().any(|annotation| is_one_of(context, annotation, names))
}

pub fn assisted_inject_and_inject_on_constructors(context: &Context, class: Node) {
    if !matches!(class.kind(), "class_declaration" | "enum_declaration" | "record_declaration") {
        return;
    }
    let all = constructors(class);
    if all.iter().any(|ctor| has_annotation_among(context, *ctor, &INJECT)) && all.iter().any(|ctor| has_annotation_among(context, *ctor, &[ASSISTED_INJECT])) {
        let message = "@AssistedInject and @Inject should not be used on different constructors in the same class.";
        context.report_fixed("AssistedInjectAndInjectOnConstructors", class, class_position(class), message, &[]);
    }
}

pub fn assisted_inject_and_inject_on_same_constructor(context: &Context, annotation: Node) {
    if !matches!(annotation.kind(), "annotation" | "marker_annotation") {
        return;
    }
    if !is_one_of(context, annotation, &INJECT) && !is_one_of(context, annotation, &[ASSISTED_INJECT]) {
        return;
    }
    let Some(constructor) = parent(annotation).and_then(parent).filter(|owner| matches!(owner.kind(), "constructor_declaration" | "compact_constructor_declaration")) else { return };
    if has_annotation_among(context, constructor, &INJECT) && has_annotation_among(context, constructor, &[ASSISTED_INJECT]) {
        let fix = Fix::new().delete(annotation.start_byte(), annotation.end_byte());
        let message = "@AssistedInject and @Inject cannot be used on the same constructor.";
        context.report_fixed("AssistedInjectAndInjectOnSameConstructor", annotation, annotation.start_byte(), message, &[fix]);
    }
}
