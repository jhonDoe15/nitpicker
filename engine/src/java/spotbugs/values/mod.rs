//! Patterns that follow a value: SR_NOT_CHECKED and RR_NOT_CHECKED (ReadReturnShouldBeChecked, see `reads`) and
//! UR_UNINIT_READ (FindUninitializedGet, see `uninit`), and HARD_CODE_PASSWORD and HARD_CODE_KEY (see `secrets`).
mod reads;
mod secrets;
mod uninit;

use super::Context;
use tree_sitter::Node;

pub fn values<'a>(context: &Context<'a>, declared: &[Node<'a>]) {
    reads::reads(context);
    for class in declared {
        uninit::uninitialized(context, *class);
    }
    secrets::secrets(context, declared);
}
