//! Patterns that follow a value: SR_NOT_CHECKED and RR_NOT_CHECKED (ReadReturnShouldBeChecked, see `reads`),
//! UR_UNINIT_READ (FindUninitializedGet, see `uninit`), HARD_CODE_PASSWORD and HARD_CODE_KEY (see `secrets`)
//! and EOS_BAD_END_OF_STREAM_CHECK (FindBadEndOfStreamCheck, see `streams`).
mod reads;
mod secrets;
mod streams;
mod uninit;

use super::Context;
use tree_sitter::Node;

pub fn values<'a>(context: &Context<'a>, declared: &[Node<'a>]) {
    reads::reads(context);
    for class in declared {
        uninit::uninitialized(context, *class);
    }
    secrets::secrets(context, declared);
    streams::streams(context, context.file.tree.root_node());
}
