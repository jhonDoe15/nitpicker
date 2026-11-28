//! Error Prone's `Comments.findCommentsForArguments`: the comments that sit before and after each argument of a call.
use super::Context;
use crate::engine::source::{children, named_children, parent};
use regex::Regex;
use std::sync::LazyLock;
use tree_sitter::Node;

#[derive(Clone, Debug)]
pub struct Comment {
    pub pos: usize,
    pub end: usize,
    pub text: String,
}

#[derive(Default, Clone, Debug)]
pub struct Commented {
    pub before: Vec<Comment>,
    pub after: Vec<Comment>,
}

pub(super) struct Token {
    pub(super) pos: usize,
    pub(super) end: usize,
    pub(super) comma: bool,
    pub(super) comments: Vec<Comment>,
}

static BLOCK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*/\*\s*(.*?)\s*\*/\s*").unwrap());
static JAVADOC: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*/\*\*\s*(.*?)\s*\*/\s*").unwrap());
static LINE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*//\s*").unwrap());
static JAVADOC_LINE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*///\s*").unwrap());

/// The text of a comment without its delimiters, as `Comments.getTextFromComment` gives it.
pub fn text_of_comment(comment: &Comment) -> String {
    let text = comment.text.as_str();
    if text.starts_with("///") {
        JAVADOC_LINE.replace(text, "").to_string()
    } else if text.starts_with("//") {
        LINE.replace(text, "").to_string()
    } else if text.starts_with("/**") && !text.starts_with("/**/") {
        JAVADOC.replace(text, "$1").to_string()
    } else {
        BLOCK.replace(text, "$1").to_string()
    }
}

fn collect<'t>(node: Node<'t>, from: usize, to: usize, out: &mut Vec<Node<'t>>) {
    if node.end_byte() <= from || node.start_byte() >= to {
        return;
    }
    let leaf = node.child_count() == 0 || matches!(node.kind(), "string_literal" | "character_literal");
    if leaf {
        if node.start_byte() >= from && node.end_byte() <= to && node.end_byte() > node.start_byte() {
            out.push(node);
        }
        return;
    }
    for part in children(node) {
        collect(part, from, to, out);
    }
}

pub(super) fn tokenize(context: &Context, from: usize, to: usize) -> Vec<Token> {
    let mut leaves = Vec::new();
    collect(context.file.tree.root_node(), from, to, &mut leaves);
    leaves.sort_by_key(|leaf| leaf.start_byte());
    let mut tokens = Vec::new();
    let mut pending: Vec<Comment> = Vec::new();
    for leaf in leaves {
        if leaf.kind().ends_with("comment") {
            pending.push(Comment { pos: leaf.start_byte(), end: leaf.end_byte(), text: context.text(leaf).to_string() });
        } else {
            tokens.push(Token { pos: leaf.start_byte(), end: leaf.end_byte(), comma: leaf.kind() == ",", comments: std::mem::take(&mut pending) });
        }
    }
    tokens.push(Token { pos: to, end: to, comma: false, comments: pending });
    tokens
}

fn next_node_end(context: &Context, call: Node) -> Option<usize> {
    let mut predecessor = call;
    let mut at = Some(call);
    while let Some(node) = at {
        if matches!(node.kind(), "block" | "constructor_body" | "class_body" | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration") {
            break;
        }
        predecessor = node;
        at = parent(node);
    }
    let Some(enclosing) = at else { return parent(call).map(|up| up.end_byte()) };
    let members: Vec<Node> = if enclosing.kind() == "block" || enclosing.kind() == "constructor_body" {
        named_children(enclosing).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
    } else {
        let body = if enclosing.kind() == "class_body" { enclosing } else { enclosing.child_by_field_name("body").unwrap_or(enclosing) };
        let mut list = Vec::new();
        for part in named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")) {
            if part.kind() == "enum_body_declarations" {
                list.extend(named_children(part).into_iter().filter(|inner| !inner.kind().ends_with("comment")));
            } else {
                list.push(part);
            }
        }
        list
    };
    let _ = context;
    let position = members.iter().position(|member| *member == predecessor);
    match position.and_then(|at| members.get(at + 1)) {
        Some(next) => Some(next.end_byte()),
        None => Some(enclosing.end_byte()),
    }
}

fn compute_end(context: &Context, call: Node) -> usize {
    let end = call.end_byte();
    let text = &context.file.text;
    let Some(newline) = text[end..].find('\n').map(|at| end + at) else { return end };
    if !text[end..newline].contains('/') {
        return end;
    }
    let Some(next_end) = next_node_end(context, call) else { return end };
    let Some(holder) = parent(call) else { return next_end };
    let mut start_of_next: Option<usize> = None;
    crate::engine::source::walk(holder, |part| {
        if part.kind() == "method_invocation" || part.kind() == "explicit_constructor_invocation" {
            let start = part.start_byte();
            if end < start && start < next_end && start_of_next.is_none_or(|known| start < known) {
                start_of_next = Some(start);
            }
        }
    });
    start_of_next.unwrap_or(next_end)
}

#[derive(Clone, Copy, PartialEq)]
enum Position {
    Before,
    After,
    Any,
}

fn add(target: &mut Commented, comment: &Comment, node_position: usize, position: Position) {
    if comment.pos < node_position {
        if position != Position::After {
            target.before.push(comment.clone());
        }
    } else if position != Position::Before {
        target.after.push(comment.clone());
    }
}

/// The comments of each argument of a call. `start` is where the call's text for tokenizing begins.
pub fn find_comments(context: &Context, call: Node, arguments: &[Node], start: usize) -> Vec<Commented> {
    let mut results: Vec<Commented> = vec![Commented::default(); arguments.len()];
    if arguments.is_empty() {
        return results;
    }
    let end = compute_end(context, call);
    if end <= start || !context.file.text[start..end].contains('/') {
        return results;
    }
    let invocation_end = call.end_byte();
    let exclude: Vec<(usize, usize)> = arguments.iter().map(|argument| (argument.start_byte(), argument.end_byte())).collect();
    let tokens = tokenize(context, start, end);
    let line = |at: usize| context.line_of(at) as i64;
    let mut track = Tracker { next: 0, current: None, previous: None, current_start: usize::MAX, current_end: 0, previous_start: usize::MAX };
    track.advance(arguments);
    let (mut on_line, mut current_line, mut previous_empty) = (0usize, -1i64, true);
    for token in &tokens {
        let at = line(token.pos);
        if at != current_line {
            current_line = at;
            previous_empty = on_line == 0;
            on_line = 0;
        } else {
            on_line += 1;
        }
        if on_line == 0 && !previous_empty {
            for comment in &token.comments {
                if exclude.iter().any(|(from, to)| comment.pos <= *to && comment.end > *from) {
                    continue;
                }
                let previous_line = line(comment.pos) == current_line - 1;
                let previous_on_previous_line = track.previous_start != usize::MAX && line(track.previous_start) == line(track.current_start) - 1;
                if previous_line && token.pos <= track.current_start && previous_on_previous_line {
                    if let Some(index) = track.previous {
                        add(&mut results[index], comment, track.previous_start, Position::Any);
                    }
                } else if comment.pos <= invocation_end || line(comment.pos) <= line(track.current_end) {
                    if let Some(index) = track.current {
                        add(&mut results[index], comment, track.current_start, Position::Any);
                    }
                }
            }
        } else if let Some(index) = track.current {
            if token.pos == track.current_start {
                for comment in &token.comments {
                    add(&mut results[index], comment, track.current_start, Position::Before);
                }
            }
            if token.end > track.current_end {
                for comment in &token.comments {
                    add(&mut results[index], comment, track.current_start, Position::After);
                }
            }
        }
        if token.pos >= track.current_end && token.comma {
            if track.next >= arguments.len() {
                break;
            }
            track.advance(arguments);
        }
    }
    results
}

struct Tracker {
    next: usize,
    current: Option<usize>,
    previous: Option<usize>,
    current_start: usize,
    current_end: usize,
    previous_start: usize,
}

impl Tracker {
    fn advance(&mut self, arguments: &[Node]) {
        let argument = arguments[self.next];
        self.current_end = argument.end_byte();
        self.previous_start = self.current_start;
        self.current_start = argument.start_byte();
        self.previous = self.current;
        self.current = Some(self.next);
        self.next += 1;
    }
}
