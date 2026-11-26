mod layout;
mod method;
mod paragraph;
mod summary;
mod tags;

use super::comments::Comment;
use super::javadoc::JNode;
use super::report::{JAVADOC, Report};
use crate::engine::source::SourceFile;
use tree_sitter::Node;

pub struct Doc<'a> {
    pub file: &'a SourceFile,
    pub comment: &'a Comment,
    pub root: &'a JNode,
    pub declaration: Node<'a>,
}

impl Doc<'_> {
    pub fn block_tags(&self) -> impl Iterator<Item = &JNode> {
        self.root
            .children
            .iter()
            .filter(|node| node.kind == "JAVADOC_BLOCK_TAG")
            .filter_map(|node| node.children.first())
    }
    pub fn last_line(&self) -> usize {
        self.comment.line + self.comment.body.matches('\n').count()
    }
}

pub fn tag_name(tag: &JNode) -> &str {
    tag.first("TAG_NAME").map_or("", |name| name.text.as_str())
}

pub fn source(check: &str) -> String {
    format!("{JAVADOC}{check}Check")
}

pub fn check(doc: &Doc, report: &mut Report) {
    layout::check(doc, report);
    tags::check(doc, report);
    summary::check(doc, report);
    paragraph::check(doc, report);
    method::check(doc, report);
}

/// Whether Checkstyle hangs the comment on the declaration, its modifiers or its type rather than deeper: a
/// declaration that starts with type parameters or a qualified type gets the comment on those nodes.
pub fn comment_on_declaration(declaration: Node) -> bool {
    let Some(first) = declaration.child(0) else {
        return true;
    };
    match first.kind() {
        "type_parameters" => false,
        "modifiers" => true,
        _ => !qualified(first),
    }
}

fn qualified(node: Node) -> bool {
    match node.kind() {
        "scoped_type_identifier" => true,
        "generic_type" | "array_type" => node.child(0).is_some_and(qualified),
        _ => false,
    }
}
