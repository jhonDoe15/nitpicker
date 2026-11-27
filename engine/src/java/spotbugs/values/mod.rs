//! Patterns that follow a value: SR_NOT_CHECKED and RR_NOT_CHECKED (ReadReturnShouldBeChecked, see `reads`) and
//! UR_UNINIT_READ (FindUninitializedGet, see `uninit`), HARD_CODE_PASSWORD and HARD_CODE_KEY (see `secrets`), and
//! UC_USELESS_CONDITION and UC_USELESS_CONDITION_TYPE (RedundantConditions, see `conditions`).
mod conditions;
mod reads;
mod secrets;
mod uninit;

use super::Context;
use tree_sitter::Node;

pub fn values<'a>(context: &Context<'a>, declared: &[Node<'a>]) {
    reads::reads(context);
    for class in declared {
        uninit::uninitialized(context, *class);
        conditions::conditions(context, *class);
    }
    secrets::secrets(context, declared);
}
