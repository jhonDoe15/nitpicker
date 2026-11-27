//! Names in a constructor that are not reads of the field they spell: a pattern variable hides the field of its
//! name where it is in scope.
use super::super::super::Context;
use crate::engine::source::parent;
use tree_sitter::Node;

const SCOPES: [&str; 18] = [
    "if_statement", "while_statement", "for_statement", "do_statement", "switch_rule", "switch_block_statement_group",
    "conditional_expression", "binary_expression", "parenthesized_expression", "unary_expression",
    "expression_statement", "block", "argument_list", "method_invocation", "switch_body", "switch_block",
    "switch_expression", "assignment_expression",
];

/// Whether a name is a pattern variable in scope where it is used, which hides the field of that name.
pub fn bound_by_pattern(context: &Context, name: Node) -> bool {
    let text = context.text(name);
    let mut at = parent(name);
    while let Some(holder) = at.filter(|holder| SCOPES.contains(&holder.kind())) {
        let mut found = false;
        let searched = if holder.kind() == "block" { None } else { Some(holder) };
        searched.into_iter().for_each(|holder| crate::engine::source::walk(holder, |node| {
            let binding = node.kind() == "identifier"
                && node.start_byte() < name.start_byte()
                && parent(node).is_some_and(|owner| owner.kind() == "type_pattern" || (owner.kind() == "instanceof_expression" && owner.child_by_field_name("name").is_some_and(|bound| bound.id() == node.id())));
            found |= binding && context.text(node) == text;
        }));
        if found {
            return true;
        }
        at = parent(holder);
    }
    false
}
