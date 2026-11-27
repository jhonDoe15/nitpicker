//! The fixes ReferenceEquality suggests: ask `equals` instead of comparing references.
use super::Context;
use super::symbol_key::same_symbol as same_variable;
use super::fixes::Fix;
use super::fix_helpers::qualify_type;
use crate::engine::source::parent;
use crate::java::types::expr::unwrap;
use tree_sitter::Node;

fn pair_matches<'t>(context: &Context<'t>, first: Node<'t>, second: Node<'t>, left: Node<'t>, right: Node<'t>) -> bool {
    (same_variable(context, first, left) && same_variable(context, second, right)) || (same_variable(context, first, right) && same_variable(context, second, left))
}

/// `a == b || a.equals(b)` becomes the second half.
fn or_statement(context: &Context, binary: Node, left: Node, right: Node, is_equal: bool) -> Option<Fix> {
    let above = parent(binary).filter(|above| above.kind() == "binary_expression")?;
    let operator = above.child_by_field_name("operator").map(|operator| context.text(operator))?;
    if !is_equal || operator != "||" || above.child_by_field_name("left") != Some(binary) {
        return None;
    }
    let other = unwrap(above.child_by_field_name("right")?);
    if other.kind() != "method_invocation" {
        return None;
    }
    let arguments: Vec<Node> = other.child_by_field_name("arguments")?.named_children(&mut other.walk()).filter(|part| !part.kind().ends_with("comment")).collect();
    let statics = context.resolver.matches_sig(other, "java.util.Objects#equals(_,_)") || context.resolver.matches_sig(other, "com.google.common.base.Objects#equal(_,_)");
    let found = if statics {
        arguments.len() == 2 && pair_matches(context, arguments[0], arguments[1], left, right)
    } else {
        let receiver = other.child_by_field_name("object");
        context.resolver.matches_sig(other, "java.lang.Object#equals(java.lang.Object)")
            && receiver.zip(arguments.first()).is_some_and(|(receiver, argument)| pair_matches(context, receiver, *argument, left, right))
    };
    found.then(|| Fix::replace(above.start_byte(), above.end_byte(), context.text(other)))
}

fn known_constant(context: &Context, node: Node) -> bool {
    context.resolver.constant_string(node).is_some()
}

pub fn fixes(context: &Context, binary: Node, operator: &str) -> Vec<Fix> {
    let (Some(mut left), Some(mut right)) = (binary.child_by_field_name("left"), binary.child_by_field_name("right")) else { return Vec::new() };
    let is_equal = operator == "==";
    if let Some(fix) = or_statement(context, binary, left, right, is_equal) {
        return vec![fix];
    }
    if !known_constant(context, left) && known_constant(context, right) {
        std::mem::swap(&mut left, &mut right);
    }
    let prefix = if is_equal { "" } else { "!" };
    let (left_text, right_text) = (context.text(left), context.text(right));
    let mut fixes = Vec::new();
    if !super::nullness::known_non_null(context, left) {
        let mut fix = Fix::new();
        let objects = qualify_type(context, binary, "java.util.Objects", &mut fix);
        fixes.push(fix.and(binary.start_byte(), binary.end_byte(), format!("{prefix}{objects}.equals({left_text}, {right_text})")));
    }
    let shown = if left.kind() == "binary_expression" { format!("({left_text})") } else { left_text.to_string() };
    fixes.push(Fix::replace(binary.start_byte(), binary.end_byte(), format!("{prefix}{shown}.equals({right_text})")));
    fixes
}
