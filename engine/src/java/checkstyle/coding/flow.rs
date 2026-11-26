use crate::engine::source::{SourceFile, children, named_children, walk};
use crate::java::checkstyle::report::Report;
use regex::Regex;
use std::sync::OnceLock;
use tree_sitter::Node;

const BLOCKS: &str = "com.puppycrawl.tools.checkstyle.checks.blocks.";
const CODING: &str = "com.puppycrawl.tools.checkstyle.checks.coding.";

pub fn check(file: &SourceFile, node: Node, report: &mut Report) {
    match node.kind() {
        "catch_clause" => empty_catch(file, node, report),
        "switch_block" => fall_through(file, node, report),
        _ => {}
    }
}

fn is_comment(node: &Node) -> bool {
    matches!(node.kind(), "line_comment" | "block_comment")
}

fn comment_content<'f>(file: &'f SourceFile, comment: Node) -> &'f str {
    let text = file.text_of(comment);
    if comment.kind() == "line_comment" {
        &text[2..]
    } else {
        text.get(2..text.len().saturating_sub(2).max(2))
            .unwrap_or("")
    }
}

fn empty_catch(file: &SourceFile, node: Node, report: &mut Report) {
    let Some(body) = node.child_by_field_name("body") else {
        return;
    };
    let parts: Vec<Node> = children(body)
        .into_iter()
        .filter(|part| !matches!(part.kind(), "{" | "}"))
        .collect();
    if parts.iter().any(|part| !is_comment(part)) {
        return;
    }
    let explained = parts.first().is_some_and(|comment| {
        comment_content(file, *comment)
            .bytes()
            .any(|b| b.is_ascii_alphanumeric() || b == b'_')
    });
    if !explained {
        report.node(
            body,
            &format!("{BLOCKS}EmptyCatchBlockCheck"),
            "Empty catch block.".to_string(),
        );
    }
}

fn relief() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new("falls?[ -]?thr(u|ough)").expect("pattern"))
}

fn fall_through(file: &SourceFile, node: Node, report: &mut Report) {
    let groups: Vec<Node> = children(node)
        .into_iter()
        .filter(|part| part.kind() == "switch_block_statement_group")
        .collect();
    let comments: Vec<Node> = {
        let mut found = Vec::new();
        walk(node, |part| {
            if is_comment(&part) {
                found.push(part)
            }
        });
        found
    };
    for pair in groups.windows(2) {
        let statements = group_statements(pair[0]);
        let Some(last) = statements.last() else {
            continue;
        };
        if terminated(*last, true, true) {
            continue;
        }
        let next = pair[1];
        let closest = comments
            .iter()
            .filter(|c| c.start_byte() >= last.end_byte() && c.end_byte() <= next.start_byte())
            .last();
        if closest.is_some_and(|comment| relief().is_match(comment_content(file, *comment))) {
            continue;
        }
        let message = "Fall through from previous branch of the switch statement.".to_string();
        report.node(next, &format!("{CODING}FallThroughCheck"), message);
    }
}

fn group_statements(group: Node) -> Vec<Node> {
    children(group)
        .into_iter()
        .filter(|part| !is_comment(part) && !matches!(part.kind(), "switch_label" | ":"))
        .collect()
}

fn last_statement(block: Node) -> Option<Node> {
    named_children(block)
        .into_iter()
        .filter(|part| !is_comment(part))
        .last()
}

fn terminated(node: Node, breaks: bool, continues: bool) -> bool {
    match node.kind() {
        "return_statement" | "throw_statement" | "yield_statement" => true,
        "break_statement" => breaks,
        "continue_statement" => continues,
        "block" => last_statement(node).is_some_and(|last| terminated(last, breaks, continues)),
        "labeled_statement" => {
            last_statement(node).is_some_and(|last| terminated(last, breaks, continues))
        }
        "synchronized_statement" => node
            .child_by_field_name("body")
            .is_some_and(|body| terminated(body, breaks, continues)),
        "if_statement" => {
            let branch = |field| {
                node.child_by_field_name(field)
                    .is_some_and(|part| terminated(part, breaks, continues))
            };
            branch("consequence") && branch("alternative")
        }
        "while_statement" | "for_statement" | "enhanced_for_statement" | "do_statement" => node
            .child_by_field_name("body")
            .is_some_and(|body| terminated(body, false, false)),
        "try_statement" | "try_with_resources_statement" => {
            let parts = children(node);
            let finally = parts.iter().find(|part| part.kind() == "finally_clause");
            if finally
                .and_then(|clause| {
                    named_children(*clause)
                        .into_iter()
                        .find(|p| p.kind() == "block")
                })
                .is_some_and(|block| terminated(block, breaks, continues))
            {
                return true;
            }
            let body = node
                .child_by_field_name("body")
                .is_some_and(|body| terminated(body, breaks, continues));
            body && parts
                .iter()
                .filter(|part| part.kind() == "catch_clause")
                .all(|clause| {
                    clause
                        .child_by_field_name("body")
                        .is_some_and(|body| terminated(body, breaks, continues))
                })
        }
        "switch_expression" | "switch_statement" => {
            let Some(body) = node.child_by_field_name("body") else {
                return false;
            };
            let groups: Vec<Node> = children(body)
                .into_iter()
                .filter(|part| part.kind() == "switch_block_statement_group")
                .collect();
            !groups.is_empty()
                && children(body)
                    .iter()
                    .all(|part| part.kind() != "switch_rule")
                && groups.iter().all(|group| {
                    group_statements(*group)
                        .last()
                        .is_some_and(|last| terminated(*last, false, continues))
                })
        }
        "expression_statement" => node.named_child(0).is_some_and(|inner| {
            inner.kind() == "switch_expression" && terminated(inner, breaks, continues)
        }),
        _ => false,
    }
}
