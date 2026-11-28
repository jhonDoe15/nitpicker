//! JavaScript `u` and `iu` patterns on Rust's engine: `\s` is JavaScript's white space, `\w` and `\b` are ASCII,
//! and under `iu`, where JavaScript also counts U+017F and U+212A as word characters, the text is matched with
//! those two folded to `s` and `k`, and captures are read back from the original text.
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::{SPACE, string_value};
use regex::Regex;

const WORD: &str = "0-9A-Za-z_";

/// The Rust form of a JavaScript pattern with the `u` flag, and `i` when `ignore_case`.
pub fn js_pattern(source: &str, ignore_case: bool) -> Regex {
    let space = &SPACE[1..SPACE.len() - 1];
    let mut translated = String::from(if ignore_case { "(?i)" } else { "" });
    let mut in_class = false;
    let mut characters = source.chars();
    while let Some(character) = characters.next() {
        match character {
            '\\' => {
                let Some(escaped) = characters.next() else { break };
                let replacement = match (escaped, in_class) {
                    ('s', true) => space.to_string(),
                    ('s', false) => format!("[{space}]"),
                    ('S', false) => format!("[^{space}]"),
                    ('w', true) => WORD.to_string(),
                    ('w', false) => format!("[{WORD}]"),
                    ('b', false) => r"(?-u:\b)".to_string(),
                    _ => format!("\\{escaped}"),
                };
                translated.push_str(&replacement);
            }
            '[' if !in_class => {
                in_class = true;
                translated.push(character);
            }
            ']' if in_class => {
                in_class = false;
                translated.push(character);
            }
            _ => translated.push(character),
        }
    }
    Regex::new(&translated).expect("pattern")
}

/// A text with U+017F and U+212A folded to `s` and `k`, for an `iu` pattern.
pub struct Folded<'t> {
    pub original: &'t str,
    pub text: String,
    starts: Vec<(usize, usize)>,
}

impl<'t> Folded<'t> {
    pub fn of(original: &'t str) -> Folded<'t> {
        let mut text = String::with_capacity(original.len());
        let mut starts = Vec::with_capacity(original.len() + 1);
        for (at, character) in original.char_indices() {
            starts.push((text.len(), at));
            text.push(match character {
                '\u{17F}' => 's',
                '\u{212A}' => 'k',
                other => other,
            });
        }
        starts.push((text.len(), original.len()));
        Folded { original, text, starts }
    }

    fn original_at(&self, folded: usize) -> usize {
        let index = self.starts.partition_point(|(start, _)| *start < folded);
        self.starts.get(index).map_or(self.original.len(), |(_, at)| *at)
    }

    /// The original text of a range of the folded text.
    pub fn slice(&self, start: usize, end: usize) -> &'t str {
        &self.original[self.original_at(start)..self.original_at(end)]
    }
}

/// `memberName` with JavaScript's string values: a lone surrogate in a computed key becomes U+FFFD instead of
/// losing the name.
pub fn member_name(member: Node) -> Option<String> {
    let property = member.node("property")?;
    if member.flag("computed") {
        return string_value(Some(property));
    }
    property.is("Identifier").then(|| property.name().map(|name| name.into_owned())).flatten()
}
