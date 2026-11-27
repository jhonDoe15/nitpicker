use super::code::code_bytes;
use crate::engine::source::{walk, Names};

/// The identifiers written with Unicode escapes, with the names javac reads for them (`\u00e9` is `é`).
pub fn escaped(text: &str, tree: &tree_sitter::Tree) -> Names {
    if !text.contains("\\u") {
        return Names::default();
    }
    let mut names = Vec::new();
    walk(tree.root_node(), |node| {
        if matches!(node.kind(), "identifier" | "type_identifier") {
            let written = &text[node.byte_range()];
            if written.contains('\\') {
                names.push((node.start_byte(), node.end_byte(), super::literals::translated(written).into_iter().collect()));
            }
        }
    });
    Names::new(names)
}

const RESERVED: &[&str] = &[
    "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue", "default", "do",
    "double", "else", "enum", "extends", "final", "finally", "float", "for", "goto", "if", "implements", "import",
    "instanceof", "int", "interface", "long", "native", "new", "package", "private", "protected", "public", "return",
    "short", "static", "strictfp", "super", "switch", "synchronized", "this", "throw", "throws", "transient", "try", "void",
    "volatile", "while", "true", "false", "null", "_", "var", "yield", "record", "sealed", "permits", "when", "module",
];

/// The grammar takes no Unicode escape in an identifier. In code, the backslash of each escape in a name becomes a
/// `_`, which keeps one identifier; the rules read the name `escaped` gives. A name that reads as a keyword (contextual
/// ones too), or an escape of a character that is not part of a name, is left, and the file stays broken.
pub(super) fn mask_escaped_names(text: &str, bytes: &mut Option<Vec<u8>>) {
    let raw = text.as_bytes();
    let code = code_bytes(text);
    let mut at = 0;
    while at < raw.len() {
        if !code[at] || !(raw[at] == b'\\' || part(raw[at])) || (at > 0 && code[at - 1] && part(raw[at - 1])) {
            at += 1;
            continue;
        }
        let start = at;
        let mut escapes = Vec::new();
        let mut name = String::new();
        let mut word = true;
        while at < raw.len() && code[at] {
            if raw[at] == b'\\' {
                let Some((decoded, length)) = escape(&raw[at..]) else { word = false; break };
                if !(decoded.is_alphanumeric() || decoded == '_' || decoded == '$') {
                    word = false;
                    break;
                }
                escapes.push(at);
                name.push(decoded);
                at += length;
            } else if part(raw[at]) {
                name.push(char::from(raw[at]));
                at += 1;
            } else if raw[at] >= 0x80 {
                let character = text[at..].chars().next().unwrap_or(' ');
                if !character.is_alphanumeric() {
                    break;
                }
                name.push(character);
                at += character.len_utf8();
            } else {
                break;
            }
        }
        if escapes.is_empty() || !word || RESERVED.contains(&name.as_str()) || name.starts_with(|first: char| first.is_ascii_digit()) {
            at = at.max(start + 1);
            continue;
        }
        let bytes = bytes.get_or_insert_with(|| raw.to_vec());
        for escape in escapes {
            bytes[escape] = b'_';
        }
    }
}

fn part(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'$'
}

/// A Unicode escape at the start of `bytes`: the character and the length of the escape.
fn escape(bytes: &[u8]) -> Option<(char, usize)> {
    let mut at = 1;
    while bytes.get(at) == Some(&b'u') {
        at += 1;
    }
    if at == 1 {
        return None;
    }
    let digits = std::str::from_utf8(bytes.get(at..at + 4)?).ok()?;
    let unit = u32::from_str_radix(digits, 16).ok()?;
    Some((char::from_u32(unit)?, at + 4))
}
