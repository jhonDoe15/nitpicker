//! The text tree-sitter parses in place of a Java file. Every change keeps each byte where it was, so the tree's
//! positions still point into the real text, and the rules read names from the real text.

pub mod catches;
mod code;
pub mod literals;
pub mod names;
mod numbers;

use super::annotations_run::before_spread;
use code::code_bytes;
use regex::Regex;
use std::sync::LazyLock;

/// The grammar rejects an annotation between a type and `...`, and reads a record pattern with a qualified type
/// (`case Shape.Box(var inside) ->`, `value instanceof Shape.Box(var inside)`) as a method call. The first is blanked out; in the second the dots of the
/// record type become `_`, so the grammar sees one name and parses a record pattern. The grammar also stops at a
/// NUL character, which Java allows in strings, text blocks, character literals and comments: there it becomes a
/// space. A NUL in code is left, so the file stays broken, as it is for PMD at the end of a file. The grammar rejects
/// a parenthesized assignment target (`(x) = 2`, `(this.f) += 1`): those parentheses become spaces, and the PMD tree
/// puts them back from the real text. Annotations after the `|` of a multi-catch become spaces too, and the backslash
/// of a Unicode escape in a name becomes a `_` (`names`).
pub fn masked(text: &str) -> Option<String> {
    let mut bytes: Option<Vec<u8>> = None;
    if text.contains('\0') {
        blank_quoted_nul(text, &mut bytes);
    }
    if text.contains("catch") && text.contains('|') && text.contains('@') {
        catches::blank_alternative_annotations(text, &mut bytes);
    }
    if text.contains("\\u") {
        names::mask_escaped_names(text, &mut bytes);
    }
    if text.contains("...") {
        blank_spread_annotations(text, &mut bytes);
    }
    if text.contains("case") || text.contains("instanceof") {
        join_record_pattern_names(text, &mut bytes);
    }
    if text.contains(')') && text.contains('=') {
        blank_parenthesized_targets(text, &mut bytes);
    }
    if text.contains('_') {
        numbers::fill_number_underscores(text, &mut bytes);
    }
    if text.contains('0') {
        numbers::decimal_floats_after_zero(text, &mut bytes);
    }
    bytes.and_then(|bytes| String::from_utf8(bytes).ok())
}

fn blank_parenthesized_targets(text: &str, bytes: &mut Option<Vec<u8>>) {
    static TARGET: LazyLock<Regex> = LazyLock::new(|| {
        Regex::new(r"^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*(?:\[[^\[\]]*\])*$").expect("pattern")
    });
    static ASSIGNMENT: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^\s*(?:>>>=|<<=|>>=|[-+*/%&|^]=|=)").expect("pattern"));
    let raw = text.as_bytes();
    let mut code: Option<Vec<bool>> = None;
    for (close, _) in text.match_indices(')') {
        let Some(sign) = ASSIGNMENT.find(&text[close + 1..]) else { continue };
        if raw.get(close + 1 + sign.end()) == Some(&b'=') && sign.as_str().trim() == "=" {
            continue;
        }
        let code = code.get_or_insert_with(|| code_bytes(text));
        if !code[close] {
            continue;
        }
        let mut depth = 0usize;
        let Some(open) = (0..=close).rev().filter(|at| code[*at]).find(|at| {
            match raw[*at] {
                b')' => depth += 1,
                b'(' => depth = depth.saturating_sub(1),
                _ => {}
            }
            depth == 0
        }) else {
            continue;
        };
        if !code[open..=close].iter().all(|inside| *inside) {
            continue;
        }
        let inner: String = text[open..=close].chars().filter(|character| !character.is_whitespace() && !matches!(character, '(' | ')')).collect();
        if !TARGET.is_match(&inner) {
            continue;
        }
        let bytes = bytes.get_or_insert_with(|| text.as_bytes().to_vec());
        for at in open..=close {
            if matches!(raw[at], b'(' | b')') {
                bytes[at] = b' ';
            }
        }
    }
}

fn blank_spread_annotations(text: &str, bytes: &mut Option<Vec<u8>>) {
    let mut from = 0;
    while let Some(found) = text[from..].find('@') {
        let start = from + found;
        from = start + 1;
        let Some((_, dots)) = before_spread(text, start) else { continue };
        let bytes = bytes.get_or_insert_with(|| text.as_bytes().to_vec());
        for byte in &mut bytes[start..dots] {
            if !byte.is_ascii_whitespace() {
                *byte = b' ';
            }
        }
        from = dots;
    }
}

fn blank_quoted_nul(text: &str, bytes: &mut Option<Vec<u8>>) {
    let code = code_bytes(text);
    for (at, byte) in text.bytes().enumerate() {
        if byte == 0 && !code[at] {
            bytes.get_or_insert_with(|| text.as_bytes().to_vec())[at] = b' ';
        }
    }
}

fn join_record_pattern_names(text: &str, bytes: &mut Option<Vec<u8>>) {
    static CASE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\b(?:case|instanceof)\b").expect("pattern"));
    static DOTTED: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+").expect("pattern"));
    let mut code: Option<Vec<bool>> = None;
    for case in CASE.find_iter(text) {
        let code = code.get_or_insert_with(|| code_bytes(text));
        if !code[case.start()] {
            continue;
        }
        let end = if case.as_str() == "case" { label_end(text, code, case.end()) } else { pattern_end(text, code, case.end()) };
        let label = &text[case.end()..end];
        for name in DOTTED.find_iter(label) {
            let (from, to) = (case.end() + name.start(), case.end() + name.end());
            if !code[from..to].iter().all(|inside| *inside) || !opens_record_body(&label[name.end()..]) || label[..name.start()].ends_with(['.', '$']) {
                continue;
            }
            let bytes = bytes.get_or_insert_with(|| text.as_bytes().to_vec());
            for byte in &mut bytes[from..to] {
                if *byte == b'.' {
                    *byte = b'_';
                }
            }
        }
    }
}

/// Where the pattern after `instanceof` ends: after the parentheses of its record body, if it has one.
fn pattern_end(text: &str, code: &[bool], from: usize) -> usize {
    static RECORD_TYPE: LazyLock<Regex> =
        LazyLock::new(|| Regex::new(r"^\s*[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+\s*(?:<[^()]*>)?\s*\(").expect("pattern"));
    let bytes = text.as_bytes();
    let Some(head) = RECORD_TYPE.find(&text[from..]) else { return from };
    let open = from + head.end() - 1;
    let mut depth = 0usize;
    for at in open..bytes.len() {
        if !code[at] {
            continue;
        }
        match bytes[at] {
            b'(' => depth += 1,
            b')' => {
                depth -= 1;
                if depth == 0 {
                    return at;
                }
            }
            b';' | b'{' | b'}' => return at,
            _ => {}
        }
    }
    bytes.len()
}

/// Where a case label ends: its `->` or `:`, or a `when` guard, outside parentheses.
fn label_end(text: &str, code: &[bool], from: usize) -> usize {
    let bytes = text.as_bytes();
    let mut depth = 0usize;
    let mut at = from;
    while at < bytes.len() {
        if !code[at] {
            at += 1;
            continue;
        }
        match bytes[at] {
            b'(' => depth += 1,
            b')' if depth == 0 => return at,
            b')' => depth -= 1,
            b'{' | b'}' | b';' => return at,
            b'-' if depth == 0 && bytes.get(at + 1) == Some(&b'>') => return at,
            b':' if depth == 0 => return at,
            b'w' if depth == 0 && text[at..].starts_with("when") && word_edge(bytes, at, 4) => return at,
            _ => {}
        }
        at += 1;
    }
    at
}

fn word_edge(bytes: &[u8], at: usize, length: usize) -> bool {
    let word = |byte: Option<&u8>| byte.is_some_and(|byte| byte.is_ascii_alphanumeric() || *byte == b'_' || *byte == b'$');
    !word(at.checked_sub(1).and_then(|before| bytes.get(before))) && !word(bytes.get(at + length))
}

/// Whether a name is followed by `(`, perhaps after type arguments: the name is a record pattern's type.
fn opens_record_body(rest: &str) -> bool {
    let rest = rest.trim_start();
    if let Some(arguments) = rest.strip_prefix('<') {
        let mut depth = 1usize;
        for (at, character) in arguments.char_indices() {
            match character {
                '<' => depth += 1,
                '>' => {
                    depth -= 1;
                    if depth == 0 {
                        return arguments[at + 1..].trim_start().starts_with('(');
                    }
                }
                '(' | ')' | ';' => return false,
                _ => {}
            }
        }
        return false;
    }
    rest.starts_with('(')
}
