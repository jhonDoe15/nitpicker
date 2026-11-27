use super::code::code_bytes;
use crate::java::annotations_run::run_from;
use regex::Regex;
use std::sync::LazyLock;

/// The grammar rejects annotations on the alternatives after the `|` of a multi-catch
/// (`catch (A | @Nullable B e)`): they become spaces, and the checks read them from the real text.
pub(super) fn blank_alternative_annotations(text: &str, bytes: &mut Option<Vec<u8>>) {
    static CATCH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\bcatch\s*\(").expect("pattern"));
    let raw = text.as_bytes();
    let mut code: Option<Vec<bool>> = None;
    for found in CATCH.find_iter(text) {
        let code = code.get_or_insert_with(|| code_bytes(text));
        if !code[found.start()] {
            continue;
        }
        let mut depth = 1usize;
        let mut at = found.end();
        while at < raw.len() && depth > 0 {
            if code[at] {
                match raw[at] {
                    b'(' => depth += 1,
                    b')' => depth -= 1,
                    b'|' if depth == 1 => blank_run(text, at + 1, bytes),
                    b'{' | b'}' | b';' if depth == 1 => break,
                    _ => {}
                }
            }
            at += 1;
        }
    }
}

fn blank_run(text: &str, from: usize, bytes: &mut Option<Vec<u8>>) {
    let (found, _) = run_from(text, from);
    let (Some(first), Some(last)) = (found.first(), found.last()) else { return };
    let bytes = bytes.get_or_insert_with(|| text.as_bytes().to_vec());
    for byte in &mut bytes[first.start..last.end] {
        if !byte.is_ascii_whitespace() {
            *byte = b' ';
        }
    }
}

/// The annotations written after each `|` of a multi-catch type, which the grammar masks, with the type they
/// stand before.
pub fn alternative_annotations(text: &str, union: tree_sitter::Node) -> Vec<(Vec<crate::java::annotations_run::Written>, usize)> {
    let mut found = Vec::new();
    let mut cursor = union.walk();
    for part in union.children(&mut cursor) {
        if part.kind() == "|" {
            let (written, at) = run_from(text, part.end_byte());
            if !written.is_empty() {
                found.push((written, at));
            }
        }
    }
    found
}
