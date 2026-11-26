//! Patterns about single methods of a class: HSM_HIDING_METHOD, decided from the method's declaration and the
//! class's supertypes, and NN_NAKED_NOTIFY, decided from the instructions javac writes for the method.
mod code;
mod ends;
mod hiding;
mod notify;
mod values;

use super::Context;
use tree_sitter::Node;

pub fn methods<'a>(context: &Context<'a>, class: Node<'a>) {
    hiding::check(context, class);
    notify::check(context, class);
}
