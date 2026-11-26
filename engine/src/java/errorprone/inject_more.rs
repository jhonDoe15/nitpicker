//! More checks on `@Inject` and scope annotations: JavaxInjectOnFinalField, InjectOnConstructorOfAbstractClass,
//! InjectedConstructorAnnotations, InjectScopeAnnotationOnInterfaceOrAbstractClass and InjectInvalidTargetingOnScopingAnnotation.
use super::fixes::Fix;
use super::inject_checks::{annotation_class, annotations_of};
use super::nodes::name_position;
use super::shape::is_class;
use super::Context;
use crate::engine::source::{named_children, parent};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::{flag, target};
use tree_sitter::Node;

const INJECT: [&str; 3] = ["com.google.inject.Inject", "javax.inject.Inject", "jakarta.inject.Inject"];
const SCOPES: [&str; 3] = ["com.google.inject.ScopeAnnotation", "javax.inject.Scope", "jakarta.inject.Scope"];
const COMPONENTS: [&str; 5] = ["dagger.Component", "dagger.Subcomponent", "dagger.producers.ProductionComponent", "dagger.producers.ProductionSubcomponent", "dagger.hilt.DefineComponent"];
const TARGET: &str = "java.lang.annotation.Target";

fn is_annotation(node: Node) -> bool {
    matches!(node.kind(), "annotation" | "marker_annotation")
}

fn is_one_of(context: &Context, annotation: Node, names: &[&str]) -> bool {
    annotation_class(context, annotation).is_some_and(|class| names.contains(&class.as_str()))
}

/// The declaration an annotation is written on: javac's `getParentPath().getParentPath()` of the annotation.
fn annotated<'t>(annotation: Node<'t>) -> Option<Node<'t>> {
    let holder = parent(annotation).filter(|holder| holder.kind() == "modifiers")?;
    parent(holder)
}

pub fn javax_inject_on_final_field(context: &Context, annotation: Node) {
    if !is_annotation(annotation) || !is_one_of(context, annotation, &["javax.inject.Inject"]) {
        return;
    }
    let Some(field) = annotated(annotation) else { return };
    let record_component = field.kind() == "formal_parameter" && parent(field).and_then(parent).is_some_and(|record| record.kind() == "record_declaration");
    let last = match field.kind() {
        "field_declaration" => has_modifier(field, "final"),
        "constant_declaration" => true,
        _ => record_component,
    };
    if last {
        let fix = Fix::new().delete(annotation.start_byte(), annotation.end_byte());
        let declared = if field.kind() == "formal_parameter" { 1 } else { declarators(field).len().max(1) };
        for _ in 0..declared {
            context.report_fixed("JavaxInjectOnFinalField", annotation, annotation.start_byte(), "@javax.inject.Inject cannot be put on a final field.", &[fix.clone()]);
        }
    }
}

pub fn inject_on_constructor_of_abstract_class(context: &Context, method: Node) {
    if method.kind() != "constructor_declaration" {
        return;
    }
    let Some(class) = parent(method).and_then(parent).filter(|class| is_class(*class)) else { return };
    if !has_modifier(class, "abstract") {
        return;
    }
    let Some(annotation) = annotations_of(method).into_iter().find(|annotation| is_one_of(context, *annotation, &INJECT)) else { return };
    let fix = Fix::new().delete(annotation.start_byte(), annotation.end_byte());
    let message = "Constructors on abstract classes are never directly @Inject'ed, only the constructors of their subclasses can be @Inject'ed.";
    context.report_fixed("InjectOnConstructorOfAbstractClass", annotation, annotation.start_byte(), message, &[fix]);
}

/// `@Inject(optional = true)` of Guice, whatever the order and the other elements.
fn optional_injection(context: &Context, annotation: Node) -> bool {
    let Some(arguments) = annotation.child_by_field_name("arguments") else { return false };
    named_children(arguments).into_iter().any(|pair| {
        pair.kind() == "element_value_pair"
            && pair.child_by_field_name("key").is_some_and(|key| context.text(key) == "optional")
            && pair.child_by_field_name("value").is_some_and(|value| value.kind() == "true")
    })
}

fn is_binding_annotation(context: &Context, annotation: Node) -> bool {
    annotation_class(context, annotation)
        .and_then(|class| context.resolver.index.get(&class))
        .is_some_and(|info| info.class_annotations.iter().any(|name| name == "com.google.inject.BindingAnnotation"))
}

pub fn injected_constructor_annotations(context: &Context, method: Node) {
    if method.kind() != "constructor_declaration" {
        return;
    }
    let annotations = annotations_of(method);
    if !annotations.iter().any(|annotation| is_one_of(context, *annotation, &["com.google.inject.Inject"])) {
        return;
    }
    let mut fix = Fix::new();
    for annotation in annotations {
        if is_one_of(context, annotation, &["com.google.inject.Inject"]) && optional_injection(context, annotation) {
            fix = fix.and(annotation.start_byte(), annotation.end_byte(), "@Inject");
        } else if is_binding_annotation(context, annotation) {
            fix = fix.delete(annotation.start_byte(), annotation.end_byte());
        }
    }
    if !fix.is_empty() {
        let message = "Injected constructors cannot be optional nor have binding annotations";
        context.report_fixed("InjectedConstructorAnnotations", method, name_position(method), message, &[fix]);
    }
}

pub fn scope_annotation_on_interface_or_abstract_class(context: &Context, annotation: Node) {
    if !is_annotation(annotation) || !context.resolver.index.get(&annotation_class(context, annotation).unwrap_or_default()).is_some_and(|info| info.flags & flag::SCOPE_ANNOTATION != 0) {
        return;
    }
    let Some(class) = annotated(annotation).filter(|class| is_class(*class)) else { return };
    if annotations_of(class).into_iter().any(|found| is_one_of(context, found, &COMPONENTS)) {
        return;
    }
    if has_modifier(class, "abstract") || matches!(class.kind(), "interface_declaration" | "annotation_type_declaration") {
        let fix = Fix::new().delete(annotation.start_byte(), annotation.end_byte());
        let message = "Scope annotation on an interface or abstract class is not allowed";
        context.report_fixed("InjectScopeAnnotationOnInterfaceOrAbstractClass", annotation, annotation.start_byte(), message, &[fix]);
    }
}

/// The names of the `ElementType` constants a `@Target` lists: its element values are constants or an array of them.
fn listed_targets(context: &Context, value: Node, found: &mut Vec<String>) {
    match value.kind() {
        "element_value_array_initializer" => named_children(value).into_iter().filter(|part| !part.kind().ends_with("comment")).for_each(|part| listed_targets(context, part, found)),
        "field_access" => found.extend(value.child_by_field_name("field").map(|field| context.text(field).to_string())),
        _ => found.push(context.text(value).to_string()),
    }
}

pub fn invalid_targeting_on_scoping_annotation(context: &Context, class: Node) {
    if class.kind() != "annotation_type_declaration" {
        return;
    }
    let annotations = annotations_of(class);
    if !annotations.iter().any(|annotation| is_one_of(context, *annotation, &SCOPES)) {
        return;
    }
    let mut targets = annotations.iter().filter(|annotation| is_one_of(context, **annotation, &[TARGET]));
    let (Some(target_tree), None) = (targets.next(), targets.next()) else { return };
    let mut listed = Vec::new();
    if let Some(arguments) = target_tree.child_by_field_name("arguments") {
        for part in named_children(arguments).into_iter().filter(|part| !part.kind().ends_with("comment")) {
            let value = if part.kind() == "element_value_pair" { part.child_by_field_name("value") } else { Some(part) };
            if let Some(value) = value {
                listed_targets(context, value, &mut listed);
            }
        }
    }
    if ["TYPE", "METHOD"].iter().all(|required| listed.iter().any(|name| name == required)) {
        return;
    }
    let types: Vec<&str> = target::NAMES.iter().copied().filter(|name| matches!(*name, "TYPE" | "METHOD") || listed.iter().any(|found| found == name)).collect();
    let fix = Fix::replace(target_tree.start_byte(), target_tree.end_byte(), format!("@Target({{{}}})", types.join(", "))).with_imports();
    context.report_fixed("InjectInvalidTargetingOnScopingAnnotation", *target_tree, target_tree.start_byte(), "A scoping annotation's Target should include TYPE and METHOD.", &[fix]);
}
