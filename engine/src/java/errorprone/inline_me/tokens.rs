//! Whether two replacement strings are the same Java tokens, the way Error Prone compares them with javac's scanner:
//! the same kinds, and the same names, literal values and radixes, whatever the spacing and comments.

const KEYWORDS: &[&str] = &[
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "default", "do", "double",
    "else", "enum", "extends", "final", "finally", "float", "for", "goto", "if", "implements", "import", "instanceof", "int",
    "interface", "long", "native", "new", "package", "private", "protected", "public", "return", "short", "static", "strictfp", "super",
    "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void", "volatile", "while", "true", "false", "null", "_",
];

/// Operators and separators, longest first so the longest match wins.
const OPERATORS: &[&str] = &[
    ">>>=", "<<=", ">>=", ">>>", "...", "->", "::", "==", "<=", ">=", "!=", "&&", "||", "++", "--", "<<", ">>", "+=", "-=", "*=", "/=",
    "&=", "|=", "^=", "%=", "(", ")", "{", "}", "[", "]", ";", ",", ".", "@", "=", ">", "<", "!", "~", "?", ":", "+", "-", "*", "/",
    "&", "|", "^", "%",
];

#[derive(PartialEq, Eq, Debug)]
struct Token {
    kind: String,
    name: Option<String>,
    value: Option<String>,
    radix: Option<u32>,
}

impl Token {
    fn plain(kind: &str) -> Token {
        Token { kind: kind.to_string(), name: None, value: None, radix: None }
    }
}

fn unescaped(body: &[char]) -> String {
    let mut out = String::new();
    let mut at = 0;
    while at < body.len() {
        let character = body[at];
        at += 1;
        if character != '\\' || at >= body.len() {
            out.push(character);
            continue;
        }
        let escape = body[at];
        at += 1;
        match escape {
            'n' => out.push('\n'),
            't' => out.push('\t'),
            'r' => out.push('\r'),
            'b' => out.push('\u{8}'),
            'f' => out.push('\u{c}'),
            's' => out.push(' '),
            '0'..='7' => {
                let mut value = escape.to_digit(8).unwrap_or(0);
                let most = if escape <= '3' { 2 } else { 1 };
                for _ in 0..most {
                    match body.get(at).and_then(|digit| digit.to_digit(8)) {
                        Some(digit) => {
                            value = value * 8 + digit;
                            at += 1;
                        }
                        None => break,
                    }
                }
                out.extend(char::from_u32(value));
            }
            other => out.push(other),
        }
    }
    out
}

fn number(text: &[char], start: usize) -> (Token, usize) {
    let mut end = start;
    let radix = match (text.get(start), text.get(start + 1).map(char::to_ascii_lowercase)) {
        (Some('0'), Some('x')) => 16,
        (Some('0'), Some('b')) => 2,
        (Some('0'), Some(next)) if next.is_ascii_digit() || next == '_' => 8,
        _ => 10,
    };
    if radix == 16 || radix == 2 {
        end += 2;
    }
    let mut float = false;
    while end < text.len() {
        let character = text[end];
        let exponent = if radix == 16 { matches!(character, 'p' | 'P') } else { matches!(character, 'e' | 'E') };
        if character.is_ascii_alphanumeric() && !exponent && !matches!(character.to_ascii_lowercase(), 'l' | 'f' | 'd') || character == '_' {
            end += 1;
        } else if radix == 16 && matches!(character.to_ascii_lowercase(), 'd' | 'f') {
            end += 1;
        } else if character == '.' && !float {
            float = true;
            end += 1;
        } else if exponent {
            float = true;
            end += 1;
            if matches!(text.get(end), Some('+' | '-')) {
                end += 1;
            }
        } else {
            break;
        }
    }
    let suffix = text.get(end).map(char::to_ascii_lowercase);
    let kind = match suffix {
        Some('l') => "LONGLITERAL",
        Some('f') => "FLOATLITERAL",
        Some('d') => "DOUBLELITERAL",
        _ if float => "DOUBLELITERAL",
        _ => "INTLITERAL",
    };
    let digits: String = text[start + if radix == 16 || radix == 2 { 2 } else { 0 }..end].iter().filter(|c| **c != '_').collect();
    if matches!(suffix, Some('l' | 'f' | 'd')) {
        end += 1;
    }
    (Token { kind: kind.to_string(), name: None, value: Some(digits), radix: Some(radix) }, end)
}

fn quoted(text: &[char], start: usize, quote: char) -> (Token, usize) {
    let block = quote == '"' && text.get(start + 1) == Some(&'"') && text.get(start + 2) == Some(&'"');
    let mut at = start + if block { 3 } else { 1 };
    let body_start = at;
    while at < text.len() {
        if text[at] == '\\' {
            at += 2;
            continue;
        }
        if text[at] == quote && (!block || text.get(at + 1) == Some(&'"') && text.get(at + 2) == Some(&'"')) {
            break;
        }
        at += 1;
    }
    let body = &text[body_start..at.min(text.len())];
    let end = (at + if block { 3 } else { 1 }).min(text.len());
    let kind = if quote == '\'' { "CHARLITERAL" } else { "STRINGLITERAL" };
    (Token { kind: kind.to_string(), name: None, value: Some(unescaped(body)), radix: None }, end)
}

/// The text with its unicode escapes translated, as javac reads source: `\\uXXXX` after an even run of backslashes.
fn translated(source: &str) -> Vec<char> {
    let text: Vec<char> = source.chars().collect();
    let mut out = Vec::with_capacity(text.len());
    let mut at = 0;
    let mut backslashes = 0;
    while at < text.len() {
        if text[at] == '\\' && backslashes % 2 == 0 && text.get(at + 1) == Some(&'u') {
            let mut digits = at + 1;
            while text.get(digits) == Some(&'u') {
                digits += 1;
            }
            let code: String = text[digits..text.len().min(digits + 4)].iter().collect();
            if let Some(unit) = u32::from_str_radix(&code, 16).ok().filter(|_| code.len() == 4) {
                out.push(char::from_u32(unit).unwrap_or('\u{fffd}'));
                at = digits + 4;
                backslashes = 0;
                continue;
            }
        }
        backslashes = if text[at] == '\\' { backslashes + 1 } else { 0 };
        out.push(text[at]);
        at += 1;
    }
    out
}

fn tokens(source: &str) -> Vec<Token> {
    let text = translated(source);
    let mut found = Vec::new();
    let mut at = 0;
    while at < text.len() {
        let character = text[at];
        if character.is_whitespace() {
            at += 1;
        } else if character == '/' && text.get(at + 1) == Some(&'/') {
            while at < text.len() && text[at] != '\n' {
                at += 1;
            }
        } else if character == '/' && text.get(at + 1) == Some(&'*') {
            at += 2;
            while at + 1 < text.len() && !(text[at] == '*' && text[at + 1] == '/') {
                at += 1;
            }
            at += 2;
        } else if character.is_alphabetic() || character == '_' || character == '$' {
            let start = at;
            while at < text.len() && (text[at].is_alphanumeric() || text[at] == '_' || text[at] == '$') {
                at += 1;
            }
            let word: String = text[start..at].iter().collect();
            found.push(if KEYWORDS.contains(&word.as_str()) { Token::plain(&word) } else { Token { name: Some(word), ..Token::plain("IDENTIFIER") } });
        } else if character.is_ascii_digit() || character == '.' && text.get(at + 1).is_some_and(char::is_ascii_digit) {
            let (token, end) = number(&text, at);
            found.push(token);
            at = end;
        } else if character == '"' || character == '\'' {
            let (token, end) = quoted(&text, at, character);
            found.push(token);
            at = end;
        } else {
            let rest: String = text[at..text.len().min(at + 4)].iter().collect();
            match OPERATORS.iter().find(|operator| rest.starts_with(**operator)) {
                Some(operator) => {
                    found.push(Token::plain(operator));
                    at += operator.len();
                }
                None => {
                    found.push(Token::plain("ERROR"));
                    at += 1;
                }
            }
        }
    }
    found
}

/// `parseAndCheckForTokenEquivalence`: what the first token has (a name, a value, a radix) the second must match.
pub fn equivalent(first: &str, second: &str) -> bool {
    let (first, second) = (tokens(first), tokens(second));
    first.len() == second.len()
        && first.iter().zip(&second).all(|(a, b)| {
            a.kind == b.kind
                && (a.name.is_none() || a.name == b.name)
                && (a.value.is_none() || a.value == b.value)
                && (a.radix.is_none() || a.radix == b.radix)
        })
}

#[cfg(test)]
mod tests {
    use super::equivalent;

    #[test]
    fn spacing_and_comments_do_not_matter() {
        assert!(equivalent("this.f(16,   1000L , 'a', \"A\")  /* c */", "this.f(16, 1000L, 'a', \"\\u0041\")"));
        assert!(!equivalent("this.f(0x10)", "this.f(16)"));
        assert!(!equivalent("a >> b", "a > > b"));
    }
}
