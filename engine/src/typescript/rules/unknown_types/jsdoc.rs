//! The documentation comments of `no-unknown-in-domain`: the tags whose type mentions `unknown` as a member, read
//! as the plugin's JSDoc parser reads them (`unknownMemberTags`). Only the tags that can be selected are parsed.
use fancy_regex::Regex;
use std::sync::LazyLock;

const SPACE: &str = r"[\t\n\x0B\x0C\r\p{Z}\x{FEFF}]";
const WORD: &str = "[A-Za-z0-9_]";

fn pattern(text: &str) -> Regex {
    Regex::new(&text.replace("SP", SPACE).replace("WD", WORD)).expect("pattern")
}

static NAME: LazyLock<Regex> = LazyLock::new(|| pattern(r"^(?:\[[^\]]*\]|[A-Za-z0-9_$.]+)"));
static STRING_LITERAL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r#"'[^']*'|"[^"]*"|`[^`]*`"#).expect("pattern"));
static UNKNOWN_WORD: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?<![A-Za-z0-9_$.])unknown(?![A-Za-z0-9_$])(?!SP*\??:)"));
static TAG_LINE: LazyLock<Regex> = LazyLock::new(|| pattern(r"^SP*@(WD+)"));
static COMMENT_PREFIX: LazyLock<Regex> = LazyLock::new(|| pattern(r"^SP*\*?SP?"));

const MEMBER_TAGS: [&str; 3] = ["param", "property", "prop"];
const OTHER_TYPE_TAGS: [&str; 6] = ["returns", "return", "type", "typedef", "satisfies", "this"];
const NAMED_TAGS: [&str; 4] = ["param", "property", "prop", "typedef"];
const CAUGHT_ERROR_NAMES: [&str; 2] = ["cause", "error"];

struct Tag {
    name: String,
    kind: Option<String>,
    given: Option<String>,
}

fn is_space(character: char) -> bool {
    matches!(character, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | '\u{feff}') || (character.is_whitespace() && character != '\u{85}')
}

fn trim(text: &str) -> &str {
    text.trim_matches(is_space)
}

fn without_strings(kind: &str) -> String {
    STRING_LITERAL.replace_all(kind, "\"\"").into_owned()
}

fn take_type(text: &str) -> Option<(String, String)> {
    if !text.starts_with('{') {
        return None;
    }
    let mut depth = 0i32;
    for (index, character) in text.char_indices() {
        depth += match character {
            '{' => 1,
            '}' => -1,
            _ => 0,
        };
        if depth == 0 {
            return Some((trim(&text[1..index]).to_string(), trim(&text[index + 1..]).to_string()));
        }
    }
    None
}

fn parse_tag(tag: &str, body: &str) -> Option<Tag> {
    let text = trim(body);
    let (kind, after) = take_type(text)?;
    let given = if NAMED_TAGS.contains(&tag) {
        let found = NAME.find(&after).ok().flatten()?;
        Some(trim(found.as_str()).to_string())
    } else {
        None
    };
    Some(Tag { name: tag.to_string(), kind: Some(kind), given })
}

fn tags_of(comment: &str) -> Vec<Tag> {
    let mut segments: Vec<(String, String)> = Vec::new();
    for line in comment.split('\n') {
        let cleaned = match COMMENT_PREFIX.find(line).ok().flatten() {
            Some(prefix) => &line[prefix.end()..],
            None => line,
        };
        let tagged = TAG_LINE.captures(cleaned).ok().flatten();
        match tagged {
            Some(found) => {
                let whole = found.get(0).map_or(0, |matched| matched.end());
                segments.push((found[1].to_string(), format!("{}\n", &cleaned[whole..])));
            }
            None => {
                if let Some((_, text)) = segments.last_mut() {
                    text.push_str(cleaned);
                    text.push('\n');
                }
            }
        }
    }
    segments.iter().filter(|(name, _)| MEMBER_TAGS.contains(&name.as_str()) || OTHER_TYPE_TAGS.contains(&name.as_str())).filter_map(|(name, body)| parse_tag(name, body)).collect()
}

fn mentions_word(kind: &str) -> bool {
    UNKNOWN_WORD.is_match(&without_strings(kind)).unwrap_or(false)
}

fn regions(text: &str) -> Vec<(usize, usize)> {
    let units: Vec<u16> = text.encode_utf16().collect();
    let mut found = Vec::new();
    let mut open: Vec<(char, usize)> = Vec::new();
    for (index, character) in text.chars().enumerate() {
        if character == '(' || character == '{' {
            open.push((character, index));
        }
        if character == ')' || character == '}' {
            let opener = open.pop();
            let rest = String::from_utf16_lossy(units.get(index + 1..).unwrap_or_default());
            let is_list = opener.is_some_and(|(kind, _)| kind == '{' || (kind == '(' && rest.trim_start_matches(is_space).starts_with("=>")));
            if let (true, Some((_, start))) = (is_list, opener) {
                found.push((start, index));
            }
        }
    }
    found
}

fn in_member_position(kind: &str) -> bool {
    let text = without_strings(kind);
    let regions = regions(&text);
    UNKNOWN_WORD.find_iter(&text).filter_map(Result::ok).any(|matched| {
        let at = text[..matched.start()].encode_utf16().count();
        regions.iter().any(|(start, end)| at > *start && at < *end)
    })
}

fn is_caught_error_slot(tag: &Tag) -> bool {
    tag.kind.as_deref() == Some("unknown") && tag.given.as_deref().is_some_and(|name| CAUGHT_ERROR_NAMES.contains(&name))
}

fn mentions_unknown_as_member(tag: &Tag) -> bool {
    let Some(kind) = &tag.kind else { return false };
    if MEMBER_TAGS.contains(&tag.name.as_str()) {
        return mentions_word(kind);
    }
    OTHER_TYPE_TAGS.contains(&tag.name.as_str()) && in_member_position(kind)
}

/// Whether the text of a block comment (between `/*` and `*/`) is a documentation comment with such a tag.
pub fn has_unknown_member_tag(value: &str) -> bool {
    value.starts_with('*') && tags_of(value).iter().any(|tag| mentions_unknown_as_member(tag) && !is_caught_error_slot(tag))
}
