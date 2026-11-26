//! NullableOnContainingClass: a type-use nullability annotation on the outer class of a member type.
use super::fixes::Fix;
use super::inject_checks::{annotation_class, annotations_of};
use super::Context;
use crate::engine::source::{children, parent};
use crate::java::types::model::target;
use tree_sitter::Node;

const MESSAGE: &str = "Type-use nullability annotations should annotate the inner class, not the outer class (e.g., write `A.@Nullable B` instead of `@Nullable A.B`).";

/// Only `TYPE_USE`, or `TYPE_USE` and `TYPE_PARAMETER`.
fn only_type_annotation(context: &Context, annotation: Node) -> bool {
    let Some(bits) = annotation_class(context, annotation).and_then(|class| context.resolver.index.get(&class).and_then(|info| info.targets)) else { return false };
    bits & target::bit("TYPE_USE") != 0 && bits & !(target::bit("TYPE_USE") | target::bit("TYPE_PARAMETER")) == 0
}

fn handle(context: &Context, annotations: &[Node], outer_end: usize) {
    for annotation in annotations {
        let simple = annotation.child_by_field_name("name").map(|name| context.text(name)).and_then(|name| name.rsplit('.').next()).unwrap_or_default();
        if !matches!(simple, "Nullable" | "NonNull" | "NullableType") || !only_type_annotation(context, *annotation) {
            continue;
        }
        if annotation.end_byte() < outer_end {
            let fix = Fix::new()
                .delete(annotation.start_byte(), annotation.end_byte())
                .and(outer_end + 1, outer_end + 1, format!("{} ", context.text(*annotation)));
            context.report_fixed("NullableOnContainingClass", *annotation, annotation.start_byte(), MESSAGE, &[fix]);
            return;
        }
    }
}

pub fn nullable_on_containing_class(context: &Context, node: Node) {
    match node.kind() {
        "method_declaration" | "field_declaration" | "formal_parameter" | "local_variable_declaration" | "constant_declaration" | "resource" | "enhanced_for_statement" => {
            let Some(written) = node.child_by_field_name("type").filter(|written| written.kind() == "scoped_type_identifier") else { return };
            let Some(scope) = written.child(0) else { return };
            handle(context, &annotations_of(node), scope.end_byte());
        }
        "annotated_type" => {
            let parts = children(node);
            let annotations: Vec<Node> = parts.iter().copied().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).collect();
            let Some(mut leftmost) = parts.iter().copied().find(|part| part.kind() == "scoped_type_identifier") else { return };
            while let Some(scope) = leftmost.child(0).filter(|scope| scope.kind() == "scoped_type_identifier") {
                leftmost = scope;
            }
            if leftmost.child(0).is_some_and(|scope| scope.kind() == "type_identifier") && parent(leftmost).is_some() {
                handle(context, &annotations, leftmost.child(0).map_or(0, |scope| scope.end_byte()));
            }
        }
        _ => {}
    }
}
