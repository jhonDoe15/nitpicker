//! QualifierOrScopeOnInjectMethod and QualifierWithTypeUse.
use super::fixes::Fix;
use super::inject_checks::{annotations_of, is_one_of, is_qualifier, is_scope, INJECT, PROVIDES, QUALIFIERS};
use super::inject_more::{listed_targets, TARGET};
use super::nodes::name_position;
use super::Context;
use crate::engine::source::{ancestor, named_children};
use crate::java::types::model::target;
use tree_sitter::Node;

pub fn qualifier_or_scope_on_inject_method(context: &Context, method: Node) {
    if !matches!(method.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration") {
        return;
    }
    let annotations = annotations_of(method);
    let matching: Vec<Node> = annotations.iter().copied().filter(|annotation| is_qualifier(context, *annotation) || is_scope(context, *annotation)).collect();
    let injects: Vec<Node> = annotations.iter().copied().filter(|annotation| is_one_of(context, *annotation, &INJECT)).collect();
    if matching.is_empty() || injects.is_empty() {
        return;
    }
    let message = "Qualifiers/Scope annotations on @Inject methods don't have any effect. Move the qualifier annotation to the binding location.";
    let delete = |fix: Fix, annotations: &[Node]| annotations.iter().fold(fix, |fix, annotation| fix.delete(annotation.start_byte(), annotation.end_byte()));
    if method.kind() != "method_declaration" {
        let mut fix = Fix::new();
        let mut qualifiers = Vec::new();
        let class = ancestor(method, &["class_declaration", "enum_declaration", "record_declaration", "interface_declaration", "annotation_type_declaration"]);
        for annotation in &matching {
            if !is_scope(context, *annotation) {
                qualifiers.push(*annotation);
                continue;
            }
            fix = fix.delete(annotation.start_byte(), annotation.end_byte());
            if let Some(class) = class {
                fix = fix.insert(class.start_byte(), format!("{} ", context.text(*annotation)));
            }
        }
        let fix = delete(fix, &qualifiers);
        context.report_fixed("QualifierOrScopeOnInjectMethod", method, name_position(method), message, &[fix]);
        return;
    }
    let provides = annotations.iter().any(|annotation| is_one_of(context, *annotation, &PROVIDES));
    let (shown, removed) = if provides { (injects[0], &injects) } else { (matching[0], &matching) };
    let fix = delete(Fix::new(), removed);
    context.report_fixed("QualifierOrScopeOnInjectMethod", shown, shown.start_byte(), message, &[fix]);
}

pub fn qualifier_with_type_use(context: &Context, class: Node) {
    if class.kind() != "annotation_type_declaration" {
        return;
    }
    let annotations = annotations_of(class);
    if !annotations.iter().any(|annotation| is_one_of(context, *annotation, &QUALIFIERS)) {
        return;
    }
    let mut targets = annotations.iter().copied().filter(|annotation| is_one_of(context, *annotation, &[TARGET]));
    let (Some(tree), None) = (targets.next(), targets.next()) else { return };
    let mut listed = Vec::new();
    if let Some(arguments) = tree.child_by_field_name("arguments") {
        for part in named_children(arguments).into_iter().filter(|part| !part.kind().ends_with("comment")) {
            let value = if part.kind() == "element_value_pair" { part.child_by_field_name("value") } else { Some(part) };
            if let Some(value) = value {
                listed_targets(context, value, &mut listed);
            }
        }
    }
    let forbidden = |name: &str| matches!(name, "TYPE_USE" | "TYPE_PARAMETER");
    if !listed.iter().any(|name| forbidden(name)) {
        return;
    }
    let kept: Vec<&str> = target::NAMES.iter().copied().filter(|name| !forbidden(name) && listed.iter().any(|found| found == name)).collect();
    let fix = if kept.is_empty() {
        Fix::new().delete(tree.start_byte(), tree.end_byte())
    } else {
        Fix::replace(tree.start_byte(), tree.end_byte(), format!("@Target({{{}}})", kept.join(", "))).with_imports()
    };
    context.report_fixed("QualifierWithTypeUse", tree, tree.start_byte(), "Injection frameworks currently don't understand Qualifiers in TYPE_PARAMETER or TYPE_USE contexts.", &[fix]);
}
