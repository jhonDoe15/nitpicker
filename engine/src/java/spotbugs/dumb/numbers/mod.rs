//! The whole-number patterns of DumbMethods: bit operations and comparisons with constants.
mod bits;
mod compares;
pub mod source;
pub mod stores;
pub mod values;

use super::found::Findings;
use super::super::Context;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &[
    bits::IOR,
    bits::ADD,
    bits::VACUOUS,
    bits::REM,
    compares::VACUOUS,
    compares::INT_VALUE,
    compares::SIGNED_BYTE,
    compares::NONNEGATIVE,
];

pub fn check<'a>(context: &Context<'a>, node: Node<'a>, label: &str, found: &mut Findings<'a>) {
    match node.kind() {
        "binary_expression" => {
            bits::check(context, node, label, found);
            compares::check(context, node, label, found);
        }
        "assignment_expression" => bits::check(context, node, label, found),
        _ => {}
    }
}
