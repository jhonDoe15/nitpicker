//! Suggested fixes, shown the way Error Prone shows them: the first changed line after the fix, after "Did you mean".

/// Error Prone looks this many UTF-16 units around the first edit for the line it shows.
const LINE_REACH: usize = 100;

/// One suggested fix: replacements of byte ranges of the file, and whether it also adds or removes imports.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Fix {
    edits: Vec<(usize, usize, String)>,
    imports: bool,
}

impl Fix {
    pub fn new() -> Fix {
        Fix::default()
    }
    pub fn replace(start: usize, end: usize, text: impl Into<String>) -> Fix {
        Fix::new().and(start, end, text)
    }
    /// Adds a replacement. A second insertion at the same place goes after the first; the same insertion twice counts once.
    pub fn and(mut self, start: usize, end: usize, text: impl Into<String>) -> Fix {
        let text = text.into();
        if let Some(existing) = self.edits.iter_mut().find(|edit| edit.0 == start && edit.1 == end) {
            if start == end && existing.2 != text {
                existing.2.push_str(&text);
            }
            return self;
        }
        self.edits.push((start, end, text));
        self
    }
    /// Adds every replacement of another fix, the way `SuggestedFix.merge` does.
    pub fn insert(self, at: usize, text: impl Into<String>) -> Fix {
        self.and(at, at, text)
    }
    pub fn delete(self, start: usize, end: usize) -> Fix {
        self.and(start, end, "")
    }
    /// The fix also adds or removes an import.
    pub fn with_imports(mut self) -> Fix {
        self.imports = true;
        self
    }
    /// The edits of both fixes in one.
    pub fn merged(mut self, other: Fix) -> Fix {
        for (start, end, text) in other.edits {
            self = self.and(start, end, text);
        }
        self.imports |= other.imports;
        self
    }
    pub fn is_empty(&self) -> bool {
        self.edits.is_empty()
    }
    pub fn changes_imports(&self) -> bool {
        self.imports
    }
    /// What Error Prone shows for the fix: the trimmed first changed line, `None` when the fix changes no text.
    pub fn shown(&self, text: &str) -> Option<String> {
        let mut edits: Vec<&(usize, usize, String)> = self.edits.iter().collect();
        edits.sort_by_key(|edit| (edit.0, edit.1));
        let first = *edits.first()?;
        if edits.iter().any(|edit| edit.1 > text.len() || !text.is_char_boundary(edit.0) || !text.is_char_boundary(edit.1)) {
            return None;
        }
        let start = back(text, first.0, LINE_REACH);
        let trimmed_end = forth(text, first.1, LINE_REACH);
        let mut end = trimmed_end;
        let mut replaced = String::new();
        let mut at = start;
        for edit in edits.iter().filter(|edit| edit.0 <= trimmed_end && start <= edit.1) {
            if edit.0 < at || edit.1 > text.len() {
                return None;
            }
            end = end.max(edit.1);
            replaced.push_str(&text[at..edit.0]);
            replaced.push_str(&edit.2);
            at = edit.1;
        }
        replaced.push_str(&text[at..end]);
        let edited = first.0 - start;
        let line_start = if edited == 0 { 0 } else { replaced[..edited].rfind('\n').unwrap_or(0) };
        let line_end = replaced[edited..].find('\n').map_or(replaced.len(), |found| edited + found);
        let mut snippet = java_trim(&replaced[line_start..line_end]);
        if let Some(comment) = snippet.find("//") {
            snippet = java_trim(&snippet[..comment]);
        }
        Some(snippet.to_string())
    }
}

/// The sentence Error Prone adds to a message for its fixes, empty when no fix changes the text.
pub fn sentence(text: &str, fixes: &[Fix]) -> String {
    let shown: Vec<String> = fixes
        .iter()
        .filter_map(|fix| fix.shown(text))
        .map(|line| if line.is_empty() { "to remove this line".to_string() } else { format!("'{line}'") })
        .collect();
    if shown.is_empty() { String::new() } else { format!("\n  Did you mean {}?", shown.join(" or ")) }
}

fn java_trim(text: &str) -> &str {
    text.trim_matches(|character: char| character <= ' ')
}

/// The byte offset `units` UTF-16 units before `offset`, or the start of the text.
fn back(text: &str, offset: usize, units: usize) -> usize {
    let mut left = units;
    for (at, character) in text[..offset].char_indices().rev() {
        let width = character.len_utf16();
        if width > left {
            return at + character.len_utf8();
        }
        left -= width;
        if left == 0 {
            return at;
        }
    }
    0
}

/// The byte offset `units` UTF-16 units after `offset`, or the end of the text.
fn forth(text: &str, offset: usize, units: usize) -> usize {
    let mut left = units;
    for (at, character) in text[offset..].char_indices() {
        let width = character.len_utf16();
        if width > left {
            return offset + at;
        }
        left -= width;
        if left == 0 {
            return offset + at + character.len_utf8();
        }
    }
    text.len()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn shows_the_first_changed_line() {
        let text = "class A {\n  int a, b; // two\n}\n";
        let at = text.find(", b").unwrap();
        assert_eq!(sentence(text, &[Fix::replace(at, at + 1, ";int")]), "\n  Did you mean 'int a;int b;'?");
    }

    #[test]
    fn an_empty_line_is_a_removal() {
        let text = "class A {\n  ;\n}\n";
        let at = text.find(';').unwrap();
        assert_eq!(sentence(text, &[Fix::replace(at, at + 1, ""), Fix::new()]), "\n  Did you mean to remove this line?");
    }

    #[test]
    fn a_long_line_is_cut_where_error_prone_cuts_it() {
        let text = format!("{}x", "a".repeat(150));
        assert_eq!(Fix::replace(150, 151, "y").shown(&text).unwrap(), format!("{}y", "a".repeat(100)));
    }

    #[test]
    fn insertions_at_one_place_keep_their_order() {
        let text = "f();";
        assert_eq!(Fix::new().insert(0, "a").insert(0, "b").insert(0, "a").shown(text).unwrap(), "abaf();");
    }
}
