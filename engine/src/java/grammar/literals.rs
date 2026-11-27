//! Literals the grammar accepts but Java rejects: a character literal that is not one UTF-16 unit, an escape outside
//! the set of the Java Language Specification, a line break or an unescaped quote inside a string. PMD and javac
//! report such a file as a parse error, so the engine counts it as broken.
use crate::engine::source::{walk, SourceFile};

pub fn has_invalid_literal(file: &SourceFile) -> bool {
    if !file.text.contains('\'') && !file.text.contains('"') {
        return false;
    }
    let mut invalid = false;
    walk(file.tree.root_node(), |node| {
        if !invalid && matches!(node.kind(), "character_literal" | "string_literal") && !node.has_error() {
            invalid = !valid(file.text_of(node));
        }
    });
    invalid
}

fn valid(written: &str) -> bool {
    let units = translated(written);
    if let Some(body) = units.strip_prefix(&['"', '"', '"'][..]).and_then(|rest| rest.strip_suffix(&['"', '"', '"'][..])) {
        let Some(start) = body.iter().position(|unit| *unit == '\n') else { return false };
        if !body[..start].iter().all(|unit| matches!(unit, ' ' | '\t' | '\u{c}')) {
            return false;
        }
        return lexed(&body[start + 1..], None, true).is_some();
    }
    match units.first() {
        Some('\'') if units.len() >= 2 && units.last() == Some(&'\'') => {
            lexed(&units[1..units.len() - 1], Some('\''), false).is_some_and(|length| length == 1)
        }
        Some('"') if units.len() >= 2 && units.last() == Some(&'"') => lexed(&units[1..units.len() - 1], Some('"'), false).is_some(),
        _ => false,
    }
}

/// The text with its Unicode escapes translated, as javac reads it before it reads tokens: a `\` starts one only
/// after an even run of backslashes.
pub(super) fn translated(written: &str) -> Vec<char> {
    let chars: Vec<char> = written.chars().collect();
    let mut out = Vec::with_capacity(chars.len());
    let mut at = 0;
    let mut backslashes = 0usize;
    while at < chars.len() {
        if chars[at] == '\\' && backslashes % 2 == 0 && chars.get(at + 1) == Some(&'u') {
            let mut next = at + 1;
            while chars.get(next) == Some(&'u') {
                next += 1;
            }
            let digits: String = chars[next..chars.len().min(next + 4)].iter().collect();
            if let Some(unit) = (digits.len() == 4).then(|| u32::from_str_radix(&digits, 16).ok()).flatten() {
                out.push(char::from_u32(unit).unwrap_or('\u{FFFD}'));
                at = next + 4;
                backslashes = 0;
                continue;
            }
        }
        backslashes = if chars[at] == '\\' { backslashes + 1 } else { 0 };
        out.push(chars[at]);
        at += 1;
    }
    out
}

/// The length in UTF-16 units of a literal's body after its escapes, or `None` when Java rejects the body.
fn lexed(body: &[char], quote: Option<char>, block: bool) -> Option<usize> {
    let mut length = 0;
    let mut at = 0;
    while at < body.len() {
        let unit = body[at];
        at += 1;
        if unit == '\\' {
            let escaped = *body.get(at)?;
            at += 1;
            match escaped {
                'b' | 't' | 'n' | 'f' | 'r' | 's' | '"' | '\'' | '\\' => {}
                '\n' if block => continue,
                '0'..='7' => {
                    let most = if escaped <= '3' { 2 } else { 1 };
                    at += body[at..].iter().take(most).take_while(|digit| matches!(digit, '0'..='7')).count();
                }
                _ => return None,
            }
            length += 1;
            continue;
        }
        if !block && (unit == '\n' || unit == '\r' || Some(unit) == quote) {
            return None;
        }
        length += unit.len_utf16();
    }
    Some(length)
}
