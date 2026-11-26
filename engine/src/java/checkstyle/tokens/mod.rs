mod comments;
mod literals;

use super::report::Report;
use crate::engine::source::{SourceFile, walk};

pub fn check(file: &SourceFile, report: &mut Report) {
    let mut comments = Vec::new();
    walk(file.tree.root_node(), |node| {
        if matches!(node.kind(), "line_comment" | "block_comment") {
            comments.push(node);
        }
    });
    walk(file.tree.root_node(), |node| {
        comments::check(file, node, report);
        literals::check(file, node, &comments, report);
    });
}
