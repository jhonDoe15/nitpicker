//! ReturnFromVoid: a `@return` tag on a method that returns nothing.
use super::Context;
use super::doc::{Kind, Tree};
use super::fixes::Fix;
use super::javadoc::doc_of;
use tree_sitter::Node;

const MESSAGE: &str = "Void methods should not have a @return tag.";

pub fn return_from_void(context: &Context, method: Node) {
    if method.kind() != "method_declaration" || method.child_by_field_name("type").is_none_or(|kind| context.text(kind) != "void") {
        return;
    }
    let Some((comment, doc)) = doc_of(context, method) else { return };
    doc.visit(&mut |tree: &Tree, _| {
        if tree.name != "return" || !matches!(tree.kind, Kind::Block | Kind::Inline) {
            return;
        }
        let Some(at) = comment.source_pos(tree.pos) else { return };
        let fix = match (comment.source_pos(tree.pos), comment.source_pos(tree.end)) {
            (Some(start), Some(end)) => Fix::replace(start, end, ""),
            _ => Fix::new(),
        };
        context.report_fixed("ReturnFromVoid", method, at, MESSAGE, &[fix]);
    });
}
