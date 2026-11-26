//! DuplicateBranches and IdentityBinaryExpression: code whose two sides are written the same.
use super::Context;
use super::fixes::Fix;
use super::positions::preferred;
use crate::engine::source::{named_children, parent, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

const MAX_LENGTH_TO_COMPARE: usize = 750;
const DUPLICATE: &str = "Both branches contain identical code";
const IDENTITY: &str = "A binary expression where both operands are the same is usually incorrect.";

/// The tokens of a tree without its comments: what javac's pretty printer prints is the same for the same tokens.
pub fn tokens<'f>(context: &'f Context, node: Node) -> Vec<&'f str> {
    let mut found = Vec::new();
    walk(node, |part| {
        if part.child_count() == 0 && !part.kind().ends_with("comment") && part.start_byte() != part.end_byte() {
            found.push(context.text(part));
        }
    });
    found
}

fn utf16_length(text: &str) -> usize {
    text.encode_utf16().count()
}

fn comments_between(context: &Context, from: usize, to: usize) -> Vec<String> {
    let mut found = Vec::new();
    walk(context.file.tree.root_node(), |part| {
        if part.kind().ends_with("comment") && part.start_byte() >= from && part.end_byte() <= to {
            found.push(context.text(part).to_string());
        }
    });
    found
}

fn in_block(node: Node) -> bool {
    parent(node).is_some_and(|up| matches!(up.kind(), "block" | "constructor_body"))
}

fn same_branches(context: &Context, tree: Node, then_tree: Node, else_tree: Node) {
    if utf16_length(context.text(then_tree)) > MAX_LENGTH_TO_COMPARE || utf16_length(context.text(else_tree)) > MAX_LENGTH_TO_COMPARE {
        return;
    }
    if tokens(context, then_tree) != tokens(context, else_tree) {
        return;
    }
    let (mut start, mut end) = (else_tree.start_byte(), else_tree.end_byte());
    let mut braces = false;
    if else_tree.kind() == "block" {
        braces = !in_block(tree);
        let statements: Vec<Node> = named_children(else_tree).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
        match (statements.first(), statements.last()) {
            (Some(first), Some(last)) => {
                start = first.start_byte();
                end = last.end_byte();
            }
            _ => start = end,
        }
    }
    let mut comments = comments_between(context, tree.start_byte(), start).join("\n");
    if !comments.is_empty() {
        comments.push('\n');
    }
    let mut replacement = comments + &context.file.text[start..end];
    if braces {
        replacement = format!("{{\n{replacement}}}");
    }
    let fix = Fix::replace(tree.start_byte(), tree.end_byte(), replacement);
    context.report_fixed("DuplicateBranches", tree, preferred(context, tree), DUPLICATE, &[fix]);
}

pub fn duplicate_branches(context: &Context, node: Node) {
    match node.kind() {
        "if_statement" => {
            if let (Some(then_tree), Some(else_tree)) = (node.child_by_field_name("consequence"), node.child_by_field_name("alternative")) {
                same_branches(context, node, then_tree, else_tree);
            }
        }
        "ternary_expression" => {
            if let (Some(then_tree), Some(else_tree)) = (node.child_by_field_name("consequence"), node.child_by_field_name("alternative")) {
                same_branches(context, node, then_tree, else_tree);
            }
        }
        _ => {}
    }
}

fn is_constant(context: &Context, node: Node) -> bool {
    match node.kind() {
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" | "decimal_floating_point_literal"
        | "hex_floating_point_literal" | "character_literal" | "string_literal" | "true" | "false" => true,
        "parenthesized_expression" | "unary_expression" | "binary_expression" | "ternary_expression" => {
            named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).all(|part| is_constant(context, part))
        }
        "cast_expression" => node.child_by_field_name("value").is_some_and(|value| is_constant(context, value)),
        "identifier" | "field_access" => context.resolver.constant_field(node),
        _ => false,
    }
}

fn assertion(context: &Context, binary: Node) -> bool {
    let call = parent(binary).filter(|list| list.kind() == "argument_list").and_then(parent).filter(|call| call.kind() == "method_invocation");
    let Some(call) = call else { return false };
    let named = call.child_by_field_name("name").is_some_and(|name| matches!(context.text(name), "assertTrue" | "assertFalse" | "assertThat"));
    named && context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.is_static)
}

fn nan_replacement(context: &Context, left: Node) -> Option<String> {
    let kind = context.resolver.type_of(left)?.unboxed_or_same();
    let name = match kind {
        Type::Primitive("float") => "Float",
        Type::Primitive("double") => "Double",
        _ => return None,
    };
    Some(format!("{name}.isNaN({})", context.text(left)))
}

pub fn identity_binary_expression(context: &Context, node: Node) {
    if node.kind() != "binary_expression" {
        return;
    }
    let (Some(left), Some(right), Some(operator)) = (node.child_by_field_name("left"), node.child_by_field_name("right"), node.child_by_field_name("operator")) else { return };
    let operator = context.text(operator);
    if matches!(operator, "<<" | "/" | "-") && is_constant(context, left) {
        return;
    }
    let mut replacement: Option<String> = match operator {
        "/" => Some("1".to_string()),
        "-" | "%" => Some("0".to_string()),
        ">=" | "<=" | "==" => {
            if assertion(context, node) {
                return;
            }
            Some("true".to_string())
        }
        "<" | ">" | "!=" | "^" => {
            if assertion(context, node) {
                return;
            }
            Some("false".to_string())
        }
        "&" | "|" | "&&" | "||" => Some(context.text(left).to_string()),
        "<<" | ">>" | ">>>" => None,
        _ => return,
    };
    if tokens(context, left) != tokens(context, right) {
        return;
    }
    match operator {
        "!=" => replacement = nan_replacement(context, left).or(replacement),
        "==" => replacement = nan_replacement(context, left).map(|text| format!("!{text}")).or(replacement),
        _ => {}
    }
    let message = match replacement {
        Some(text) => format!("A binary expression where both operands are the same is usually incorrect; the value of this expression is equivalent to `{text}`."),
        None => IDENTITY.to_string(),
    };
    context.report_fixed("IdentityBinaryExpression", node, preferred(context, node), &message, &[]);
}
