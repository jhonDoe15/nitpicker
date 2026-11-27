/// For each byte, whether it is code: not inside a comment, a string, a text block or a character literal.
pub(super) fn code_bytes(text: &str) -> Vec<bool> {
    let bytes = text.as_bytes();
    let mut code = vec![true; bytes.len()];
    let mut at = 0;
    while at < bytes.len() {
        let rest = &bytes[at..];
        let skipped = if rest.starts_with(b"//") {
            rest.iter().position(|byte| *byte == b'\n').unwrap_or(rest.len())
        } else if rest.starts_with(b"/*") {
            rest[2..].windows(2).position(|pair| pair == b"*/").map_or(rest.len(), |close| close + 4)
        } else if rest.starts_with(b"\"\"\"") {
            closing(rest, 3, b"\"\"\"")
        } else if rest[0] == b'"' || rest[0] == b'\'' {
            closing(rest, 1, &rest[..1])
        } else {
            0
        };
        if skipped == 0 {
            at += 1;
            continue;
        }
        code[at..at + skipped].iter_mut().for_each(|inside| *inside = false);
        at += skipped;
    }
    code
}

/// The length of a literal that opens with `quote` and ends at the next `quote` not escaped by a backslash.
fn closing(rest: &[u8], open: usize, quote: &[u8]) -> usize {
    let mut at = open;
    while at < rest.len() {
        if rest[at] == b'\\' {
            at += 2;
            continue;
        }
        if rest[at..].starts_with(quote) {
            return at + quote.len();
        }
        if quote.len() == 1 && rest[at] == b'\n' {
            return at;
        }
        at += 1;
    }
    rest.len()
}
