//! Checks on the characters of a source file: MisleadingEscapedSpace and UnicodeInCode.
use super::shape::folded_strings;
use super::Context;
use crate::engine::source::{parent, walk};
use tree_sitter::Node;

fn string_pieces<'t>(node: Node<'t>, pieces: &mut Vec<Node<'t>>) {
    if node.kind() == "string_literal" {
        pieces.push(node);
    } else if node.kind() == "binary_expression" {
        for side in ["left", "right"] {
            if let Some(part) = node.child_by_field_name(side) {
                string_pieces(part, pieces);
            }
        }
    }
}

/// Whether the source of one string literal has `\s` followed by something other than the end of a line.
fn misleading(literal: &str) -> bool {
    let block = literal.starts_with("\"\"\"");
    let quotes = if block { 3 } else { 1 };
    let Some(inner) = literal.get(quotes..literal.len().saturating_sub(quotes)) else { return false };
    let chars: Vec<char> = inner.chars().collect();
    let mut seen = false;
    let mut at = 0;
    while at < chars.len() {
        match chars[at] {
            '\n' | '\r' => seen = false,
            '\\' => {
                at += 1;
                if chars.get(at) == Some(&'s') {
                    seen = true;
                } else if seen {
                    return true;
                }
            }
            _ => {
                if seen {
                    return true;
                }
            }
        }
        at += 1;
    }
    seen && !block
}

pub fn misleading_escaped_space(context: &Context, node: Node) {
    let message = "Using \\s anywhere except at the end of a line in a text block is potentially misleading.";
    match node.kind() {
        "character_literal" if context.text(node) == "'\\s'" => {
            context.report_fixed("MisleadingEscapedSpace", node, node.start_byte(), message, &[]);
        }
        "string_literal" | "binary_expression" => {
            if !folded_strings(node) || parent(node).is_some_and(|up| up.kind() == "binary_expression" && folded_strings(up)) {
                return;
            }
            let mut pieces = Vec::new();
            string_pieces(node, &mut pieces);
            let values: Option<Vec<String>> = pieces.iter().map(|piece| crate::java::types::expr::literal_text(context.file, *piece)).collect();
            let spaced = values.is_some_and(|parts| parts.concat().contains(' '));
            if spaced && pieces.iter().any(|piece| misleading(context.text(*piece))) {
                context.report_fixed("MisleadingEscapedSpace", node, node.start_byte(), message, &[]);
            }
        }
        _ => {}
    }
}

fn is_acceptable(unit: u16, last: bool) -> bool {
    (0x20..=0x7e).contains(&unit) || matches!(unit, 0x0a | 0x0d | 0x09) || (unit == 0x1a && last)
}

fn escaped(unit: u16) -> String {
    match unit {
        0x08 => "\\b".to_string(),
        0x0c => "\\f".to_string(),
        0x0a => "\\n".to_string(),
        0x0d => "\\r".to_string(),
        0x09 => "\\t".to_string(),
        0x22 => "\\\"".to_string(),
        0x5c => "\\\\".to_string(),
        0x27 => "\\'".to_string(),
        0x20..=0x7e => char::from_u32(u32::from(unit)).map(String::from).unwrap_or_default(),
        other => format!("\\u{other:04x}"),
    }
}

pub fn unicode_in_code(context: &Context, root: Node) {
    let text = &context.file.text;
    if text.is_ascii() && !text.bytes().any(|byte| byte < 0x20 && !matches!(byte, b'\n' | b'\r' | b'\t') || byte == 0x7f) {
        return;
    }
    let mut starts = Vec::new();
    let mut units = Vec::new();
    for (offset, character) in text.char_indices() {
        let mut buffer = [0u16; 2];
        for unit in character.encode_utf16(&mut buffer) {
            units.push(*unit);
            starts.push(offset);
        }
    }
    let violations: Vec<usize> = (0..units.len()).filter(|at| !is_acceptable(units[*at], *at + 1 == units.len())).collect();
    if violations.is_empty() {
        return;
    }
    let unit_at = |byte: usize| starts.partition_point(|start| *start < byte);
    let mut regions: Vec<(usize, usize)> = Vec::new();
    walk(root, |node| {
        let range = |node: Node| (unit_at(node.start_byte()), unit_at(node.end_byte()));
        match node.kind() {
            "string_literal" | "character_literal" | "line_comment" | "block_comment" => regions.push(range(node)),
            kind if super::DECLARATIONS.contains(&kind) && context.suppressed("UnicodeInCode", node) => regions.push(range(node)),
            _ => {}
        }
    });
    regions.sort();
    let mut merged: Vec<(usize, usize)> = Vec::new();
    for (start, end) in regions {
        match merged.last_mut() {
            Some(last) if start <= last.1 => last.1 = last.1.max(end),
            _ => merged.push((start, end)),
        }
    }
    let mut runs: Vec<(usize, usize)> = Vec::new();
    for at in violations {
        match runs.last_mut() {
            Some(last) if last.1 == at => last.1 = at + 1,
            _ => runs.push((at, at + 1)),
        }
    }
    for (from, to) in runs.into_iter().rev() {
        if merged.iter().any(|(start, end)| *start <= from && to <= *end) {
            continue;
        }
        let shown: String = units[from..to].iter().map(|unit| escaped(*unit)).collect();
        let message = format!("Avoid using non-ASCII Unicode character ({shown}) outside of comments and literals, as they can be confusing.");
        context.report_always("UnicodeInCode", starts[from], &message);
    }
}
