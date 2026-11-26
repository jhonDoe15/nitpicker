use super::{Doc, source};
use crate::java::checkstyle::javadoc::{JNode, blank};
use crate::java::checkstyle::report::Report;
use regex::Regex;
use std::sync::OnceLock;

const FORBIDDEN: &str =
    "^@return the *|^This method returns |^A [{]@code [a-zA-Z0-9]+[}]( is a )|^[a-z]";

fn forbidden() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(FORBIDDEN).expect("pattern"))
}

fn inline_name(node: &JNode) -> Option<&str> {
    (node.kind == "JAVADOC_INLINE_TAG").then(|| super::tag_name(&node.children[0]))
}

pub fn check(doc: &Doc, report: &mut Report) {
    let nodes: Vec<&JNode> = doc
        .root
        .children
        .iter()
        .take_while(|node| node.kind != "JAVADOC_BLOCK_TAG")
        .collect();
    let first = nodes.iter().find(|node| !blank(node));
    let rule = source("SummaryJavadoc");
    let mut say = |message: &str| {
        report.at(
            doc.root.line,
            Some(doc.root.col),
            &rule,
            message.to_string(),
        )
    };
    if first.is_some_and(|node| inline_name(node) == Some("inheritDoc")) {
        return;
    }
    if let Some(summary) = nodes
        .iter()
        .find(|node| inline_name(node) == Some("summary"))
    {
        let text = raw(&summary.children[0].children, true);
        if !text.trim_end().ends_with('.') {
            say("Summary of Javadoc is missing an ending period.");
        } else if forbidden().is_match(text.trim_start()) {
            say("Forbidden summary fragment.");
        }
        return;
    }
    if let Some(node) = first.filter(|node| inline_name(node) == Some("return")) {
        if forbidden().is_match(raw(&node.children[0].children, true).trim_start()) {
            say("Forbidden summary fragment.");
        }
        return;
    }
    let mut text = String::new();
    summary_text(&nodes, &mut text);
    if text.trim().is_empty() {
        say("Summary javadoc is missing.");
        return;
    }
    if sentence_end(&text).is_none() && !(text.contains('.') && period_later(doc.root)) {
        say("First sentence of Javadoc is missing an ending period.");
        return;
    }
    let owned: Vec<JNode> = nodes.iter().map(|node| (*node).clone()).collect();
    let all = raw(&owned, false);
    let sentence = sentence_end(&all).map_or(all.as_str(), |end| &all[..end]);
    if forbidden().is_match(sentence.trim_start()) {
        say("Forbidden summary fragment.");
    }
}

/// Text of the summary: the top-level text, plus the direct text of an HTML element that comes before any text.
fn summary_text(nodes: &[&JNode], out: &mut String) {
    for node in nodes {
        match node.kind {
            "TEXT" => out.push_str(&node.text),
            "NEWLINE" => out.push('\n'),
            "HTML_ELEMENT" if out.trim().is_empty() => {
                let Some(content) = node.first("HTML_CONTENT") else {
                    continue;
                };
                for child in &content.children {
                    match child.kind {
                        "TEXT" => out.push_str(&child.text),
                        "NEWLINE" => out.push('\n'),
                        _ => {}
                    }
                }
            }
            _ => {}
        }
    }
}

fn element_name(element: &JNode) -> &str {
    let Some(start) = element.children.first() else {
        return "";
    };
    let start = if start.kind == "VOID_ELEMENT" {
        start.children.first().unwrap_or(start)
    } else {
        start
    };
    let tag = if start.kind == "HTML_TAG_START" {
        start
    } else {
        start
    };
    tag.first("TAG_NAME").map_or("", |name| name.text.as_str())
}

fn sentence_end(text: &str) -> Option<usize> {
    let mut chars = text.char_indices().peekable();
    while let Some((at, c)) = chars.next() {
        if c == '.' && chars.peek().is_none_or(|(_, next)| next.is_whitespace()) {
            return Some(at + 1);
        }
    }
    None
}

/// Source text of nodes without leading asterisks; inline tags keep their braces unless `inner` is set for the
/// content of one inline tag.
fn raw(nodes: &[JNode], inner: bool) -> String {
    let mut out = String::new();
    for node in nodes {
        if inner
            && matches!(
                node.kind,
                "JAVADOC_INLINE_TAG_START" | "JAVADOC_INLINE_TAG_END" | "TAG_NAME"
            )
        {
            continue;
        }
        raw_into(node, &mut out);
    }
    out
}

fn raw_into(node: &JNode, out: &mut String) {
    match node.kind {
        "LEADING_ASTERISK" => {}
        _ if node.children.is_empty() => out.push_str(&node.text),
        _ => node.children.iter().for_each(|child| raw_into(child, out)),
    }
}

/// Whether a sentence end follows the first period anywhere in the text of the whole comment.
fn period_later(root: &JNode) -> bool {
    let mut text = String::new();
    all_text(root, &mut text);
    text.find('.')
        .is_some_and(|at| sentence_end(&text[at + 1..]).is_some())
}

fn all_text(node: &JNode, out: &mut String) {
    match node.kind {
        "TEXT" => out.push_str(&node.text),
        "NEWLINE" => out.push('\n'),
        "JAVADOC_INLINE_TAG" | "HTML_COMMENT" | "HTML_TAG_START" | "HTML_TAG_END"
        | "VOID_ELEMENT" => {}
        _ => node.children.iter().for_each(|child| all_text(child, out)),
    }
}
