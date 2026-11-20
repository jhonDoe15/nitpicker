//! A Java tokenizer for a slice of a file, the way Error Prone reads the tokens of part of a tree: each token keeps
//! the comments written before it, and the end of the slice is a token too, holding the comments at the end.

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Tok {
    Identifier,
    /// A keyword javac counts as a modifier, or `<`, `>`, `>>`.
    Modifier,
    Other,
    End,
}

pub struct Token<'f> {
    pub kind: Tok,
    pub start: usize,
    pub end: usize,
    pub text: &'f str,
    /// Comments before the token: where each starts and its text.
    pub comments: Vec<(usize, &'f str)>,
}

const MODIFIERS: &[&str] =
    &["public", "protected", "private", "abstract", "static", "final", "transient", "volatile", "synchronized", "native", "strictfp", "default"];
const KEYWORDS: &[&str] = &[
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "default", "do", "double", "else",
    "enum", "extends", "final", "finally", "float", "for", "goto", "if", "implements", "import", "instanceof", "int", "interface", "long",
    "native", "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp", "super", "switch", "synchronized",
    "this", "throw", "throws", "transient", "try", "void", "volatile", "while", "true", "false", "null", "_",
];
const OPERATORS: &[&str] = &[
    ">>>=", "<<=", ">>=", ">>>", "...", "->", "::", "++", "--", "&&", "||", "==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "&=", "|=", "^=",
    "%=", "<<", ">>",
];

fn part(character: char) -> bool {
    character.is_alphanumeric() || matches!(character, '_' | '$')
}

/// The tokens of `text[from..to]`, offsets in the file.
pub fn tokens(text: &str, from: usize, to: usize) -> Vec<Token<'_>> {
    let slice = &text[from..to.max(from).min(text.len())];
    let bytes = slice.as_bytes();
    let mut out = Vec::new();
    let mut comments = Vec::new();
    let mut at = 0usize;
    while at < bytes.len() {
        let rest = &slice[at..];
        let character = rest.chars().next().unwrap_or(' ');
        if character.is_whitespace() {
            at += character.len_utf8();
            continue;
        }
        if rest.starts_with("//") {
            let end = rest.find(['\n', '\r']).unwrap_or(rest.len());
            comments.push((from + at, &rest[..end]));
            at += end;
            continue;
        }
        if rest.starts_with("/*") {
            let end = rest[2..].find("*/").map_or(rest.len(), |close| close + 4);
            comments.push((from + at, &rest[..end]));
            at += end;
            continue;
        }
        let length = if part(character) && !character.is_ascii_digit() {
            rest.find(|next: char| !part(next)).unwrap_or(rest.len())
        } else if character.is_ascii_digit() || (character == '.' && rest[1..].starts_with(|next: char| next.is_ascii_digit())) {
            let mut end = 1;
            let digits = rest.as_bytes();
            while end < digits.len() {
                let byte = digits[end];
                let exponent = matches!(digits[end - 1], b'e' | b'E' | b'p' | b'P') && matches!(byte, b'+' | b'-');
                if !(byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'.' || exponent) {
                    break;
                }
                end += 1;
            }
            end
        } else if rest.starts_with("\"\"\"") {
            let block = rest.as_bytes();
            let mut end = 3;
            while end < block.len() && !block[end..].starts_with(b"\"\"\"") {
                end += if block[end] == b'\\' { 2 } else { 1 };
            }
            (end + 3).min(rest.len())
        } else if matches!(character, '"' | '\'') {
            let mut end = 1;
            let quoted = rest.as_bytes();
            while end < quoted.len() && quoted[end] != character as u8 && quoted[end] != b'\n' {
                end += if quoted[end] == b'\\' { 2 } else { 1 };
            }
            (end + 1).min(rest.len())
        } else {
            OPERATORS.iter().find(|operator| rest.starts_with(*operator)).map_or(character.len_utf8(), |operator| operator.len())
        };
        let word = &rest[..length];
        let kind = if MODIFIERS.contains(&word) || matches!(word, "<" | ">" | ">>") {
            Tok::Modifier
        } else if part(character) && !character.is_ascii_digit() && !KEYWORDS.contains(&word) {
            Tok::Identifier
        } else {
            Tok::Other
        };
        out.push(Token { kind, start: from + at, end: from + at + length, text: word, comments: std::mem::take(&mut comments) });
        at += length;
    }
    out.push(Token { kind: Tok::End, start: from + slice.len(), end: from + slice.len(), text: "", comments });
    out
}
