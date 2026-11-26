//! Java string and character literals: decoding a character literal and quoting text the way a fix writes it back.

/// The escapes a fix writes: control characters and quotes with a backslash, printable ASCII as it is, the rest as `\uXXXX`.
pub fn quote(text: &str) -> String {
    let mut quoted = String::new();
    for unit in text.encode_utf16() {
        match unit {
            0x08 => quoted.push_str("\\b"),
            0x0c => quoted.push_str("\\f"),
            0x0a => quoted.push_str("\\n"),
            0x0d => quoted.push_str("\\r"),
            0x09 => quoted.push_str("\\t"),
            0x27 => quoted.push_str("\\'"),
            0x22 => quoted.push_str("\\\""),
            0x5c => quoted.push_str("\\\\"),
            0x20..=0x7e => quoted.push(char::from(unit as u8)),
            _ => quoted.push_str(&format!("\\u{unit:04x}")),
        }
    }
    quoted
}

/// The character a literal such as `'a'`, `'\n'`, `'é'` or `'\101'` stands for.
pub fn character_value(literal: &str) -> Option<char> {
    let inner = literal.strip_prefix('\'')?.strip_suffix('\'')?;
    let mut chars = inner.chars();
    let first = chars.next()?;
    if first != '\\' {
        return chars.next().is_none().then_some(first);
    }
    let rest: String = chars.collect();
    let mut escaped = rest.chars();
    let kind = escaped.next()?;
    let value = match kind {
        'b' => '\u{8}',
        't' => '\t',
        'n' => '\n',
        'f' => '\u{c}',
        'r' => '\r',
        's' => ' ',
        '"' => '"',
        '\'' => '\'',
        '\\' => '\\',
        'u' => {
            let digits = rest.trim_start_matches('u');
            return char::from_u32(u32::from_str_radix(digits, 16).ok()?);
        }
        '0'..='7' => return char::from_u32(u32::from_str_radix(&rest, 8).ok()?),
        _ => return None,
    };
    escaped.next().is_none().then_some(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn quotes_like_a_fix() {
        assert_eq!(quote("a\"\n\\\u{e9}\u{7f}'"), "a\\\"\\n\\\\\\u00e9\\u007f\\'");
    }

    #[test]
    fn reads_character_literals() {
        assert_eq!(character_value("'a'"), Some('a'));
        assert_eq!(character_value("'\\n'"), Some('\n'));
        assert_eq!(character_value("'\\u00e9'"), Some('\u{e9}'));
        assert_eq!(character_value("'\\101'"), Some('A'));
        assert_eq!(character_value("'\\''"), Some('\''));
        assert_eq!(character_value("'\\0'"), Some('\0'));
    }
}
