//! `NullnessUtils.hasDefinitelyNullBranch` and DereferenceWithNullBranch.
use super::Context;
use super::call_match::static_on_class;
use super::positions::arguments;
use crate::engine::source::{ancestor, children, named_children, parent};
use crate::java::types::expr::Receiver;
use crate::java::types::model::Type;
use tree_sitter::Node;

fn is_void(context: &Context, node: Node) -> bool {
    match context.resolver.type_of(node) {
        Some(Type::Null) => true,
        Some(Type::Class(name, _)) => name == "java.lang.Void",
        _ => false,
    }
}

fn named_parts(node: Node) -> Vec<Node> {
    named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn strip_parentheses(mut node: Node) -> Node {
    while node.kind() == "parenthesized_expression" {
        match named_parts(node).first() {
            Some(inner) => node = *inner,
            None => break,
        }
    }
    node
}

/// A null check `x == null` or `x != null` (either side, parentheses around the test ignored): the tested expression
/// and whether the check is true for null.
pub struct NullCheck<'t> {
    pub tested: Node<'t>,
    pub true_for_null: bool,
}

pub fn null_check<'t>(context: &Context, condition: Node<'t>) -> Option<NullCheck<'t>> {
    let condition = strip_parentheses(condition);
    if condition.kind() != "binary_expression" {
        return None;
    }
    let true_for_null = match context.text(condition.child_by_field_name("operator")?) {
        "==" => true,
        "!=" => false,
        _ => return None,
    };
    let (left, right) = (condition.child_by_field_name("left")?, condition.child_by_field_name("right")?);
    let tested = if right.kind() == "null_literal" {
        left
    } else if left.kind() == "null_literal" {
        right
    } else {
        return None;
    };
    Some(NullCheck { tested, true_for_null })
}

impl NullCheck<'_> {
    /// The branch of a ternary that runs when the tested expression is null.
    pub fn null_case<'t>(&self, ternary: Node<'t>) -> Option<Node<'t>> {
        ternary.child_by_field_name(if self.true_for_null { "consequence" } else { "alternative" })
    }
    pub fn bare_identifier<'t>(&self, context: &'t Context) -> Option<&'t str> {
        (self.tested.kind() == "identifier").then(|| context.text(self.tested))
    }
}

fn ternary_x_if_x_is_null(context: &Context, ternary: Node) -> bool {
    let Some(check) = ternary.child_by_field_name("condition").and_then(|condition| null_check(context, condition)) else { return false };
    let (Some(name), Some(branch)) = (check.bare_identifier(context), check.null_case(ternary)) else { return false };
    branch.kind() == "identifier" && context.text(branch) == name
}

fn optional_or_null(context: &Context, call: Node) -> bool {
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    match name {
        "orNull" => context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static && context.resolver.index.is_subtype(&resolved.receiver.name(), "com.google.common.base.Optional")),
        "orElse" => {
            let single_null = matches!(arguments(call)[..], [only] if only.kind() == "null_literal");
            single_null && context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static && context.resolver.index.is_subtype(&resolved.receiver.name(), "java.util.Optional"))
        }
        "emptyToNull" => static_on_class(context, call, "com.google.common.base.Strings", &["emptyToNull"]),
        _ => false,
    }
}

fn switch_has_null_branch(context: &Context, switch: Node, proven: &[&str]) -> bool {
    let mut found = false;
    crate::engine::source::walk(switch, |part| {
        if part.kind() != "switch_rule" || found || ancestor(part, &["switch_expression"]).is_none_or(|owner| owner.id() != switch.id()) {
            return;
        }
        let body = children(part).into_iter().rev().find(|child| child.is_named() && !child.kind().ends_with("comment"));
        let expression = body.filter(|body| body.kind() == "expression_statement").and_then(|body| named_parts(body).first().copied());
        found = expression.is_some_and(|expression| definitely_null(context, expression, proven));
    });
    found
}

/// Whether the expression has a branch that is definitely null: a null literal, a `Void` value, a ternary or switch
/// with such a branch, or one of the few calls that return null.
pub fn definitely_null(context: &Context, node: Node, proven: &[&str]) -> bool {
    match node.kind() {
        "assignment_expression" => node.child_by_field_name("right").is_some_and(|right| definitely_null(context, right, proven)),
        "ternary_expression" => {
            let branch = |field: &str| node.child_by_field_name(field).is_some_and(|part| definitely_null(context, part, proven));
            branch("consequence") || branch("alternative") || ternary_x_if_x_is_null(context, node)
        }
        "identifier" => proven.contains(&context.text(node)) || is_void(context, node),
        "method_invocation" => optional_or_null(context, node) || is_void(context, node),
        "parenthesized_expression" => named_parts(node).first().is_some_and(|inner| definitely_null(context, *inner, proven)),
        "cast_expression" => node.child_by_field_name("value").is_some_and(|value| definitely_null(context, value, proven)),
        "switch_expression" => is_void(context, node) || switch_has_null_branch(context, node, proven),
        _ => is_void(context, node),
    }
}

/// The names proven null where the node stands: `x` inside `x == null ? <here> : ...`.
fn proven_by_ternary<'t>(context: &'t Context, node: Node<'t>) -> Vec<&'t str> {
    let mut child = node;
    let mut current = parent(node);
    while let Some(above) = current {
        let kind = above.kind();
        if kind != "argument_list" {
            if kind.ends_with("_statement") || kind.ends_with("_declaration") || matches!(kind, "block" | "variable_declarator" | "class_body" | "switch_rule" | "switch_block" | "program") {
                break;
            }
            if kind == "ternary_expression" {
                let check = above.child_by_field_name("condition").and_then(|condition| null_check(context, condition));
                return match check {
                    Some(check) if check.null_case(above) == Some(child) => check.bare_identifier(context).into_iter().collect(),
                    _ => Vec::new(),
                };
            }
            child = above;
        }
        current = parent(above);
    }
    Vec::new()
}

fn is_type_name(context: &Context, expression: Node) -> bool {
    matches!(expression.kind(), "identifier" | "field_access") && matches!(context.resolver.receiver(expression), Some(Receiver::Static(_)))
}

pub fn dereference_with_null_branch(context: &Context, node: Node) {
    let (object, dot) = match node.kind() {
        "field_access" => (node.child_by_field_name("object"), children(node).into_iter().find(|part| !part.is_named() && part.kind() == ".")),
        "method_invocation" => (node.child_by_field_name("object"), children(node).into_iter().find(|part| !part.is_named() && part.kind() == ".")),
        _ => return,
    };
    let (Some(object), Some(dot)) = (object, dot) else { return };
    if object.kind() == "this" || object.kind() == "super" {
        return;
    }
    if node.kind() == "field_access" && node.child_by_field_name("field").is_some_and(|field| matches!(context.text(field), "class" | "this")) {
        return;
    }
    if is_type_name(context, object) {
        return;
    }
    let proven = proven_by_ternary(context, node);
    if definitely_null(context, object, &proven) {
        context.report_fixed("DereferenceWithNullBranch", node, dot.start_byte(), "Dereference of an expression with a null branch", &[]);
    }
}
