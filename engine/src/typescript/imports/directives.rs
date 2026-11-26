//! Triple-slash directives as the TypeScript parser reads them from the comments before the first token:
//! `/// <reference path>` files, then `/// <reference types>` packages, then `/// <amd-dependency path>` modules.
use regex::Regex;
use std::sync::OnceLock;

struct Directive {
    path: Option<String>,
    types: Option<String>,
    amd: Option<String>,
}

pub(super) fn of(text: &str) -> Result<Vec<(String, &'static str)>, String> {
    let mut directives: Vec<Directive> = Vec::new();
    for comment in leading_line_comments(text) {
        directives.extend(directive(comment)?);
    }
    let mut found: Vec<(String, &'static str)> = Vec::new();
    found.extend(directives.iter().filter_map(|it| it.path.clone()).map(|module| (module, "tsd-file")));
    found.extend(directives.iter().filter_map(|it| it.types.clone()).map(|module| (module, "tsd-type")));
    found.extend(directives.iter().filter_map(|it| it.amd.clone()).map(|module| (module, "tsd-amd")));
    Ok(found)
}

fn start_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"^///\s*<(\S+)\s.*?/>").expect("pattern"))
}

fn argument(comment: &str, name: &str) -> Option<String> {
    let pattern = Regex::new(&format!(r#"(?i)(\s{name}\s*=\s*)(?:'([^']*)'|"([^"]*)")"#)).expect("pattern");
    let found = pattern.captures(comment)?;
    let value = found.get(2).or_else(|| found.get(3)).map(|value| value.as_str()).unwrap_or_default();
    Some(value.to_string())
}

fn named(value: String) -> Result<String, String> {
    if value.is_empty() { Err("an empty triple-slash directive".to_string()) } else { Ok(value) }
}

fn directive(comment: &str) -> Result<Option<Directive>, String> {
    let Some(name) = start_pattern().captures(comment).and_then(|found| found.get(1)) else { return Ok(None) };
    let none = Directive { path: None, types: None, amd: None };
    match name.as_str().to_lowercase().as_str() {
        "reference" => {
            if argument(comment, "no-default-lib").as_deref() == Some("true") {
                return Ok(None);
            }
            if let Some(types) = argument(comment, "types") {
                return Ok(Some(Directive { types: Some(named(types)?), ..none }));
            }
            if argument(comment, "lib").is_some() {
                return Ok(None);
            }
            match argument(comment, "path") {
                Some(path) => Ok(Some(Directive { path: Some(named(path)?), ..none })),
                None => Ok(None),
            }
        }
        "amd-dependency" => match argument(comment, "path") {
            Some(path) => Ok(Some(Directive { amd: Some(named(path)?), ..none })),
            None => Ok(None),
        },
        _ => Ok(None),
    }
}

fn is_space(character: char) -> bool {
    matches!(character, '\t' | '\u{b}' | '\u{c}' | ' ' | '\u{a0}' | '\u{feff}' | '\u{85}' | '\u{1680}' | '\u{2000}'..='\u{200b}')
        || matches!(character, '\u{202f}' | '\u{205f}' | '\u{3000}')
}

fn is_line_break(character: char) -> bool {
    matches!(character, '\n' | '\r' | '\u{2028}' | '\u{2029}')
}

/// The single-line comments among the comments that come before the first token, after a `#!` line.
fn leading_line_comments(text: &str) -> Vec<&str> {
    let mut at = if text.starts_with("#!") { text.find(is_line_break).unwrap_or(text.len()) } else { 0 };
    let mut comments = Vec::new();
    while at < text.len() {
        let rest = &text[at..];
        let character = rest.chars().next().unwrap_or_default();
        if is_space(character) || is_line_break(character) {
            at += character.len_utf8();
        } else if rest.starts_with("//") {
            let end = rest.find(is_line_break).unwrap_or(rest.len());
            comments.push(&rest[..end]);
            at += end;
        } else if rest.starts_with("/*") {
            match rest[2..].find("*/") {
                Some(end) => at += end + 4,
                None => break,
            }
        } else {
            break;
        }
    }
    comments
}
