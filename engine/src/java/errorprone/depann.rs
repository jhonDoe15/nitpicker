//! DepAnn: a declaration whose doc comment has `@deprecated` and that lacks `@Deprecated`.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::{children, parent};
use tree_sitter::Node;

const MESSAGE: &str = "Item documented with a @deprecated javadoc note is not annotated with @Deprecated";
const TYPES: &[&str] = &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];
const METHODS: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "annotation_type_element_declaration"];

/// Whether a line of the comment starts with `@deprecated`, the way javac decides to flag the declaration.
fn deprecated_tag(comment: &str) -> bool {
    let body = comment.strip_prefix("/**").unwrap_or(comment);
    body.split('\n').any(|line| {
        let line = line.trim_start_matches(|character: char| character.is_whitespace() || character == '*');
        line.strip_prefix("@deprecated").is_some_and(|rest| rest.chars().next().is_none_or(|next| next.is_whitespace() || next == '*'))
    })
}

pub fn dep_ann(context: &Context, node: Node) {
    let (declaration, at) = match node.kind() {
        kind if TYPES.contains(&kind) => {
            let keyword = children(node).into_iter().find(|part| matches!(part.kind(), "class" | "interface" | "enum" | "record" | "@interface"));
            (node, keyword.map(|word| word.start_byte()))
        }
        kind if METHODS.contains(&kind) => (node, node.child_by_field_name("name").map(|name| name.start_byte())),
        "enum_constant" => (node, node.child_by_field_name("name").map(|name| name.start_byte())),
        "variable_declarator" => match parent(node).filter(|holder| matches!(holder.kind(), "field_declaration" | "constant_declaration")) {
            Some(holder) => (holder, node.child_by_field_name("name").map(|name| name.start_byte())),
            None => return,
        },
        _ => return,
    };
    let Some(at) = at else { return };
    let Some(comment) = super::javadoc::comment_before(context, declaration) else { return };
    if !context.text(comment).contains("@deprecated") || !deprecated_tag(context.text(comment)) {
        return;
    }
    if context.resolver.annotation_names(declaration).iter().any(|name| name == "java.lang.Deprecated") {
        return;
    }
    let fix = Fix::new().insert(declaration.start_byte(), "@Deprecated\n");
    context.report_fixed("DepAnn", node, at, MESSAGE, &[fix]);
}
