//! What `Pattern.compile` throws for a regular expression, written from the `java.util.regex.Pattern`
//! documentation and observed JDK behaviour, and checked against the JDK by `cases.rs`.
mod class;
mod escape;
mod parse;
mod group;
mod names;
mod study;
#[cfg(test)]
pub mod cases;

pub const UNIX_LINES: u32 = 1;
pub const COMMENTS: u32 = 4;
pub const LITERAL: u32 = 16;
pub const CANON_EQ: u32 = 128;
pub const UNICODE_CHARACTER_CLASS: u32 = 256;
const ALL_FLAGS: u32 = 0x1ff;

/// A syntax error: the description and the index in the pattern after `\Q...\E` quoting is expanded.
#[derive(Debug)]
pub(super) enum Failure {
    Syntax(String, i64),
    /// The model cannot tell, so the caller reports nothing.
    Unknown,
}

pub(super) type Parsed<T> = Result<T, Failure>;

pub(super) fn fail<T>(description: impl Into<String>, index: usize) -> Parsed<T> {
    Err(Failure::Syntax(description.into(), index as i64))
}

/// `\Q...\E` replaced by escaped characters, as code points.
fn unquote(pattern: &[u32]) -> Vec<u32> {
    if !pattern.windows(2).any(|pair| pair == [u32::from('\\'), u32::from('Q')]) {
        return pattern.to_vec();
    }
    let mut out = Vec::with_capacity(pattern.len() * 2);
    let mut at = 0;
    while at < pattern.len() {
        let c = pattern[at];
        at += 1;
        if c != u32::from('\\') || at >= pattern.len() {
            out.push(c);
            continue;
        }
        let escaped = pattern[at];
        at += 1;
        if escaped != u32::from('Q') {
            out.extend([c, escaped]);
            continue;
        }
        let first = at;
        while at < pattern.len() {
            if pattern[at] == u32::from('\\') && pattern.get(at + 1) == Some(&u32::from('E')) {
                at += 2;
                break;
            }
            let quoted = pattern[at];
            at += 1;
            match char::from_u32(quoted) {
                Some(c) if c.is_ascii_alphanumeric() && (at > first + 1 || c.is_ascii_alphabetic()) || !c.is_ascii() => out.push(quoted),
                Some(c) if c.is_ascii_digit() && at == first + 1 => out.extend("\\x3".chars().map(u32::from).chain([quoted])),
                _ => out.extend([u32::from('\\'), quoted]),
            }
        }
    }
    out
}

/// The message of the `PatternSyntaxException` that `Pattern.compile(pattern, flags)` throws, if it throws one.
/// `None` also when the model cannot tell.
pub fn syntax_error(pattern: &str, flags: u32, jdk: u32) -> Option<String> {
    if flags & !ALL_FLAGS != 0 || flags & LITERAL != 0 {
        return None;
    }
    if flags & CANON_EQ != 0 && !pattern.is_ascii() {
        return None;
    }
    let points: Vec<u32> = pattern.chars().map(u32::from).collect();
    match parse::Parser::new(unquote(&points), flags, jdk).run() {
        Ok(()) | Err(Failure::Unknown) => None,
        Err(Failure::Syntax(description, index)) => Some(message(&description, index, pattern)),
    }
}

fn message(description: &str, index: i64, pattern: &str) -> String {
    let mut text = description.to_string();
    if index >= 0 {
        text.push_str(&format!(" near index {index}"));
    }
    text.push('\n');
    text.push_str(pattern);
    if index >= 0 && (index as usize) < pattern.encode_utf16().count() {
        text.push('\n');
        let units: Vec<u16> = pattern.encode_utf16().collect();
        text.extend(units[..index as usize].iter().map(|unit| if *unit == 9 { '\t' } else { ' ' }));
        text.push('^');
    }
    text
}
