//! Annotations as written in Java text, read without the grammar: the run of annotations before a `...` or after the
//! `|` of a multi-catch, which the grammar rejects, with the comments and whitespace Java allows between them.

/// An annotation: where it starts and ends, and where its written name is.
pub struct Written {
    pub start: usize,
    pub end: usize,
    pub name: (usize, usize),
}

fn trivia(bytes: &[u8], mut at: usize) -> usize {
    loop {
        if at < bytes.len() && bytes[at].is_ascii_whitespace() {
            at += 1;
        } else if bytes[at..].starts_with(b"/*") {
            at = bytes[at + 2..].windows(2).position(|pair| pair == b"*/").map_or(bytes.len(), |found| at + 2 + found + 2);
        } else if bytes[at..].starts_with(b"//") {
            at = bytes[at..].iter().position(|byte| *byte == b'\n').map_or(bytes.len(), |found| at + found);
        } else {
            return at;
        }
    }
}

fn arguments(bytes: &[u8], mut at: usize) -> Option<usize> {
    let mut depth = 0;
    while at < bytes.len() {
        match bytes[at] {
            b'(' => depth += 1,
            b')' => {
                depth -= 1;
                if depth == 0 {
                    return Some(at + 1);
                }
            }
            quote @ (b'"' | b'\'') => {
                at += 1;
                while at < bytes.len() && bytes[at] != quote {
                    at += if bytes[at] == b'\\' { 2 } else { 1 };
                }
            }
            b'/' if bytes[at..].starts_with(b"/*") || bytes[at..].starts_with(b"//") => {
                at = trivia(bytes, at);
                continue;
            }
            _ => {}
        }
        at += 1;
    }
    None
}

fn annotation(bytes: &[u8], start: usize) -> Option<Written> {
    if bytes.get(start) != Some(&b'@') {
        return None;
    }
    let from = trivia(bytes, start + 1);
    let mut at = from;
    while at < bytes.len() && (bytes[at].is_ascii_alphanumeric() || matches!(bytes[at], b'_' | b'$') || (bytes[at] == b'.' && bytes.get(at + 1) != Some(&b'.'))) {
        at += 1;
    }
    if at == from || bytes[from].is_ascii_digit() || &bytes[from..at] == b"interface" {
        return None;
    }
    let name = (from, at);
    let after = trivia(bytes, at);
    let end = if bytes.get(after) == Some(&b'(') { arguments(bytes, after)? } else { at };
    Some(Written { start, end, name })
}

/// The annotations written from `start` on, with where the text after them starts.
pub fn run_from(text: &str, start: usize) -> (Vec<Written>, usize) {
    let bytes = text.as_bytes();
    let mut found = Vec::new();
    let mut at = trivia(bytes, start);
    while let Some(written) = annotation(bytes, at) {
        at = trivia(bytes, written.end);
        found.push(written);
    }
    (found, at)
}

/// The annotations written from `start` on, when they run up to a `...`, with where the `...` starts.
pub fn before_spread(text: &str, start: usize) -> Option<(Vec<Written>, usize)> {
    let (found, at) = run_from(text, start);
    (!found.is_empty() && text.as_bytes()[at..].starts_with(b"...")).then_some((found, at))
}
