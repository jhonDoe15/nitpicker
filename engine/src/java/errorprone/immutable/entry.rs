//! The two checks that look at whole classes: `Immutable` and `ImmutableAnnotationChecker`.
use super::super::Context;
use super::super::fixes::Fix;
use super::classes::{Reporter, annotation_node, declaration_name, for_type, keyword, own_type};
use crate::java::types::model::flag;
use crate::engine::source::children;
use tree_sitter::Node;

const ANNOTATION: &str = "java.lang.annotation.Annotation";
const ANNOTATED: &str = "annotations are immutable by default; annotating them with @com.google.errorprone.annotations.Immutable is unnecessary";
const IGNORED: &str = "com.google.auto.value.processor.AutoAnnotationProcessor";

fn generated_by_ignored(context: &Context, class: Node) -> bool {
    let Some(modifiers) = crate::java::helpers::modifiers(class) else { return false };
    crate::engine::source::children(modifiers).into_iter().filter(|part| part.kind() == "annotation").any(|part| {
        let named = part.child_by_field_name("name").is_some_and(|name| context.text(name).rsplit('.').next() == Some("Generated"));
        named && context.text(part).contains(&format!("\"{IGNORED}\""))
    })
}

/// A class that carries `@Immutable` although its kind is immutable anyway: reported at the annotation, with its removal.
pub fn report_annotated(context: &Context, reporter: &Reporter, node: Node, message: &str) {
    match annotation_node(context, node, "Immutable") {
        Some(found) => context.report_always_fixed(reporter.check, found.start_byte(), message, &[Fix::new().delete(found.start_byte(), found.end_byte())]),
        None => context.report_always(reporter.check, keyword(node), message),
    }
}

pub fn immutable_annotation_checker(context: &Context, node: Node) {
    let anonymous = matches!(node.kind(), "object_creation_expression" | "enum_constant");
    let named = matches!(node.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration");
    if !named && !(anonymous && node.child_by_field_name("body").is_some() || children(node).iter().any(|part| part.kind() == "class_body")) {
        return;
    }
    let index = context.resolver.index;
    let Some(name) = declaration_name(context, node) else { return };
    let Some(info) = index.get(&name) else { return };
    if info.flags & flag::ANNOTATION != 0 || !index.is_subtype(&name, ANNOTATION) || generated_by_ignored(context, node) {
        return;
    }
    let reporter = Reporter { check: "ImmutableAnnotationChecker", names: &["ImmutableAnnotationChecker", "Immutable"], describe: &|why| format!("annotations should be immutable: {why}") };
    if super::safety::annotated(context, &name) && !reporter.quiet(context, node) {
        report_annotated(context, &reporter, node, ANNOTATED);
    }
    if let Some(why) = for_type(context, &reporter, Some(node), &name, &own_type(info), &[]) {
        reporter.report(context, node, keyword(node), &why, &[]);
    }
}
