//! The tokens of PMD's Java grammar (`Java.jj`, the lexer part), over the translated text: longest match, keywords
//! before identifiers, comments and whitespace as special tokens, and every `>` its own token (`>>` and `>>>` give
//! a `>` that spans them all, then the lexer goes on one character later, as PMD's lexer backs up).
use super::letters::{continues_identifier, starts_identifier};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Identifier,
    Integer,
    Float,
    Character,
    String,
    TextBlock,
    Keyword,
    Operator,
}

pub struct Token {
    pub kind: Kind,
    pub start: usize,
    pub end: usize,
    /// The comments between the token before and this one.
    pub comments: std::ops::Range<usize>,
}

pub struct Comment {
    pub start: usize,
    pub end: usize,
    pub single_line: bool,
}

pub struct Lexed {
    pub tokens: Vec<Token>,
    pub comments: Vec<Comment>,
    /// The comments after the last token.
    pub trailing: std::ops::Range<usize>,
}

const KEYWORDS: &[&str] = &[
    "abstract", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "default", "do",
    "double", "else", "extends", "false", "final", "finally", "float", "for", "goto", "if", "implements", "import",
    "instanceof", "int", "interface", "long", "native", "new", "null", "package", "private", "protected", "public",
    "return", "short", "static", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "true",
    "try", "void", "volatile", "while", "strictfp",
];

const OPERATORS: &[&str] = &[
    ">>>=", "<<=", ">>=", "...", ">>>", "==", "<=", ">=", "!=", "||", "&&", "++", "--", "<<", "+=", "-=", "*=", "/=",
    "&=", "|=", "^=", "%=", "->", "::", ">>", "(", ")", "{", "}", "[", "]", ";", ",", ".", "@", "=", "<", "!", "~",
    "?", ":", "+", "-", "*", "/", "&", "|", "^", "%", ">",
];

fn unit(text: &[u16], at: usize) -> u16 {
    text.get(at).copied().unwrap_or(0xffff)
}

fn is(text: &[u16], at: usize, ascii: &str) -> bool {
    ascii.bytes().enumerate().all(|(offset, byte)| text.get(at + offset) == Some(&u16::from(byte)))
}

fn ascii(text: &[u16], at: usize) -> Option<u8> {
    text.get(at).and_then(|&unit| u8::try_from(unit).ok())
}

fn whitespace(unit: u16) -> bool {
    matches!(unit, 0x20 | 0x09 | 0x0c | 0x0a | 0x0d)
}

/// `None` on a lexical error: PMD reports the file and leaves it out.
pub fn lex(text: &[u16]) -> Option<Lexed> {
    let mut tokens = Vec::new();
    let mut comments = Vec::new();
    let mut first_comment = 0;
    let mut at = 0;
    while at < text.len() {
        let here = unit(text, at);
        if whitespace(here) {
            while at < text.len() && whitespace(text[at]) {
                at += 1;
            }
            continue;
        }
        if is(text, at, "//") {
            let mut end = at + 2;
            while end < text.len() && text[end] != 0x0a && text[end] != 0x0d {
                end += 1;
            }
            if is(text, end, "\r\n") {
                end += 2;
            } else if end < text.len() {
                end += 1;
            }
            comments.push(Comment { start: at, end, single_line: true });
            at = end;
            continue;
        }
        if is(text, at, "/*") {
            let close = (at + 2..text.len()).find(|&end| is(text, end, "*/"))?;
            comments.push(Comment { start: at, end: close + 2, single_line: false });
            at = close + 2;
            continue;
        }
        let (kind, length, next) = token_at(text, at)?;
        tokens.push(Token { kind, start: at, end: at + length, comments: first_comment..comments.len() });
        first_comment = comments.len();
        at = next;
    }
    Some(Lexed { tokens, trailing: first_comment..comments.len(), comments })
}

fn token_at(text: &[u16], at: usize) -> Option<(Kind, usize, usize)> {
    let here = unit(text, at);
    if starts_identifier(here) {
        let mut end = at + 1;
        while end < text.len() && continues_identifier(text[end]) {
            end += 1;
        }
        let word: String = text[at..end].iter().map(|&unit| char::from_u32(u32::from(unit)).unwrap_or('\u{fffd}')).collect();
        let kind = if KEYWORDS.contains(&word.as_str()) { Kind::Keyword } else { Kind::Identifier };
        return Some((kind, end - at, end));
    }
    if let Some((kind, length)) = super::numbers::literal(text, at) {
        return Some((kind, length, at + length));
    }
    if here == u16::from(b'\'') {
        let length = character(text, at)?;
        return Some((Kind::Character, length, at + length));
    }
    if here == u16::from(b'"') {
        if let Some(block) = text_block(text, at) {
            let length = block?;
            return Some((Kind::TextBlock, length, at + length));
        }
        let length = string(text, at)?;
        return Some((Kind::String, length, at + length));
    }
    let operator = OPERATORS.iter().filter(|operator| is(text, at, operator)).map(|operator| operator.len()).max()?;
    let gt_run = matches!(&text[at..at + operator], [0x3e, 0x3e] | [0x3e, 0x3e, 0x3e]);
    Some((Kind::Operator, operator, if gt_run { at + 1 } else { at + operator }))
}

/// The length of `STRING_ESCAPE` at `at` (a backslash), longest alternative.
fn escape(text: &[u16], at: usize) -> Option<usize> {
    let octal = |offset: usize| ascii(text, at + offset).is_some_and(|byte| (b'0'..=b'7').contains(&byte));
    match ascii(text, at + 1)? {
        b'n' | b't' | b'b' | b'r' | b'f' | b's' | b'\\' | b'\'' | b'"' => Some(2),
        b'0'..=b'3' if octal(2) && octal(3) => Some(4),
        b'0'..=b'7' if octal(2) => Some(3),
        b'0'..=b'7' => Some(2),
        _ => None,
    }
}

fn character(text: &[u16], at: usize) -> Option<usize> {
    let body = match *text.get(at + 1)? {
        0x5c => escape(text, at + 1)?,
        0x27 | 0x0a | 0x0d => return None,
        _ => 1,
    };
    (unit(text, at + 1 + body) == 0x27).then_some(body + 2)
}

fn string(text: &[u16], at: usize) -> Option<usize> {
    let mut end = at + 1;
    loop {
        match *text.get(end)? {
            0x22 => return Some(end + 1 - at),
            0x5c => end += escape(text, end)?,
            0x0a | 0x0d => return None,
            _ => end += 1,
        }
    }
}

/// `None` when no text block opens at `at`; `Some(None)` when one opens and is not closed or holds a bad escape.
fn text_block(text: &[u16], at: usize) -> Option<Option<usize>> {
    if !is(text, at, "\"\"\"") {
        return None;
    }
    let mut end = at + 3;
    while matches!(unit(text, end), 0x20 | 0x09 | 0x0c) {
        end += 1;
    }
    match unit(text, end) {
        0x0a => end += 1,
        0x0d => end += if unit(text, end + 1) == 0x0a { 2 } else { 1 },
        _ => return None,
    }
    Some(text_block_end(text, end).map(|close| close - at))
}

fn text_block_end(text: &[u16], mut end: usize) -> Option<usize> {
    loop {
        if is(text, end, "\"\"\"") {
            return Some(end + 3);
        }
        match *text.get(end)? {
            0x5c => match unit(text, end + 1) {
                0x0a => end += 2,
                0x0d => end += if unit(text, end + 2) == 0x0a { 3 } else { 2 },
                _ => end += escape(text, end)?,
            },
            _ => end += 1,
        }
    }
}
