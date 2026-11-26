//! Checks on array declarations.
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::parts::enclosing_class;
use super::tokens::{Tok, tokens};
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::Type;
use tree_sitter::Node;

/// Where the last `[]` after a name ends, for `int a[]`, `int foo()[]` and the like.
fn first_dimension_end(dimensions: Node) -> Option<usize> {
    children(dimensions).into_iter().rev().find(|part| part.kind() == "]").map(|close| close.end_byte())
}

fn check_dimensions(context: &Context, tree: Node, written: Node, dimensions: Option<Node>, name: Node) {
    let Some(end) = dimensions.and_then(first_dimension_end) else { return };
    let start = written.end_byte();
    if start >= end {
        return;
    }
    let region = &context.file.text[start..end];
    let found = tokens(&context.file.text, start, end);
    if found.len() <= 2 || found[0].kind != Tok::Identifier {
        return;
    }
    let first = region.find(|character| character != ' ').unwrap_or(0);
    let Some(at) = region[first..].find("[]").map(|at| at + first).filter(|at| *at > first) else { return };
    let replacement = format!("{}{}", &region[at..], &region[..at]);
    let owner = enclosing_class(context, tree).map(|name| name.rsplit('.').next().unwrap_or_default().to_string());
    if matches!(owner.as_deref(), Some("SimpleCharStream" | "SimpleNode")) {
        return;
    }
    context.report_fixed("MixedArrayDimensions", tree, name.start_byte(), "C-style array declarations should not be used", &[Fix::replace(start, end, replacement)]);
}

pub fn mixed_array_dimensions(context: &Context, node: Node) {
    match node.kind() {
        "method_declaration" => {
            let (Some(written), Some(name)) = (node.child_by_field_name("type"), node.child_by_field_name("name")) else { return };
            check_dimensions(context, node, written, node.child_by_field_name("dimensions"), name);
        }
        "formal_parameter" | "enhanced_for_statement" => {
            let (Some(written), Some(name)) = (node.child_by_field_name("type"), node.child_by_field_name("name")) else { return };
            check_dimensions(context, node, written, node.child_by_field_name("dimensions"), name);
        }
        "field_declaration" | "local_variable_declaration" | "constant_declaration" => {
            let Some(written) = node.child_by_field_name("type") else { return };
            for declarator in declarators(node) {
                if let Some(name) = declarator.child_by_field_name("name") {
                    check_dimensions(context, declarator, written, declarator.child_by_field_name("dimensions"), name);
                }
            }
        }
        _ => {}
    }
}

fn nonempty_array(context: &Context, initializer: Node) -> bool {
    match initializer.kind() {
        "array_initializer" => named_children(initializer).iter().any(|part| !part.kind().ends_with("comment")),
        "array_creation_expression" => {
            let dimensions: Vec<Node> = named_children(initializer).into_iter().filter(|part| part.kind() == "dimensions_expr").collect();
            if !dimensions.is_empty() {
                return !dimensions.iter().all(|dimension| {
                    dimension.named_child(0).is_some_and(|inner| matches!(constant(context, inner), Some(Const::Int(0))))
                });
            }
            initializer.child_by_field_name("value").is_some_and(|value| nonempty_array(context, value))
        }
        _ => false,
    }
}

pub fn mutable_public_array(context: &Context, node: Node) {
    if !matches!(node.kind(), "field_declaration" | "constant_declaration") {
        return;
    }
    let interface = parent(node).is_some_and(|body| matches!(body.kind(), "interface_body" | "annotation_type_body"));
    if !interface && !(has_modifier(node, "public") && has_modifier(node, "static") && has_modifier(node, "final")) {
        return;
    }
    for declarator in declarators(node) {
        let (Some(name), Some(value)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value")) else { continue };
        if !matches!(context.resolver.declared_type(node, Some(declarator)), Some(Type::Array(_))) || !nonempty_array(context, value) {
            continue;
        }
        if context.resolver.annotation_names(node).iter().any(|annotation| annotation == "org.junit.experimental.theories.DataPoints") {
            continue;
        }
        context.report_fixed(
            "MutablePublicArray",
            declarator,
            name.start_byte(),
            "Non-empty arrays are mutable, so this `public static final` array is not a constant and can be modified by clients of this class.  Prefer an ImmutableList, or provide an accessor method that returns a defensive copy.",
            &[],
        );
    }
}
