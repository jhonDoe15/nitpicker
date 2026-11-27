//! `sql-text.mts`: the statement and clause shapes SQL text starts with, and the fragments a value follows. The
//! patterns are JavaScript's, written with JavaScript's `\s`, and with `\w` and `\b` over ASCII words: under `iu`
//! JavaScript also counts U+017F and U+212A as word characters, which the text gets as `s` and `k` before a
//! case-insensitive test.
use crate::typescript::rules::urls::values::SPACE;
use regex::Regex;
use std::sync::LazyLock;

pub const DYNAMIC: char = '\0';
const STATEMENT_FORMS: &str = r"SELECT\b(?s:.)+?\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\S+\s+SET\b|DELETE\s+FROM\b|REPLACE\s+INTO\b|MERGE\s+INTO\b|TRUNCATE\s+TABLE\b|DROP\s+(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA)\b|ALTER\s+TABLE\b|CREATE\s+(?:UNIQUE\s+)?(?:TABLE|INDEX|VIEW|DATABASE|SCHEMA)\b|WITH\s+\S+\s+AS\s*\(";
const COMPARISON: &str = r"\s*(?:=|<>|!=|<=|>=|<|>|\bLIKE\b|\bIN\b|\bNOT\s+IN\b|\bIS\b)";
const NAME: &str = r#"[\w."`\[\]]"#;
const FRAGMENT: &str = r#"(?:\b(?:where|and|or|having|on)\s+[\w."`\[\]]+\s*(?:=|<>|!=|<=|>=|<|>|\blike|\bin|\bnot\s+in)\s*(?:\(\s*)?['"%]*|\b(?:order|group)\s+by\s+|\b(?:limit|offset)\s+)$"#;
const VALUE: &str = r#"(?:=|<>|!=|<=|>=|<|>|\blike|\bin|\bnot\s+in|\bbetween|\band)\s*(?:\(\s*)?['"%]*$"#;

fn js(pattern: &str, ignore_case: bool) -> Regex {
    let non_space = format!("[^{}]", &SPACE[1..SPACE.len() - 1]);
    let translated = pattern.replace(r"\s", SPACE).replace(r"\S", &non_space).replace(r"\w", "0-9A-Za-z_").replace(r"\b", r"(?-u:\b)");
    let flags = if ignore_case { "(?i)" } else { "" };
    Regex::new(&format!("{flags}{translated}")).expect("SQL pattern")
}

static STRONG: LazyLock<Regex> = LazyLock::new(|| js(&format!(r"^\s*(?:{STATEMENT_FORMS}|(?:WHERE|AND|OR|HAVING|ON)\s+{NAME}+{COMPARISON}|(?:ORDER|GROUP)\s+BY\b|LIMIT\b|OFFSET\b|VALUES\s*\()"), false));
static LOOSE: LazyLock<Regex> = LazyLock::new(|| js(&format!(r"^\s*(?:{STATEMENT_FORMS})"), true));
static FRAGMENT_BEFORE: LazyLock<Regex> = LazyLock::new(|| js(FRAGMENT, true));
static VALUE_POSITION: LazyLock<Regex> = LazyLock::new(|| js(VALUE, true));

fn folded(text: &str) -> String {
    text.replace('\u{17F}', "s").replace('\u{212A}', "k")
}

pub fn is_strong_statement(text: &str) -> bool {
    STRONG.is_match(text)
}

pub fn is_loose_statement(text: &str) -> bool {
    LOOSE.is_match(&folded(text))
}

pub fn is_fragment_before_value(text: &str) -> bool {
    FRAGMENT_BEFORE.is_match(&folded(text))
}

pub fn is_value_position(text: &str) -> bool {
    VALUE_POSITION.is_match(&folded(text))
}
