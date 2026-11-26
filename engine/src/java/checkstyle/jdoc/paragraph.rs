use super::{Doc, source};
use crate::java::checkstyle::javadoc::{JNode, blank};
use crate::java::checkstyle::report::Report;

const BLOCK: [&str; 15] = [
    "address",
    "blockquote",
    "div",
    "dl",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "ol",
    "p",
    "pre",
    "table",
    "ul",
];

fn name(element: &JNode) -> &str {
    element
        .children
        .first()
        .and_then(|start| start.first("TAG_NAME"))
        .map_or("", |name| name.text.as_str())
}

fn opened(node: &JNode) -> bool {
    node.kind == "HTML_ELEMENT"
        && node
            .children
            .first()
            .is_some_and(|start| start.kind == "HTML_TAG_START")
}

fn closed(node: &JNode) -> bool {
    node.children
        .last()
        .is_some_and(|end| end.kind == "HTML_TAG_END")
}

fn paragraph(node: &JNode) -> bool {
    opened(node) && name(node).eq_ignore_ascii_case("p")
}

fn content(node: &JNode) -> Vec<&JNode> {
    let mut nodes = Vec::new();
    for child in node
        .children
        .iter()
        .skip(1)
        .filter(|child| child.kind != "HTML_TAG_END")
    {
        match child.kind {
            "HTML_CONTENT" => nodes.extend(&child.children),
            _ => nodes.push(child),
        }
    }
    nodes
}

fn following<'a>(node: &'a JNode, rest: &'a [JNode]) -> Vec<&'a JNode> {
    let mut nodes = content(node);
    if closed(node) {
        nodes.push(node.children.last().expect("end tag"));
    } else {
        nodes.extend(rest);
    }
    nodes.retain(|node| node.kind != "HTML_COMMENT");
    nodes
}

fn starts_word(nodes: &[&JNode]) -> bool {
    match nodes.first() {
        None => false,
        Some(node) if node.kind == "NEWLINE" => false,
        Some(node) => !(node.kind == "TEXT" && node.text.starts_with(' ')),
    }
}

fn block_after<'a>(nodes: &[&'a JNode]) -> Option<&'a str> {
    let next = nodes.iter().find(|node| !blank(node))?;
    (opened(next) && closed(next) && BLOCK.contains(&name(next))).then(|| name(next))
}

fn empty_line_before(nodes: &[JNode]) -> bool {
    let nodes: Vec<&JNode> = nodes.iter().collect();
    let Some(newline) = nodes.iter().rposition(|node| node.kind == "NEWLINE") else {
        return false;
    };
    empty_line_ending(&nodes, newline)
}

fn empty_line_ending(nodes: &[&JNode], newline: usize) -> bool {
    let mut at = newline;
    while at > 0 && nodes[at - 1].kind == "TEXT" && blank(nodes[at - 1]) {
        at -= 1;
    }
    at > 0 && nodes[at - 1].kind == "LEADING_ASTERISK"
}

pub fn check(doc: &Doc, report: &mut Report) {
    let rule = source("JavadocParagraph");
    let nodes = &doc.root.children;
    let mut written = false;
    for (at, node) in nodes.iter().enumerate() {
        if paragraph(node) {
            let tag = &node.children[0];
            let mut say = |message: String| report.at(tag.line, Some(tag.col), &rule, message);
            if !written {
                say("Redundant <p> tag.".to_string());
            } else if !empty_line_before(&nodes[..at]) {
                say("<p> tag should be preceded with an empty line.".to_string());
            }
            let after = following(node, &nodes[at + 1..]);
            if !starts_word(&after) {
                say("<p> tag should be placed immediately before the first word, with no space after.".to_string());
            }
            if let Some(block) = block_after(&after) {
                say(format!(
                    "<p> tag should not precede HTML block-tag '<{block}>', <p> tag should be removed."
                ));
            }
        }
        written |= !blank(node);
    }
    empty_lines(nodes, report, &rule);
}

fn empty_lines(nodes: &[JNode], report: &mut Report, rule: &str) {
    let mut flat: Vec<&JNode> = Vec::new();
    flatten(nodes.iter(), &mut flat);
    empty_lines_in(&flat, report, rule);
    for node in nodes {
        node.visit(&mut |node| {
            if opened(node) && !closed(node) {
                let mut flat: Vec<&JNode> = Vec::new();
                flatten(content(node).into_iter(), &mut flat);
                empty_lines_in(&flat, report, rule);
            }
        });
    }
}

fn empty_lines_in(flat: &[&JNode], report: &mut Report, rule: &str) {
    for (at, node) in flat.iter().enumerate() {
        if node.kind != "NEWLINE" || !empty_line_ending(flat, at) {
            continue;
        }
        let next = flat[at + 1..].iter().find(|node| !blank(node));
        if next.is_some_and(|next| next.kind == "TEXT") {
            let message = "Empty line should be followed by <p> tag on the next line.".to_string();
            report.at(node.line, Some(node.col), rule, message);
        }
    }
}

fn flatten<'a>(nodes: impl Iterator<Item = &'a JNode>, flat: &mut Vec<&'a JNode>) {
    for node in nodes {
        flat.push(node);
        if opened(node) && !closed(node) {
            flatten(content(node).into_iter(), flat);
        }
    }
}
