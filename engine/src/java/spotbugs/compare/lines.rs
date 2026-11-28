//! Where javac puts a comparison. The line is the last line mark javac emits before the comparison's branch: the
//! statement's own (a local at its name), a loop condition's, a conditional's test and each branch where its value
//! is kept, and each call after its arguments.
use super::super::Context;
use crate::engine::source::{children, named_children, parent};
use tree_sitter::Node;

const STATEMENTS: &[&str] = &[
    "expression_statement", "return_statement", "throw_statement", "yield_statement", "assert_statement", "if_statement",
    "while_statement", "do_statement", "for_statement", "enhanced_for_statement", "switch_statement", "synchronized_statement",
    "explicit_constructor_invocation", "local_variable_declaration",
];
const LOOPS: &[&str] = &["while_statement", "do_statement", "for_statement", "enhanced_for_statement"];

/// The position javac gives an expression's tree.
fn position(context: &Context, node: Node) -> usize {
    let operator = match node.kind() {
        "binary_expression" | "assignment_expression" => node.child_by_field_name("operator"),
        "ternary_expression" => children(node).into_iter().find(|part| part.kind() == "?"),
        "method_invocation" => node.child_by_field_name("arguments"),
        "field_access" => children(node).into_iter().find(|part| part.kind() == "."),
        "instanceof_expression" => children(node).into_iter().find(|part| part.kind() == "instanceof"),
        _ => None,
    };
    context.line(operator.unwrap_or(node))
}

/// Follows javac's code for `node` in order; true once `target` is done, with `mark` the line in force then.
fn scan(context: &Context, node: Node, target: Node, mark: &mut usize, test: bool) -> bool {
    match node.kind() {
        "lambda_expression" | "class_body" => return false,
        "ternary_expression" => {
            let condition = node.child_by_field_name("condition");
            let sides = [node.child_by_field_name("consequence"), node.child_by_field_name("alternative")];
            let chosen = super::super::folds::fixed(context, condition);
            if chosen.is_none() {
                if let Some(condition) = condition {
                    if !test {
                        *mark = position(context, condition);
                    }
                    if scan(context, condition, target, mark, true) {
                        return true;
                    }
                }
            }
            for (index, side) in sides.into_iter().enumerate() {
                let Some(side) = side.filter(|_| chosen.is_none_or(|test| test == (index == 0))) else { continue };
                if !test {
                    *mark = position(context, side);
                }
                if scan(context, side, target, mark, test) {
                    return true;
                }
            }
            return node.id() == target.id();
        }
        _ => {}
    }
    let logic = node.kind() == "binary_expression" && node.child_by_field_name("operator").is_some_and(|operator| matches!(operator.kind(), "&&" | "||"));
    let keeps = test && (logic || node.kind() == "parenthesized_expression" || (node.kind() == "unary_expression" && context.text(node).starts_with('!')));
    for part in named_children(node) {
        let inner = keeps || is_test(node, part);
        if scan(context, part, target, mark, inner) {
            return true;
        }
    }
    if node.kind() == "method_invocation" {
        *mark = position(context, node);
    }
    node.id() == target.id()
}

/// Whether `part` is the test of `holder`, where javac compiles a conditional to jumps rather than to a value.
fn is_test(holder: Node, part: Node) -> bool {
    match holder.kind() {
        "ternary_expression" => false,
        "assert_statement" => named_children(holder).first().is_some_and(|first| first.id() == part.id()),
        _ => holder.child_by_field_name("condition").is_some_and(|condition| condition.id() == part.id()),
    }
}

/// The line SpotBugs gives a comparison.
pub fn line(context: &Context, comparison: Node) -> usize {
    let mut inner = comparison;
    let mut at = parent(comparison);
    while let Some(node) = at {
        let (start, root) = match node.kind() {
            "lambda_expression" => (context.line(inner), inner),
            "variable_declarator" => (node.child_by_field_name("name").map_or_else(|| context.line(node), |name| context.line(name)), inner),
            "enum_constant" | "argument_list" if parent(node).is_some_and(|holder| holder.kind() == "enum_constant") => (context.line(node), node),
            kind if LOOPS.contains(&kind) && node.child_by_field_name("condition").is_some_and(|condition| condition.id() == inner.id()) => {
                (position(context, inner), inner)
            }
            "for_statement" if node.child_by_field_name("update").is_some() && inner.kind() != "block" && STATEMENTS.iter().all(|kind| *kind != inner.kind()) => {
                (context.line(inner), inner)
            }
            kind if STATEMENTS.contains(&kind) => (context.line(node), node),
            _ => {
                inner = node;
                at = parent(node);
                continue;
            }
        };
        let mut mark = start;
        scan(context, root, comparison, &mut mark, parent(root).is_some_and(|holder| is_test(holder, root)));
        return mark;
    }
    context.line(comparison)
}
