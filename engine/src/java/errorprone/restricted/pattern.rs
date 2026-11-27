//! `Pattern.matches(allowedOnPath, uri)` for the part of java.util.regex syntax whose meaning on a file URI is the same
//! as in the `regex` crate. A URI holds only printable ASCII without spaces (`file_uri` escapes the rest), so `.`, the
//! classes and `$` agree; quantifiers, groups and alternation decide whether a whole match exists the same way in
//! both. Anything else (look-around, back references, possessive quantifiers, flags, `\p`, `\Q`, class intersections
//! and every syntax error) gives `None`, and the caller lets Error Prone decide.

/// Escapes in and out of classes that stand for an ASCII class.
fn class_escape(letter: char) -> Option<&'static str> {
    Some(match letter {
        'd' => "0-9",
        'w' => "a-zA-Z_0-9",
        's' => " \\t\\n\\x0B\\x0C\\r",
        _ => return None,
    })
}

/// Escapes of one character.
fn char_escape(letter: char) -> Option<char> {
    Some(match letter {
        't' => '\t',
        'n' => '\n',
        'r' => '\r',
        'f' => '\u{c}',
        'a' => '\u{7}',
        'e' => '\u{1b}',
        other if !other.is_ascii_alphanumeric() && other.is_ascii() => other,
        _ => return None,
    })
}

fn literal(character: char, out: &mut String) {
    out.push_str(&regex::escape(&character.to_string()));
}

struct Parser<'a> {
    chars: &'a [char],
    at: usize,
    depth: usize,
}

impl Parser<'_> {
    fn peek(&self) -> Option<char> {
        self.chars.get(self.at).copied()
    }

    fn next(&mut self) -> Option<char> {
        let found = self.peek()?;
        self.at += 1;
        Some(found)
    }

    /// One class item that stands for one character, as the `regex` crate writes it.
    fn class_char(&mut self) -> Option<char> {
        match self.next()? {
            '\\' => char_escape(self.next()?),
            '[' | '&' => None,
            other => Some(other),
        }
    }

    fn class(&mut self, out: &mut String) -> Option<()> {
        out.push('[');
        if self.peek() == Some('^') {
            self.at += 1;
            out.push('^');
        }
        let mut items = 0;
        loop {
            match self.peek()? {
                ']' if items > 0 => {
                    self.at += 1;
                    break;
                }
                ']' => return None,
                '\\' if self.chars.get(self.at + 1).copied().and_then(class_escape).is_some() => {
                    let letter = self.chars[self.at + 1];
                    self.at += 2;
                    if self.peek() == Some('-') && self.chars.get(self.at + 1) != Some(&']') {
                        return None;
                    }
                    out.push_str(class_escape(letter)?);
                }
                _ => {
                    let first = self.class_char()?;
                    if self.peek() == Some('-') && self.chars.get(self.at + 1).is_some_and(|after| *after != ']') {
                        self.at += 1;
                        let last = self.class_char()?;
                        if last < first {
                            return None;
                        }
                        literal(first, out);
                        out.push('-');
                        literal(last, out);
                    } else {
                        literal(first, out);
                    }
                }
            }
            items += 1;
        }
        out.push(']');
        Some(())
    }

    /// A quantifier after an atom, with its lazy `?`; possessive ones are refused.
    fn quantifier(&mut self, out: &mut String) -> Option<()> {
        match self.peek() {
            Some(symbol @ ('*' | '+' | '?')) => {
                self.at += 1;
                out.push(symbol);
            }
            Some('{') => {
                self.at += 1;
                let digits = |parser: &mut Self| {
                    let start = parser.at;
                    while parser.peek().is_some_and(|c| c.is_ascii_digit()) {
                        parser.at += 1;
                    }
                    let text: String = parser.chars[start..parser.at].iter().collect();
                    (!text.is_empty()).then(|| text.parse::<u32>().ok()).flatten()
                };
                let low = digits(self)?;
                let high = if self.peek() == Some(',') {
                    self.at += 1;
                    if self.peek() == Some('}') { None } else { Some(digits(self)?) }
                } else {
                    Some(low)
                };
                if self.next()? != '}' || high.is_some_and(|high| high < low) || low > 1000 || high.is_some_and(|high| high > 1000) {
                    return None;
                }
                match (low, high) {
                    (low, Some(high)) if low == high => out.push_str(&format!("{{{low}}}")),
                    (low, Some(high)) => out.push_str(&format!("{{{low},{high}}}")),
                    (low, None) => out.push_str(&format!("{{{low},}}")),
                }
            }
            _ => return Some(()),
        }
        match self.peek() {
            Some('?') => {
                self.at += 1;
                out.push('?');
            }
            Some('+' | '*' | '{') => return None,
            _ => {}
        }
        Some(())
    }

    fn alternatives(&mut self, out: &mut String) -> Option<()> {
        loop {
            match self.peek() {
                None => return Some(()),
                Some(')') => return (self.depth > 0).then_some(()),
                Some('|') => {
                    self.at += 1;
                    out.push('|');
                }
                Some('*' | '+' | '?' | '{') => return None,
                Some(_) => {
                    self.atom(out)?;
                    self.quantifier(out)?;
                }
            }
        }
    }

    fn atom(&mut self, out: &mut String) -> Option<()> {
        match self.next()? {
            '.' => out.push('.'),
            '^' => out.push('^'),
            '$' => out.push('$'),
            '[' => self.class(out)?,
            '(' => {
                if self.peek() == Some('?') {
                    self.at += 1;
                    if self.next()? != ':' {
                        return None;
                    }
                }
                out.push_str("(?:");
                self.depth += 1;
                self.alternatives(out)?;
                self.depth -= 1;
                if self.next()? != ')' {
                    return None;
                }
                out.push(')');
            }
            '\\' => {
                let letter = self.next()?;
                if let Some(class) = class_escape(letter) {
                    out.push_str(&format!("[{class}]"));
                } else if let Some(class) = class_escape(letter.to_ascii_lowercase()).filter(|_| letter.is_ascii_uppercase()) {
                    out.push_str(&format!("[^{class}]"));
                } else {
                    literal(char_escape(letter)?, out);
                }
            }
            other => literal(other, out),
        }
        Some(())
    }
}

/// The pattern written for the `regex` crate so that it matches a whole URI exactly when Java's would.
pub fn translated(pattern: &str) -> Option<String> {
    let chars: Vec<char> = pattern.chars().collect();
    let mut parser = Parser { chars: &chars, at: 0, depth: 0 };
    let mut out = String::from("^(?:");
    parser.alternatives(&mut out)?;
    if parser.at != chars.len() {
        return None;
    }
    out.push_str(")$");
    Some(out)
}

/// Whether Java's `Pattern.matches(pattern, uri)` holds; `None` when the pattern is outside the part this knows.
pub fn matches(pattern: &str, uri: &str) -> Option<bool> {
    let written = translated(pattern)?;
    let compiled = regex::Regex::new(&written).ok()?;
    Some(compiled.is_match(uri))
}

#[cfg(test)]
mod tests {
    use super::{matches, translated};

    #[test]
    fn whole_uris_match_as_in_java() {
        let uri = "file:///work/src/test/java/a/FooTest.java";
        assert_eq!(matches(".*/src/test/.*", uri), Some(true));
        assert_eq!(matches("src/test/.*", uri), Some(false));
        assert_eq!(matches(".*Test\\.java", uri), Some(true));
        assert_eq!(matches(".*/(test|testing)/java/[a-z]+/\\w+\\.java", uri), Some(true));
        assert_eq!(matches(".*/[^/]*Test\\.java$", uri), Some(true));
        assert_eq!(matches("^file:.*?Foo.*", uri), Some(true));
        assert_eq!(matches(".*\\d.*", uri), Some(false));
        assert_eq!(matches(".*\\D{3,}.*", uri), Some(true));
        assert_eq!(matches(".*(a|ab)(c|bcd)?.*", uri), Some(true));
        assert_eq!(matches("", uri), Some(false));
    }

    #[test]
    fn syntax_outside_the_known_part_is_refused() {
        for pattern in [
            "(?!x).*", "(?<n>a)", "(a)\\1", "a*+", "a++", "(?i)a", "\\p{L}", "\\Qa\\E", "[a&&b]", "[[a]]", "[]a]", "a{2,1}",
            "*a", "a**", "(a", "a)", "[a", "x{", "\\b", "\\x41", "\\u0041", "[z-a]", "\\R", "[\\d-z]",
        ] {
            assert_eq!(translated(pattern), None, "{pattern}");
        }
    }
}
