//! Patterns about single methods of a class, decided from the method's declaration and the class's supertypes.
mod hiding;

use super::Context;
use tree_sitter::Node;

pub fn methods(context: &Context, class: Node) {
    hiding::check(context, class);
}
