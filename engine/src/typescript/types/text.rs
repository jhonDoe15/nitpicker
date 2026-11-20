//! The text of a file as the compiler holds it, addressed the way the compiler addresses it: in UTF-16 units.
use std::borrow::Cow;

pub struct SourceText {
    text: String,
    /// For files with characters outside ASCII: the byte offset of each UTF-16 unit, and of the end.
    bytes_of_units: Option<Vec<u32>>,
}

impl SourceText {
    pub fn of(bytes: &[u8]) -> SourceText {
        let text = match String::from_utf8_lossy(bytes) {
            Cow::Borrowed(text) => text.to_string(),
            Cow::Owned(text) => text,
        };
        let bytes_of_units = (!text.is_ascii()).then(|| {
            let mut offsets = Vec::with_capacity(text.len() + 1);
            for (at, character) in text.char_indices() {
                for _ in 0..character.len_utf16() {
                    offsets.push(at as u32);
                }
            }
            offsets.push(text.len() as u32);
            offsets
        });
        SourceText { text, bytes_of_units }
    }

    pub fn as_str(&self) -> &str {
        &self.text
    }

    fn byte(&self, unit: u32) -> usize {
        match &self.bytes_of_units {
            Some(offsets) => offsets[(unit as usize).min(offsets.len() - 1)] as usize,
            None => (unit as usize).min(self.text.len()),
        }
    }

    /// Length in UTF-16 units.
    pub fn units(&self) -> u32 {
        self.bytes_of_units.as_ref().map_or(self.text.len(), |offsets| offsets.len() - 1) as u32
    }

    pub fn slice(&self, start: u32, end: u32) -> &str {
        &self.text[self.byte(start)..self.byte(end.max(start))]
    }

    /// The 1-based line of a position; lines end at `\n`, `\r\n`, `\r` and the two Unicode line separators.
    pub fn line_of(&self, unit: u32) -> u32 {
        let before = &self.text[..self.byte(unit)];
        let mut line = 1;
        let mut characters = before.chars().peekable();
        while let Some(character) = characters.next() {
            if character == '\r' {
                if characters.peek() == Some(&'\n') {
                    characters.next();
                }
                line += 1;
            } else if matches!(character, '\n' | '\u{2028}' | '\u{2029}') {
                line += 1;
            }
        }
        line
    }

    fn unit_at(&self, unit: u32) -> Option<char> {
        self.text[self.byte(unit)..].chars().next()
    }

    fn starts_with(&self, unit: u32, prefix: &str) -> bool {
        self.text[self.byte(unit)..].starts_with(prefix)
    }

    /// Where the first token at or after `pos` starts: past spaces, line breaks, comments, a `#!` line at the
    /// top and version-control conflict markers, as the compiler's scanner skips them.
    pub fn skip_trivia(&self, pos: u32, stop_at_comments: bool) -> u32 {
        let end = self.units();
        let mut pos = pos;
        let mut can_consume_star = false;
        loop {
            let Some(character) = (pos < end).then(|| self.unit_at(pos)).flatten() else { return pos };
            match character {
                '\r' | '\n' => {
                    pos += 1;
                    can_consume_star = false;
                }
                '\t' | '\u{b}' | '\u{c}' | ' ' => pos += 1,
                '/' => {
                    if stop_at_comments {
                        return pos;
                    }
                    if self.starts_with(pos, "//") {
                        pos += 2;
                        while pos < end && !self.unit_at(pos).is_some_and(is_line_break) {
                            pos += 1;
                        }
                        can_consume_star = false;
                    } else if self.starts_with(pos, "/*") {
                        pos += 2;
                        while pos < end && !self.starts_with(pos, "*/") {
                            pos += 1;
                        }
                        pos = (pos + 2).min(end);
                        can_consume_star = false;
                    } else {
                        return pos;
                    }
                }
                '<' | '|' | '=' | '>' => {
                    if self.is_conflict_marker(pos, character) {
                        pos = self.skip_conflict_marker(pos, character);
                        can_consume_star = false;
                    } else {
                        return pos;
                    }
                }
                '#' => {
                    if pos == 0 && self.starts_with(pos, "#!") {
                        while pos < end && !self.unit_at(pos).is_some_and(is_line_break) {
                            pos += 1;
                        }
                        can_consume_star = false;
                    } else {
                        return pos;
                    }
                }
                '*' => {
                    if can_consume_star {
                        pos += 1;
                        can_consume_star = false;
                    } else {
                        return pos;
                    }
                }
                other => {
                    if other as u32 > 127 && is_white_space_like(other) {
                        pos += other.len_utf16() as u32;
                    } else {
                        return pos;
                    }
                }
            }
        }
    }

    fn is_conflict_marker(&self, pos: u32, character: char) -> bool {
        if pos != 0 && !self.unit_at(pos - 1).is_some_and(is_line_break) {
            return false;
        }
        let marker: String = std::iter::repeat_n(character, 7).collect();
        if pos + 7 >= self.units() || !self.starts_with(pos, &marker) {
            return false;
        }
        character == '=' || self.unit_at(pos + 7) == Some(' ')
    }

    fn skip_conflict_marker(&self, pos: u32, character: char) -> u32 {
        let end = self.units();
        let mut pos = pos;
        if character == '<' || character == '>' {
            while pos < end && !self.unit_at(pos).is_some_and(is_line_break) {
                pos += 1;
            }
            return pos;
        }
        while pos < end {
            let current = self.unit_at(pos);
            if (current == Some('=') || current == Some('>')) && current != Some(character) && self.is_conflict_marker(pos, current.expect("character")) {
                break;
            }
            pos += 1;
        }
        pos
    }
}

pub fn is_line_break(character: char) -> bool {
    matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

fn is_white_space_like(character: char) -> bool {
    is_line_break(character)
        || matches!(
            character,
            ' ' | '\t' | '\u{b}' | '\u{c}' | '\u{a0}' | '\u{85}' | '\u{1680}' | '\u{2000}'..='\u{200b}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
        )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn skips_spaces_comments_and_a_shebang() {
        let text = SourceText::of(b"#!/usr/bin/env node\n  // note\n /* a */ const a = 1;");
        assert_eq!(text.slice(text.skip_trivia(0, false), text.units()), "const a = 1;");
        assert_eq!(text.skip_trivia(20, true), 22);
    }

    #[test]
    fn positions_count_utf16_units() {
        let text = SourceText::of("const \u{e9} = '\u{1f600}'; b".as_bytes());
        assert_eq!(text.units(), 17);
        assert_eq!(text.slice(6, 7), "\u{e9}");
        assert_eq!(text.slice(11, 13), "\u{1f600}");
        assert_eq!(text.slice(16, 17), "b");
    }

    #[test]
    fn skips_conflict_markers_at_line_starts() {
        let text = SourceText::of(b"<<<<<<< HEAD\na;\n=======\nb;\n>>>>>>> other\nc;");
        assert_eq!(text.slice(text.skip_trivia(0, false), text.units()), "a;\n=======\nb;\n>>>>>>> other\nc;");
        let after = text.skip_trivia(16, false);
        assert_eq!(text.slice(after, text.units()), "c;");
    }
}
