//! The heuristics that drop a suggested change in ArgumentSelectionDefectChecker, and the comment matching they use.
use super::Context;
use super::argsel::{Changes, Invocation};
use super::argsel_algo::split_to_lowercase_terms;
use super::comments::{Comment, Commented, find_comments, text_of_comment};
use super::hierarchy::{declared_method, formals, super_methods};
use crate::engine::source::{ancestor, children, named_children, parent, walk};
use crate::java::types::expr::Call;
use regex::Regex;
use std::sync::LazyLock;
use tree_sitter::Node;

static LOW_INFORMATION: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(?:[a-z][a-z]?[0-9]*|arg[0-9]|value|key|label|param[0-9]|str[0-9])$").unwrap());
static PARAMETER_COMMENT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\s*([\p{L}_$][\p{L}\p{N}_$]*)(\.\.\.)?\s*=\s*$").unwrap());

const REVERSE_WORDS: [&str; 21] = [
    "backward", "backwards", "complement", "endian", "flip", "inverse", "invert", "landscape", "opposite", "portrait", "reciprocal", "reverse", "reversed",
    "rotate", "rotated", "rotation", "swap", "swapped", "transpose", "transposed", "undo",
];

const THRESHOLD: f64 = 0.6;

/// None of the formals of the change has a name that says too little to trust.
pub fn names_say_enough(invocation: &Invocation, changes: &Changes) -> bool {
    changes.pairs.iter().all(|(formal, _)| !LOW_INFORMATION.is_match(&invocation.formal_names[*formal]))
}

pub fn improves_enough(changes: &Changes) -> bool {
    changes.original.iter().sum::<f64>() - changes.assigned.iter().sum::<f64>() >= THRESHOLD * changes.pairs.len() as f64
}

/// The call is not inside a method or class whose name is about reversing things.
pub fn not_in_reverse(context: &Context, node: Node) -> bool {
    let mut at = Some(node);
    while let Some(current) = at {
        let named = match current.kind() {
            "method_declaration" | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration" => {
                current.child_by_field_name("name")
            }
            _ => None,
        };
        if let Some(name) = named {
            if split_to_lowercase_terms(context.text(name)).iter().any(|term| REVERSE_WORDS.contains(&term.as_str())) {
                return false;
            }
        }
        at = parent(current);
    }
    true
}

/// The source of an expression with its comments and spacing left out: what Error Prone compares by `toString`.
pub fn tokens(context: &Context, node: Node) -> Vec<String> {
    let mut parts = Vec::new();
    walk(node, |part| {
        let leaf = part.child_count() == 0 || matches!(part.kind(), "string_literal" | "character_literal" | "text_block");
        if leaf && !part.kind().ends_with("comment") && part.end_byte() > part.start_byte() && !parent(part).is_some_and(|holder| matches!(holder.kind(), "string_literal" | "character_literal" | "text_block")) {
            parts.push(context.text(part).to_string());
        }
    });
    parts
}

fn same_call(call: &Call, other: &Call) -> bool {
    call.declaring == other.declaring && call.method.name == other.method.name && call.method.parameters == other.method.parameters
}

fn call_of(context: &Context, node: Node) -> Option<Call> {
    match node.kind() {
        "method_invocation" => context.resolver.resolve_call(node),
        _ => context.resolver.call_formals(node).map(|(call, _)| call),
    }
}

fn parameter_names(context: &Context, method: Node) -> Vec<String> {
    formals(method)
        .into_iter()
        .filter_map(|parameter| {
            let holder = if parameter.kind() == "spread_parameter" { children(parameter).into_iter().find(|part| part.kind() == "variable_declarator")? } else { parameter };
            holder.child_by_field_name("name").map(|name| context.text(name).to_string())
        })
        .collect()
}

fn argument_nodes(node: Node) -> Vec<Node> {
    node.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

/// Whether a change would give another call of the method, or a declaration of it, an argument it already has there.
pub fn creates_no_duplicate(context: &Context, invocation: &Invocation, changes: &Changes) -> bool {
    let kinds = ["method_declaration", "constructor_declaration", "compact_constructor_declaration"];
    let enclosing = ancestor(invocation.node, &kinds).or_else(|| ancestor(invocation.node, &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration", "class_body"]));
    let Some(enclosing) = enclosing else { return true };
    let mut others: Vec<Vec<Vec<String>>> = Vec::new();
    let called = &invocation.call;
    walk(enclosing, |part| match part.kind() {
        "method_invocation" | "object_creation_expression" | "explicit_constructor_invocation" | "enum_constant" if part.id() != invocation.node.id() => {
            if call_of(context, part).is_some_and(|found| same_call(called, &found)) {
                others.push(argument_nodes(part).into_iter().map(|argument| tokens(context, argument)).collect());
            }
        }
        "method_declaration" | "constructor_declaration" => {
            let Some((origin, method)) = declared_method(context, part) else { return };
            let own = origin.name == called.declaring && method.name == called.method.name && method.parameters == called.method.parameters;
            let supers = super_methods(context.resolver.index, origin, method);
            let above = supers.iter().any(|(owner, other)| owner.name == called.declaring && other.name == called.method.name && other.parameters == called.method.parameters);
            if (own || above) && part.id() != invocation.node.id() {
                others.push(parameter_names(context, part).into_iter().map(|name| vec![name]).collect());
            }
        }
        _ => {}
    });
    others.iter().all(|arguments| {
        changes.pairs.iter().all(|(formal, actual)| arguments.get(*formal).is_none_or(|other| *other != tokens(context, invocation.actuals[*actual])))
    })
}

fn is_block(comment: &Comment) -> bool {
    comment.text.starts_with("/*") && !(comment.text.starts_with("/**") && !comment.text.starts_with("/**/"))
}

fn approximate(comment: &Comment, formal: &str) -> bool {
    let line = comment.text.starts_with("//") && !comment.text.starts_with("///");
    if !is_block(comment) && !line {
        return false;
    }
    let text = text_of_comment(comment);
    let matches = text.split(|part: char| !part.is_ascii_alphanumeric() && part != '_').any(|word| word == formal);
    let length = text.encode_utf16().count();
    let too_long = length > formal.encode_utf16().count() + 5 && length > 50;
    let markup = text.chars().filter(|part| "-*!@<>".contains(*part)).count() > 5;
    matches && !too_long && !markup
}

#[derive(PartialEq)]
enum Match {
    Exact,
    Approximate,
    Other,
}

fn match_comment(commented: &Commented, formal: &str) -> Match {
    if let Some(last) = commented.before.iter().rfind(|comment| is_block(comment)) {
        if let Some(found) = PARAMETER_COMMENT.captures(&text_of_comment(last)) {
            return if &found[1] == formal { Match::Exact } else { Match::Other };
        }
    }
    let found = commented.before.iter().chain(commented.after.iter()).find(|comment| approximate(comment, formal));
    match found {
        Some(comment) => {
            let text = text_of_comment(comment);
            let trimmed = text.trim().trim_end_matches(['=', ':']);
            if trimmed == formal { Match::Exact } else { Match::Approximate }
        }
        None => Match::Other,
    }
}

/// None of the arguments to change says in a comment which parameter it is for.
pub fn not_named_by_comment(context: &Context, invocation: &Invocation, changes: &Changes) -> bool {
    let comments = find_comments(context, invocation.node, &invocation.arguments, invocation.comment_start);
    changes.pairs.iter().all(|(formal, _)| {
        let found = comments.get(*formal).map_or(Match::Other, |commented| match_comment(commented, &invocation.formal_names[*formal]));
        found == Match::Other
    })
}
