//! `table-names.mts`: the table key a model, repository or table name stands for.
use crate::typescript::rules::html_text::parts::js_trim;
use crate::typescript::rules::queries::js_patterns::{Folded, js_pattern};
use regex::Regex;
use std::sync::LazyLock;

const MIN_PLURAL_LENGTH: usize = 3;
const SUFFIXES: [&str; 7] = ["repository", "repo", "entity", "model", "table", "schema", "dao"];

static AS: LazyLock<Regex> = LazyLock::new(|| js_pattern(r"\s+as\s+", true));

/// `tableKey`.
pub fn table_key(name: Option<&str>) -> Option<String> {
    let name = name.filter(|name| !name.is_empty())?;
    let last = name.rsplit('.').next().unwrap_or_default();
    let folded = Folded::of(last);
    let before = match AS.find(&folded.text) {
        Some(found) => folded.slice(0, found.start()),
        None => last,
    };
    let lowered: String = js_trim(before).chars().filter(char::is_ascii_alphanumeric).map(|character| character.to_ascii_lowercase()).collect();
    let stripped = SUFFIXES.iter().find_map(|suffix| lowered.strip_suffix(suffix)).unwrap_or(&lowered);
    let singular = if stripped.ends_with('s') && stripped.len() > MIN_PLURAL_LENGTH { &stripped[..stripped.len() - 1] } else { stripped };
    (!singular.is_empty()).then(|| singular.to_string())
}
