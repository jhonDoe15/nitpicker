//! Checks about where doc comments stand: NotJavadoc, AlmostJavadoc. Like Error Prone they read the comments
//! before each token of the file, and a declaration owns the comments before its first token.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::{children, parent, walk};
use regex::Regex;
use std::collections::HashMap;
use std::sync::LazyLock;
use tree_sitter::Node;

const TYPES: &[&str] = &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];
const METHODS: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "annotation_type_element_declaration"];
const BODIES: &[&str] = &["class_body", "interface_body", "enum_body", "enum_body_declarations", "annotation_type_body"];

#[derive(Clone, Copy, PartialEq)]
enum Seeming {
    Class,
    Method,
    Component,
}

/// The comments before each token, by the token's offset.
fn comments_by_token<'t>(context: &Context, root: Node<'t>) -> Vec<(usize, Vec<Node<'t>>)> {
    let mut comments = Vec::new();
    walk(root, |node| {
        if matches!(node.kind(), "line_comment" | "block_comment") {
            comments.push(node);
        }
    });
    comments.sort_by_key(Node::start_byte);
    let text = context.file.text.as_bytes();
    let mut groups: Vec<(usize, Vec<Node>)> = Vec::new();
    let mut at = 0usize;
    while at < comments.len() {
        let mut group = vec![comments[at]];
        let mut end = comments[at].end_byte();
        at += 1;
        let token = loop {
            let mut next = end;
            while next < text.len() && text[next].is_ascii_whitespace() {
                next += 1;
            }
            match comments.get(at) {
                Some(comment) if comment.start_byte() == next => {
                    group.push(*comment);
                    end = comment.end_byte();
                    at += 1;
                }
                _ => break next,
            }
        };
        groups.push((token, group));
    }
    groups
}

/// Whether a class may carry a doc comment: it is not local, not anonymous, and not inside one that is.
fn documentable_class(node: Node) -> bool {
    let mut current = parent(node);
    while let Some(at) = current {
        if !(TYPES.contains(&at.kind()) || BODIES.contains(&at.kind()) || at.kind() == "program") {
            return false;
        }
        current = parent(at);
    }
    true
}

fn enclosing_class(node: Node) -> Option<Node> {
    let mut current = parent(node);
    while let Some(at) = current {
        if TYPES.contains(&at.kind()) {
            return Some(at);
        }
        if !BODIES.contains(&at.kind()) {
            return None;
        }
        current = parent(at);
    }
    None
}

/// The declarations a doc comment belongs to, by where javac says they start.
fn documentable(root: Node) -> HashMap<usize, Node> {
    let mut out = HashMap::new();
    walk(root, |node| {
        let kind = node.kind();
        let owned = match kind {
            "package_declaration" | "module_declaration" => true,
            _ if TYPES.contains(&kind) => documentable_class(node),
            _ if METHODS.contains(&kind) || matches!(kind, "field_declaration" | "constant_declaration" | "enum_constant") => {
                enclosing_class(node).is_some_and(documentable_class)
            }
            _ => false,
        };
        if owned {
            out.insert(node.start_byte(), node);
        }
    });
    out
}

/// Classes, methods and record components anywhere, by start. A class that is not a record or interface, has no
/// modifiers and declares no constructor gets one from javac at the same place, so the place counts as a method.
fn seemingly_documentable(text: &str, root: Node) -> HashMap<usize, Seeming> {
    let mut out = HashMap::new();
    walk(root, |node| {
        let kind = node.kind();
        if TYPES.contains(&kind) {
            out.insert(node.start_byte(), Seeming::Class);
            if matches!(kind, "class_declaration" | "enum_declaration" | "record_declaration") && !declares_constructor(text, node) {
                let keyword = children(node).into_iter().find(|part| matches!(part.kind(), "class" | "enum" | "record"));
                out.insert(keyword.map_or(node.start_byte(), |keyword| keyword.start_byte()), Seeming::Method);
            }
        } else if METHODS.contains(&kind) {
            out.insert(node.start_byte(), Seeming::Method);
        } else if kind == "formal_parameter" && parent(node).and_then(parent).is_some_and(|owner| owner.kind() == "record_declaration") {
            out.insert(node.start_byte(), Seeming::Component);
        }
    });
    out
}

/// Whether javac finds the constructor it would otherwise add: any constructor of a class or enum, the canonical one
/// of a record (compact, or with the components' types).
fn declares_constructor(text: &str, declaration: Node) -> bool {
    let Some(body) = declaration.child_by_field_name("body") else { return false };
    let members = children(body).into_iter().flat_map(|member| if member.kind() == "enum_body_declarations" { children(member) } else { vec![member] });
    let mut constructors = members.filter(|member| matches!(member.kind(), "constructor_declaration" | "compact_constructor_declaration"));
    if declaration.kind() != "record_declaration" {
        return constructors.next().is_some();
    }
    let types = |list: Option<Node>| -> Vec<String> {
        let parameters = list.map(children).unwrap_or_default();
        parameters
            .into_iter()
            .filter(|parameter| matches!(parameter.kind(), "formal_parameter" | "spread_parameter"))
            .map(|parameter| {
                let written = parameter.child_by_field_name("type").or_else(|| children(parameter).into_iter().find(|part| part.kind().ends_with("type") || part.kind() == "type_identifier"));
                written.map(|written| text[written.byte_range()].split_whitespace().collect::<String>()).unwrap_or_default()
            })
            .collect()
    };
    let components = types(declaration.child_by_field_name("parameters"));
    constructors.any(|constructor| constructor.kind() == "compact_constructor_declaration" || types(constructor.child_by_field_name("parameters")) == components)
}

fn is_doc(text: &str) -> bool {
    text.starts_with("/**")
}

pub fn not_javadoc(context: &Context, node: Node) {
    const CHECK: &str = "NotJavadoc";
    if node.kind() != "program" {
        return;
    }
    let owned = documentable(node);
    let seeming = seemingly_documentable(&context.file.text, node);
    for (token, comments) in comments_by_token(context, node) {
        let docs: Vec<Node> = comments.iter().copied().filter(|comment| is_doc(context.text(*comment))).collect();
        if docs.len() > 1 {
            context.report_always(CHECK, docs[0].start_byte(), "This element has multiple Javadoc comments; only the last one will be used.");
        }
        if owned.contains_key(&token) {
            continue;
        }
        for comment in docs {
            if context.text(comment) == "/**/" || context.suppressed(CHECK, comment) {
                continue;
            }
            let message = match seeming.get(&token) {
                Some(Seeming::Class) => {
                    "This comment is attached to a local class, but local classes cannot be documented with Javadoc. Please convert this to a \
                     regular comment."
                }
                Some(Seeming::Method) => {
                    "This comment is attached to a method inside a local class, but methods inside local classes cannot be documented with \
                     Javadoc. Please convert this to a regular comment."
                }
                Some(Seeming::Component) => {
                    "This comment seems to be attached to a record component, but record components cannot be documented with Javadoc. \
                     Please move this to an @param tag on the record class."
                }
                None => "Avoid using `/**` for comments which aren't actually Javadoc.",
            };
            let fixes = [not_javadoc_fix(context.text(comment), comment.start_byte())];
            context.report_fixed(CHECK, comment, comment.start_byte(), message, &fixes);
        }
    }
}

/// Error Prone's fix for a block comment starting with `/**`: one asterisk fewer, all the extra ones when there are more.
fn not_javadoc_fix(text: &str, start: usize) -> Fix {
    if !text.starts_with("/**") {
        return Fix::new();
    }
    let stars = text[2..].bytes().take_while(|byte| *byte == b'*').count();
    Fix::replace(start + 1, start + 1 + stars, "")
}

static HAS_TAG: LazyLock<Regex> = LazyLock::new(|| {
    let tags = [
        "code", "deprecated", "docRoot", "link", "linkplain", "literal", "see", "since", "snippet", "author", "inheritDoc", "param", "value", "version",
        "exception", "return", "serial", "throws", "serialData", "serialField",
    ];
    Regex::new(&format!("</(em|b|a|strong|i|pre|code)>|@({})", tags.join("|"))).expect("a pattern")
});

/// What Error Prone's fix for the comment is when it offers to turn it into a doc comment.
fn almost(text: &str, start: usize) -> Option<Fix> {
    if text.starts_with("/*") && !text.starts_with("/**") {
        return HAS_TAG.is_match(text).then(|| Fix::new().insert(start + 1, "*"));
    }
    if !(text.starts_with("//") && text.ends_with("*/") && HAS_TAG.is_match(text)) {
        return None;
    }
    if text.starts_with("// /**") {
        return Some(Fix::replace(start, start + 2, ""));
    }
    let mut end = 2;
    for character in text.chars().skip(2) {
        match character {
            '/' => return None,
            '*' | ' ' => end += 1,
            _ => break,
        }
    }
    Some(Fix::replace(start + 1, start + end, "**"))
}

pub fn almost_javadoc(context: &Context, node: Node) {
    const CHECK: &str = "AlmostJavadoc";
    if node.kind() != "program" {
        return;
    }
    let owned = documentable(node);
    for (token, comments) in comments_by_token(context, node) {
        let Some(declaration) = owned.get(&token) else { continue };
        if comments.iter().any(|comment| is_doc(context.text(*comment))) || context.suppressed(CHECK, *declaration) {
            continue;
        }
        for comment in comments {
            if let Some(fix) = almost(context.text(comment), comment.start_byte()) {
                let message = "This comment contains Javadoc or HTML tags, but isn't started with a double asterisk (/**); is it meant to be Javadoc?";
                context.report_fixed(CHECK, *declaration, comment.start_byte(), message, &[fix]);
            }
        }
    }
}
