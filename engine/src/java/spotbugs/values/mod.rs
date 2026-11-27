//! Patterns that follow a value: SR_NOT_CHECKED and RR_NOT_CHECKED (ReadReturnShouldBeChecked, see `reads`) and
//! UR_UNINIT_READ (FindUninitializedGet, see `uninit`).
mod reads;
mod uninit;

use super::Context;
use tree_sitter::Node;

pub fn values<'a>(context: &Context<'a>, declared: &[Node<'a>]) {
    reads::reads(context);
    for class in declared {
        uninit::uninitialized(context, *class);
    }
}
