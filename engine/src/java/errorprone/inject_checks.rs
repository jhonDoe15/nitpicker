//! Checks on `@Inject`, scope and qualifier annotations: misplaced scopes, repeated qualifiers, missing runtime retention.
use super::fixes::Fix;
use super::shape::{class_keyword, suppressed_any};
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::{has_modifier, modifiers};
use crate::java::types::model::flag;
use tree_sitter::Node;

pub(super) const INJECT: [&str; 3] = ["com.google.inject.Inject", "javax.inject.Inject", "jakarta.inject.Inject"];
const PROVIDES: [&str; 7] = [
    "com.google.inject.Provides",
    "dagger.Provides",
    "com.google.inject.multibindings.ProvidesIntoMap",
    "com.google.inject.multibindings.ProvidesIntoSet",
    "com.google.inject.multibindings.ProvidesIntoOptional",
    "com.google.inject.throwingproviders.CheckedProvides",
    "dagger.producers.Produces",
];
const SCOPES: [&str; 3] = ["com.google.inject.ScopeAnnotation", "javax.inject.Scope", "jakarta.inject.Scope"];
const QUALIFIERS: [&str; 3] = ["com.google.inject.BindingAnnotation", "javax.inject.Qualifier", "jakarta.inject.Qualifier"];
const MAP_KEYS: [&str; 2] = ["com.google.inject.multibindings.MapKey", "dagger.MapKey"];
const COMPONENTS: [&str; 6] =
    ["dagger.Component", "dagger.Subcomponent", "dagger.producers.ProductionComponent", "dagger.producers.ProductionSubcomponent", "dagger.hilt.DefineComponent", "dagger.Module"];

/// The annotations written in the modifiers of a declaration.
pub fn annotations_of<'t>(declaration: Node<'t>) -> Vec<Node<'t>> {
    modifiers(declaration).map(children).unwrap_or_default().into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).collect()
}

/// The full name of the annotation type an annotation applies.
pub fn annotation_class(context: &Context, annotation: Node) -> Option<String> {
    let name = annotation.child_by_field_name("name")?;
    context.resolver.class_name(annotation, context.text(name))
}

pub(super) fn is_one_of(context: &Context, annotation: Node, names: &[&str]) -> bool {
    annotation_class(context, annotation).is_some_and(|class| names.contains(&class.as_str()))
}

fn has_flag(context: &Context, annotation: Node, bit: u32) -> bool {
    annotation_class(context, annotation).and_then(|class| context.resolver.index.get(&class)).is_some_and(|info| info.flags & bit != 0)
}

fn is_scope(context: &Context, annotation: Node) -> bool {
    has_flag(context, annotation, flag::SCOPE_ANNOTATION)
}

pub(super) fn is_qualifier(context: &Context, annotation: Node) -> bool {
    has_flag(context, annotation, flag::QUALIFIER_ANNOTATION)
}

fn is_abstract_or_default(node: Node) -> bool {
    if has_modifier(node, "abstract") || has_modifier(node, "default") {
        return true;
    }
    parent(node).and_then(parent).is_some_and(|holder| holder.kind() == "interface_declaration")
        && node.child_by_field_name("body").is_none()
        && !has_modifier(node, "static")
        && !has_modifier(node, "private")
}

pub fn javax_inject_on_abstract_method(context: &Context, node: Node) {
    if node.kind() != "method_declaration" || !is_abstract_or_default(node) {
        return;
    }
    let found = annotations_of(node).into_iter().find(|annotation| is_one_of(context, *annotation, &["javax.inject.Inject", "jakarta.inject.Inject"]));
    if let Some(annotation) = found {
        let fix = Fix::new().delete(annotation.start_byte(), annotation.end_byte());
        context.report_fixed("JavaxInjectOnAbstractMethod", annotation, annotation.start_byte(), "Abstract and default methods are not injectable with javax.inject.Inject", &[fix]);
    }
}

const MISPLACED: &str = "Scope annotations used as qualifier annotations don't have any effect. Move the scope annotation to the binding location or delete it.";

fn delete_all(context: &Context, scopes: &[Node]) {
    let Some(first) = scopes.first() else { return };
    let fix = scopes.iter().fold(Fix::new(), |fix, annotation| fix.delete(annotation.start_byte(), annotation.end_byte()));
    context.report_fixed("MisplacedScopeAnnotations", *first, first.start_byte(), MISPLACED, &[fix]);
}

fn misplaced_scopes<'t>(context: &Context, annotations: Vec<Node<'t>>) -> Vec<Node<'t>> {
    annotations.into_iter().filter(|annotation| is_scope(context, *annotation) && !is_qualifier(context, *annotation)).collect()
}

pub fn misplaced_scope_annotations(context: &Context, node: Node) {
    match node.kind() {
        "method_declaration" | "constructor_declaration" => {
            let marked = annotations_of(node).into_iter().any(|annotation| is_one_of(context, annotation, &INJECT) || is_one_of(context, annotation, &PROVIDES));
            let Some(parameters) = node.child_by_field_name("parameters").filter(|_| marked) else { return };
            let scopes: Vec<Node> = named_children(parameters)
                .into_iter()
                .filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter"))
                .flat_map(|parameter| misplaced_scopes(context, annotations_of(parameter)))
                .collect();
            delete_all(context, &scopes);
        }
        "field_declaration" | "local_variable_declaration" | "formal_parameter" | "spread_parameter" | "constant_declaration" => {
            let annotations = annotations_of(node);
            if annotations.iter().any(|annotation| is_one_of(context, *annotation, &INJECT)) {
                delete_all(context, &misplaced_scopes(context, annotations));
            }
        }
        _ => {}
    }
}

const RUNTIME_MESSAGE: &str = "Scoping and qualifier annotations must have runtime retention.";
const RETENTION: &str = "java.lang.annotation.Retention";

fn retention_annotation<'t>(context: &Context, declaration: Node<'t>) -> Option<Node<'t>> {
    let found = annotations_of(declaration).into_iter().filter(|annotation| annotation_class(context, *annotation).as_deref() == Some(RETENTION)).last();
    found
}

fn retention_bits(context: &Context, annotation: Option<Node>) -> u32 {
    let Some(arguments) = annotation.and_then(|annotation| annotation.child_by_field_name("arguments")) else { return 0 };
    let mut last = None;
    crate::engine::source::walk(arguments, |part| {
        if part.kind() == "identifier" {
            last = Some(part);
        }
    });
    last.map_or(0, |constant| flag::of_retention(context.text(constant)))
}

fn in_component(context: &Context, declaration: Node) -> bool {
    let Some(class) = crate::engine::source::ancestor(declaration, &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"]) else { return false };
    annotations_of(class).into_iter().any(|annotation| is_one_of(context, annotation, &COMPONENTS))
}

pub fn missing_runtime_retention(context: &Context, node: Node) {
    if node.kind() != "annotation_type_declaration" {
        return;
    }
    let annotations = annotations_of(node);
    let injected = annotations.iter().any(|annotation| is_one_of(context, *annotation, &SCOPES) || is_one_of(context, *annotation, &QUALIFIERS) || is_one_of(context, *annotation, &MAP_KEYS));
    let processor = annotations.iter().any(|annotation| is_one_of(context, *annotation, &["com.google.apps.framework.annotations.ProcessorAnnotation"]));
    if !injected && !processor {
        return;
    }
    let retention = retention_annotation(context, node);
    let bits = retention_bits(context, retention);
    if bits & flag::RUNTIME_RETENTION != 0 {
        return;
    }
    if injected && bits & flag::SOURCE_RETENTION == 0 && in_component(context, node) {
        return;
    }
    if suppressed_any(context, &["MissingRuntimeRetention", "InjectScopeOrQualifierAnnotationRetention"], node) {
        return;
    }
    let fix = Fix::new().with_imports();
    let (at, fix) = match retention {
        Some(existing) => (existing.start_byte(), fix.and(existing.start_byte(), existing.end_byte(), "@Retention(RUNTIME)")),
        None => match annotations.last() {
            Some(last) => (class_keyword(node), fix.insert(last.end_byte(), "@Retention(RUNTIME)")),
            None => return,
        },
    };
    context.report_fixed("MissingRuntimeRetention", node, at, RUNTIME_MESSAGE, &[fix]);
}

pub fn more_than_one_injectable_constructor(context: &Context, node: Node) {
    if !matches!(node.kind(), "annotation" | "marker_annotation") || !is_one_of(context, node, &INJECT) {
        return;
    }
    let Some(constructor) = parent(node).and_then(parent).filter(|member| member.kind() == "constructor_declaration") else { return };
    let Some(body) = parent(constructor) else { return };
    let injected = |member: &Node| member.kind() == "constructor_declaration" && annotations_of(*member).into_iter().any(|annotation| is_one_of(context, annotation, &INJECT));
    let constructors: Vec<Node> = children(body).into_iter().filter(injected).collect();
    if constructors.len() < 2 || constructors[0].id() != constructor.id() {
        return;
    }
    let Some(class) = parent(body).filter(|class| super::shape::is_class(*class)) else { return };
    let names = ["MoreThanOneInjectableConstructor", "inject-constructors", "InjectMultipleAtInjectConstructors"];
    if !suppressed_any(context, &names, node) {
        let message = "This class has more than one @Inject-annotated constructor. Please remove the @Inject annotation from all but one of them.";
        context.report_fixed("MoreThanOneInjectableConstructor", node, class_keyword(class), message, &[]);
    }
}

pub fn more_than_one_qualifier(context: &Context, node: Node) {
    if !matches!(node.kind(), "annotation" | "marker_annotation") || !is_qualifier(context, node) {
        return;
    }
    let Some(holder) = parent(node).filter(|holder| holder.kind() == "modifiers") else { return };
    let count = children(holder).into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation") && is_qualifier(context, *part)).count();
    if count > 1 && !suppressed_any(context, &["MoreThanOneQualifier", "InjectMoreThanOneQualifier"], node) {
        let fix = Fix::new().delete(node.start_byte(), node.end_byte());
        context.report_fixed("MoreThanOneQualifier", node, node.start_byte(), "Using more than one qualifier annotation on the same element is not allowed.", &[fix]);
    }
}
