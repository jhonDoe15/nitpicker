//! ParameterName: `/* name= */` comments on arguments whose name or format does not match the formal parameter.
use super::Context;
use super::comments::{Comment, tokenize};
use super::fixes::Fix;
use super::identifier_data::{IDENTIFIER_PART, IDENTIFIER_START};
use super::nodes::position;
use crate::engine::source::named_children;
use tree_sitter::Node;

fn in_table(table: &[(u32, u32)], at: char) -> bool {
    let code = at as u32;
    table.binary_search_by(|&(low, high)| if code < low { std::cmp::Ordering::Greater } else if code > high { std::cmp::Ordering::Less } else { std::cmp::Ordering::Equal }).is_ok()
}

fn space(at: char) -> bool {
    matches!(at, ' ' | '\t' | '\n' | '\x0B' | '\x0C' | '\r')
}

/// `Comments.getTextFromComment` for a comment as javac 21 styles it: `//` is a line comment, `/**` a javadoc block.
fn comment_text(comment: &Comment) -> String {
    let text = comment.text.as_str();
    if let Some(rest) = text.strip_prefix("//") {
        return rest.trim_start_matches(space).to_string();
    }
    let opening = if text.starts_with("/**") && !text.starts_with("/**/") { 3 } else { 2 };
    let Some(rest) = text.get(opening..) else { return text.to_string() };
    let Some(close) = rest.find("*/") else { return text.to_string() };
    let content = rest[..close].trim_matches(space);
    if content.contains(['\n', '\r', '\u{85}', '\u{2028}', '\u{2029}']) {
        return text.to_string();
    }
    format!("{content}{}", rest[close + 2..].trim_start_matches(space))
}

/// The groups of Error Prone's `PARAMETER_COMMENT_PATTERN`, matched against the whole text: the name and whether `...` follows it.
fn parameter_comment(text: &str) -> Option<(&str, bool)> {
    let text = text.trim_start_matches(space);
    let mut chars = text.char_indices();
    let (_, first) = chars.next()?;
    if !in_table(IDENTIFIER_START, first) {
        return None;
    }
    let end = chars.find(|(_, at)| !in_table(IDENTIFIER_PART, *at)).map_or(text.len(), |(at, _)| at);
    let (name, rest) = text.split_at(end);
    let (dots, rest) = match rest.strip_prefix("...") {
        Some(after) => (true, after),
        None => (false, rest),
    };
    let rest = rest.trim_start_matches(space).strip_prefix('=')?;
    rest.trim_start_matches(space).is_empty().then_some((name, dots))
}

fn synthetic(name: &str) -> bool {
    ["arg", "this$", "x"].iter().any(|start| name.strip_prefix(start).is_some_and(|rest| !rest.is_empty() && rest.chars().all(|digit| digit.is_ascii_digit())))
}

fn rewrite(comment: &Comment, text: String) -> Fix {
    Fix::replace(comment.pos, comment.end, text)
}

/// The first token inside `argument` when tokenizing from `start`, with its comments.
fn first_comments(context: &Context, start: usize, argument: Node) -> Vec<Comment> {
    let tokens = tokenize(context, start, argument.end_byte());
    match tokens.into_iter().find(|token| token.pos >= argument.start_byte()) {
        Some(token) if token.pos < argument.end_byte() => token.comments,
        _ => Vec::new(),
    }
}

fn argument_list_start(node: Node) -> Option<usize> {
    match node.kind() {
        "method_invocation" => Some(node.child_by_field_name("name")?.end_byte()),
        "object_creation_expression" => Some(node.child_by_field_name("type")?.end_byte()),
        "explicit_constructor_invocation" => Some(node.child_by_field_name("constructor")?.end_byte()),
        _ => None,
    }
}

pub fn parameter_name(context: &Context, node: Node) {
    if !matches!(node.kind(), "method_invocation" | "object_creation_expression" | "explicit_constructor_invocation") {
        return;
    }
    let Some(list) = node.child_by_field_name("arguments") else { return };
    let arguments: Vec<Node> = named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    if arguments.is_empty() || !context.file.text[node.start_byte()..node.end_byte()].contains('/') {
        return;
    }
    let Some(mut start) = argument_list_start(node) else { return };
    let Some((resolved, _)) = context.resolver.call_formals(node) else { return };
    let method = &resolved.method;
    let names = &method.names;
    if names.is_empty() || names.iter().any(|name| synthetic(name)) {
        return;
    }
    let mut position_of = arguments.iter();
    for (at, name) in names.iter().enumerate() {
        let Some(argument) = position_of.next() else { return };
        let comments = first_comments(context, start, *argument);
        start = argument.end_byte();
        check_argument(context, node, *argument, name, method.varargs && at + 1 == names.len(), &comments);
    }
    for argument in position_of {
        let comments = first_comments(context, start, *argument);
        start = argument.end_byte();
        check_comment(context, node, *argument, &comments);
    }
}

fn check_argument(context: &Context, call: Node, argument: Node, formal: &str, varargs: bool, comments: &[Comment]) {
    let mut found: Vec<(bool, bool, &Comment, String)> = Vec::new();
    for comment in comments {
        if comment.text.starts_with("//") {
            continue;
        }
        let text = comment_text(comment);
        let Some((name, dots)) = parameter_comment(&text) else { continue };
        let format_ok = varargs ^ !dots;
        let name = name.to_string();
        let name_ok = name == formal;
        if name_ok && format_ok {
            found.clear();
            break;
        }
        found.push((format_ok, name_ok, comment, name));
    }
    let template = if varargs { format!("/* {formal}...= */") } else { format!("/* {formal}= */") };
    for (format_ok, name_ok, comment, name) in found {
        let fix_comment = rewrite(comment, template.clone());
        let fix_regular = rewrite(comment, format!("/* {name} */"));
        let (message, fixes) = if format_ok && !name_ok {
            (format!("`{}` does not match formal parameter name `{formal}`; either fix the name or use a regular comment", comment.text), vec![fix_comment, fix_regular])
        } else if !format_ok && name_ok {
            (format!("parameter name comment `{}` uses incorrect format", comment.text), vec![fix_comment])
        } else {
            (format!("`{}` does not match formal parameter name `{formal}` and uses incorrect format; either fix the format or use a regular comment", comment.text), vec![fix_comment, fix_regular])
        };
        context.report_fixed("ParameterName", call, position(argument), &message, &fixes);
    }
}

fn check_comment(context: &Context, call: Node, argument: Node, comments: &[Comment]) {
    for comment in comments {
        let text = comment_text(comment);
        let Some((name, dots)) = parameter_comment(&text) else { continue };
        let fix = rewrite(comment, format!("/* {name}{} */", if dots { "..." } else { "" }));
        context.report_fixed("ParameterName", call, position(argument), "parameter name comment only allowed on first varargs argument", &[fix]);
    }
}
