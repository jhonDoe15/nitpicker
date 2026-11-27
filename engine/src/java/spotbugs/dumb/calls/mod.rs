//! The call patterns of DumbMethods and DumbMethodInvocations: random numbers, hash codes and calls with
//! suspicious constant arguments.
pub mod invocations;
mod randoms;

use super::super::Context;
use super::found::Findings;
use tree_sitter::Node;

pub fn wanted(context: &Context) -> bool {
    context.wants(randoms::PATTERNS) || context.wants(invocations::PATTERNS)
}

pub fn check<'a>(context: &Context<'a>, own: &str, node: Node<'a>, label: &str, found: &mut Findings<'a>) {
    randoms::check(context, own, node, label, found);
    invocations::check(context, own, node, label, found);
}
