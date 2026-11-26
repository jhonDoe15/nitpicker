use super::{Doc, source, tag_name};
use crate::java::checkstyle::javadoc::{JNode, blank};
use crate::java::checkstyle::report::Report;

const NON_EMPTY: &[&str] = &[
    "PARAM_BLOCK_TAG",
    "RETURN_BLOCK_TAG",
    "THROWS_BLOCK_TAG",
    "EXCEPTION_BLOCK_TAG",
    "DEPRECATED_BLOCK_TAG",
];
const ORDER: &[&str] = &["param", "return", "throws", "deprecated"];
const ORDER_TARGETS: &[&str] = &[
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "method_declaration",
    "constructor_declaration",
    "field_declaration",
    "constant_declaration",
    "record_declaration",
    "compact_constructor_declaration",
];

pub fn check(doc: &Doc, report: &mut Report) {
    for tag in doc.block_tags() {
        if NON_EMPTY.contains(&tag.kind) && description_empty(tag) {
            let text = "At-clause should have a non-empty description.".to_string();
            report.at(tag.line, None, &source("NonEmptyAtclauseDescription"), text);
        }
    }
    empty_line_before_tags(doc, report);
    if ORDER_TARGETS.contains(&doc.declaration.kind())
        && super::comment_on_declaration(doc.declaration)
    {
        let mut highest = 0;
        for tag in doc.block_tags() {
            let Some(rank) = ORDER.iter().position(|name| *name == tag_name(tag)) else {
                continue;
            };
            if rank < highest {
                let text = "Block tags have to appear in the order '[@param, @return, @throws, @deprecated]'.";
                report.at(tag.line, None, &source("AtclauseOrder"), text.to_string());
            }
            highest = highest.max(rank);
        }
    }
}

fn description_empty(tag: &JNode) -> bool {
    tag.first("DESCRIPTION").is_none_or(|description| {
        description.children.iter().all(|node| match node.kind {
            "TEXT" => node.text.trim().is_empty(),
            "NEWLINE" | "LEADING_ASTERISK" => true,
            _ => false,
        })
    })
}

fn empty_line_before_tags(doc: &Doc, report: &mut Report) {
    let children = &doc.root.children;
    let Some(at) = children
        .iter()
        .position(|node| node.kind == "JAVADOC_BLOCK_TAG")
    else {
        return;
    };
    let before = &children[..at];
    let newlines = before.iter().filter(|node| node.kind == "NEWLINE").count();
    let mut reversed = before.iter().rev().peekable();
    while reversed
        .next_if(|node| node.kind == "TEXT" && blank(node))
        .is_some()
    {}
    let asterisk = reversed
        .next_if(|node| node.kind == "LEADING_ASTERISK")
        .is_some();
    let empty_before = match reversed.next() {
        Some(node) if node.kind == "NEWLINE" => {
            let line: Vec<&JNode> = reversed.take_while(|node| node.kind != "NEWLINE").collect();
            if newlines == 1 {
                line.is_empty() && asterisk
            } else {
                line.iter().all(|node| blank(node))
            }
        }
        _ => false,
    };
    if !empty_before {
        let tag = &children[at].children[0];
        let text = format!(
            "Javadoc tag '@{}' should be preceded with an empty line.",
            tag_name(tag)
        );
        report.at(
            tag.line,
            None,
            &source("RequireEmptyLineBeforeBlockTagGroup"),
            text,
        );
    }
}
