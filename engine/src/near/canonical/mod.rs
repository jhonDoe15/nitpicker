mod effects;
mod expressions;
mod library;
mod order;
mod statements;

use crate::near::keys::{parameter_positions, shape_mode};
use crate::near::tree::{Node, Tree, same_tree, with_children};
use expressions::{is_chain_interior, mark_conditions, rewrite_expression, with_conditions};
use order::{OrderContext, canonical_order};
use statements::rewrite_statements;

const MAX_ROUNDS: usize = 8;

pub struct Canonical {
    pub tree: Tree,
    pub original: Tree,
    pub rewritten: bool,
}

fn rewrite(node: &Node, interior: bool, context: &OrderContext) -> Tree {
    let children: Vec<Tree> =
        node.children.iter().map(|child| rewrite(child, is_chain_interior(node, child), context)).collect();
    let rebuilt = with_conditions(node, children);
    if rebuilt.is("block") {
        let statements = canonical_order(rewrite_statements(&rebuilt.children), context);
        return with_children(&rebuilt, statements);
    }
    if rebuilt.category() == "expression" && !interior { rewrite_expression(&rebuilt, &context.mode) } else { rebuilt }
}

pub fn canonical_tree(original: Tree) -> Canonical {
    let parameters = parameter_positions(&original);
    let context = OrderContext { escaping: effects::escaping_names(&original), mode: shape_mode(&parameters) };
    let start = mark_conditions(&original);
    let mut current = start.clone();
    for _ in 0..MAX_ROUNDS {
        let next = rewrite(&current, false, &context);
        if same_tree(&next, &current) {
            break;
        }
        current = next;
    }
    let rewritten = !same_tree(&current, &start);
    Canonical { tree: current, original, rewritten }
}
