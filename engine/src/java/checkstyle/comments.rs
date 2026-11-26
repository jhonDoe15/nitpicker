pub struct Comment {
    pub line: usize,
    pub col: usize,
    pub start: usize,
    pub end: usize,
    pub body: String,
}

/// Every `/** ... */` comment of a file outside string literals, in order.
pub fn javadoc_comments(text: &str) -> Vec<Comment> {
    let bytes = text.as_bytes();
    let mut comments = Vec::new();
    let mut index = 0;
    let mut line = 1;
    let mut line_start = 0;
    while index < bytes.len() {
        match bytes[index] {
            b'\n' => {
                line += 1;
                line_start = index + 1;
                index += 1;
            }
            b'/' if bytes.get(index + 1) == Some(&b'/') => {
                while index < bytes.len() && bytes[index] != b'\n' {
                    index += 1;
                }
            }
            b'/' if bytes.get(index + 1) == Some(&b'*') => {
                let start = index;
                let start_line = line;
                let col = text[line_start..start].encode_utf16().count();
                index += 2;
                while index < bytes.len()
                    && !(bytes[index] == b'*' && bytes.get(index + 1) == Some(&b'/'))
                {
                    if bytes[index] == b'\n' {
                        line += 1;
                        line_start = index + 1;
                    }
                    index += 1;
                }
                let end = (index + 2).min(bytes.len());
                index = end;
                let whole = &text[start..end];
                if whole.len() >= 5
                    && whole.starts_with("/**")
                    && whole != "/**/"
                    && whole.ends_with("*/")
                {
                    comments.push(Comment {
                        line: start_line,
                        col,
                        start,
                        end,
                        body: whole[3..whole.len() - 2].to_string(),
                    });
                }
            }
            b'"' if text[index..].starts_with("\"\"\"") => {
                index += 3;
                while index < bytes.len() && !bytes[index..].starts_with(b"\"\"\"") {
                    if bytes[index] == b'\\' {
                        index += 1;
                    }
                    if bytes.get(index) == Some(&b'\n') {
                        line += 1;
                        line_start = index + 1;
                    }
                    index += 1;
                }
                index += 3;
            }
            quote @ (b'"' | b'\'') => {
                index += 1;
                while index < bytes.len() && bytes[index] != quote && bytes[index] != b'\n' {
                    if bytes[index] == b'\\' {
                        index += 1;
                    }
                    index += 1;
                }
                index += 1;
            }
            _ => index += 1,
        }
    }
    comments
}
