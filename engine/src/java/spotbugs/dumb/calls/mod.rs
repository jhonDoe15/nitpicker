//! The call patterns of DumbMethods and DumbMethodInvocations: random numbers, hash codes and calls with
//! suspicious constant arguments.
mod checks;
pub mod invocations;
pub mod randoms;
mod reads;
mod reflection;

use super::super::Context;
use super::super::idioms::Compiled;
use super::found::Findings;
use tree_sitter::Node;

pub const PATTERNS: &[&[&str]] = &[randoms::PATTERNS, invocations::PATTERNS, checks::PATTERNS, reads::PATTERNS, &[reflection::PATTERN]];

pub fn wanted(context: &Context) -> bool {
    PATTERNS.iter().any(|patterns| context.wants(patterns))
}

pub fn check<'a>(context: &Context<'a>, own: &str, method: &Compiled<'a>, node: Node<'a>, found: &mut Findings<'a>) {
    let label = &method.label;
    randoms::check(context, own, node, label, found);
    invocations::check(context, own, node, label, found);
    checks::check(context, node, label, found);
    reads::check(context, own, method, node, found);
    reflection::check(context, own, node, label, found);
}
