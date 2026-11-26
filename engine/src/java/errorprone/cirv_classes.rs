//! NoCanIgnoreReturnValueOnClasses: `@CanIgnoreReturnValue` on a class is pushed down onto its methods.
use super::fix_helpers::qualify_type;
use super::finals::assignments;
use super::fixes::Fix;
use super::inject_checks::{annotation_class, annotations_of};
use super::shape::{class_keyword, is_class};
use super::Context;
use crate::engine::source::{ancestor, children, named_children, walk};
use crate::java::helpers::declarators;
use tree_sitter::Node;

const CRV: &str = "com.google.errorprone.annotations.CheckReturnValue";
const CIRV: &str = "com.google.errorprone.annotations.CanIgnoreReturnValue";
const METHOD_COMMENT: &str = " // pushed down from class to method;";
const CTOR_COMMENT: &str = " // pushed down from class to constructor;";
const MESSAGE: &str = "@CanIgnoreReturnValue should not be applied to classes as it almost always overmatches (as it applies to constructors and all methods), and the CIRVness isn't conferred to its subclasses.";

fn annotated(context: &Context, declaration: Node, class: &str) -> bool {
    annotations_of(declaration).into_iter().any(|annotation| annotation_class(context, annotation).as_deref() == Some(class))
}

/// `this`, possibly cast or in parentheses, or a call of `self()` or `getThis()`.
fn maybe_cast_this(context: &Context, tree: Option<Node>) -> bool {
    let Some(tree) = tree else { return false };
    match tree.kind() {
        "this" => true,
        "parenthesized_expression" => maybe_cast_this(context, named_children(tree).into_iter().find(|part| !part.kind().ends_with("comment"))),
        "cast_expression" => maybe_cast_this(context, tree.child_by_field_name("value")),
        "method_invocation" => tree.child_by_field_name("name").is_some_and(|name| matches!(context.text(name), "self" | "getThis")),
        _ => false,
    }
}

fn returns_of<'t>(root: Node<'t>, out: &mut Vec<Node<'t>>, variables: &mut Vec<Node<'t>>) {
    for part in children(root) {
        match part.kind() {
            "lambda_expression" | "object_creation_expression" => {}
            "return_statement" => out.push(part),
            "local_variable_declaration" => {
                variables.push(part);
                returns_of(part, out, variables);
            }
            _ => returns_of(part, out, variables),
        }
    }
}

fn always_returns_this(context: &Context, method: Node) -> bool {
    let Some(body) = method.child_by_field_name("body") else { return false };
    let (mut returns, mut variables) = (Vec::new(), Vec::new());
    returns_of(body, &mut returns, &mut variables);
    let mut thises: Vec<&str> = Vec::new();
    for declaration in variables {
        for declarator in declarators(declaration) {
            let Some(name) = declarator.child_by_field_name("name").map(|name| context.text(name)) else { continue };
            let final_variable = crate::java::helpers::has_modifier(declaration, "final") || assignments(context, body, name, declarator.end_byte()).0 == 0;
            if final_variable && maybe_cast_this(context, declarator.child_by_field_name("value")) {
                thises.push(name);
            }
        }
    }
    let this_like = |expression: Option<Node>| {
        maybe_cast_this(context, expression) || expression.is_some_and(|value| value.kind() == "identifier" && thises.contains(&context.text(value)))
    };
    !returns.is_empty() && returns.iter().all(|statement| this_like(named_children(*statement).into_iter().find(|part| !part.kind().ends_with("comment"))))
}

fn should_add(context: &Context, method: Node) -> bool {
    if method.kind() == "method_declaration" && method.child_by_field_name("type").is_some_and(|written| written.kind() == "void_type") {
        return false;
    }
    if annotated(context, method, CIRV) || annotated(context, method, CRV) {
        return false;
    }
    let Some(class) = ancestor(method, &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"]) else { return true };
    let auto_value = annotations_of(class).into_iter().any(|annotation| matches!(annotation_class(context, annotation).as_deref(), Some("com.google.auto.value.AutoValue" | "com.google.auto.value.AutoValue.Builder")));
    !(auto_value && method.child_by_field_name("body").is_none())
}

fn push_down(context: &Context, node: Node, name: &str, fix: &mut Fix) {
    match node.kind() {
        "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => {
            if should_add(context, node) {
                let comment = if node.kind() != "method_declaration" {
                    CTOR_COMMENT
                } else if always_returns_this(context, node) {
                    ""
                } else {
                    METHOD_COMMENT
                };
                *fix = std::mem::take(fix).insert(node.start_byte(), format!("@{name}{comment}\n"));
            }
        }
        "lambda_expression" | "object_creation_expression" => {}
        _ => {
            if is_class(node) && annotated(context, node, CRV) {
                return;
            }
            for part in children(node) {
                push_down(context, part, name, fix);
            }
        }
    }
}

pub fn no_can_ignore_return_value_on_classes(context: &Context, node: Node) {
    if !is_class(node) {
        return;
    }
    let Some(annotation) = annotations_of(node).into_iter().find(|annotation| annotation_class(context, *annotation).as_deref() == Some(CIRV)) else { return };
    let mut fix = Fix::new();
    let name = qualify_type(context, node, CIRV, &mut fix);
    fix = fix.delete(annotation.start_byte(), annotation.end_byte());
    push_down(context, node, &name, &mut fix);
    context.report_always_fixed("NoCanIgnoreReturnValueOnClasses", class_keyword(node), MESSAGE, &[fix]);
}
