//! ParameterComment: a comment that names a parameter but not in the `/* name= */` form.
use super::Context;
use super::comments::{find_comments, text_of_comment};
use super::fixes::Fix;
use crate::engine::source::named_children;
use regex::Regex;
use std::sync::LazyLock;
use tree_sitter::Node;

static TRAILING_EQUALS: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s*=\s*$").unwrap());

const MESSAGE: &str = "Non-standard parameter comment; prefer `/* paramName= */ arg`";

pub fn parameter_comment(context: &Context, node: Node) {
    let (arguments, start) = match node.kind() {
        "method_invocation" => {
            let Some(name) = node.child_by_field_name("name") else { return };
            (node.child_by_field_name("arguments"), name.end_byte())
        }
        "object_creation_expression" => (node.child_by_field_name("arguments"), node.start_byte()),
        "explicit_constructor_invocation" => {
            let Some(keyword) = node.child_by_field_name("constructor") else { return };
            (node.child_by_field_name("arguments"), keyword.end_byte())
        }
        _ => return,
    };
    let Some(list) = arguments else { return };
    let arguments: Vec<Node> = named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    if arguments.is_empty() || !has_slash(context, node) {
        return;
    }
    let Some((resolved, _)) = context.resolver.call_formals(node) else { return };
    let names = &resolved.method.names;
    if names.is_empty() {
        return;
    }
    let comments = find_comments(context, node, &arguments, start);
    let mut fix = Fix::new();
    let mut any = false;
    for (at, commented) in comments.iter().enumerate() {
        let Some(name) = names.get(at).or_else(|| names.last()) else { continue };
        if commented.before.iter().any(|comment| text_of_comment(comment).replace(' ', "") == format!("{name}=")) {
            continue;
        }
        let chosen = if commented.after.is_empty() { &commented.before } else { &commented.after };
        if let Some(comment) = chosen.iter().find(|comment| TRAILING_EQUALS.replace(&text_of_comment(comment), "") == name.as_str()) {
            let argument = arguments[at];
            fix = fix.insert(argument.start_byte(), format!("/* {name}= */ ")).and(comment.pos, comment.pos + comment.text.len(), "");
            any = true;
        }
    }
    if any {
        let position = if node.kind() != "object_creation_expression" { node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte()) } else { node.start_byte() };
        context.report_fixed("ParameterComment", node, position, MESSAGE, &[fix]);
    }
}

fn has_slash(context: &Context, node: Node) -> bool {
    let text = &context.file.text;
    let end = text[node.end_byte()..].find('\n').map_or(text.len(), |at| node.end_byte() + at);
    text[node.start_byte()..end].contains('/')
}
