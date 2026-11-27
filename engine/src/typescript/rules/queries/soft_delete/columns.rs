//! `columns.mts`: the soft-delete and visibility column names, the helper names that apply such a filter, the
//! options that read deleted rows on purpose, and the learned filters by table.
use crate::typescript::rules::queries::js_patterns::{Folded, js_pattern};
use crate::typescript::rules::secrets::words::words_of;
use regex::Regex;
use std::sync::LazyLock;

pub const COLUMN_NAMES: &str = "deleted_?at|is_?deleted|deleted|archived(?:_?at)?|is_?archived|visibility|is_?visible|hidden|is_?hidden";
const HELPER_WORDS: [&str; 9] = ["deleted", "undeleted", "visible", "visibility", "active", "archived", "trashed", "alive", "live"];
const ACKNOWLEDGED: [&str; 6] = ["withDeleted", "onlyDeleted", "includeDeleted", "withTrashed", "onlyTrashed", "unscoped"];
const SEPARATOR: &str = "__";
const HELPER_PART: &str = "helper";

static COLUMN: LazyLock<Regex> = LazyLock::new(|| js_pattern(&format!("^(?:{COLUMN_NAMES})$"), true));

/// `TableFilter`: the columns by key and the helpers that guard a table, in the order the options give them.
#[derive(Default)]
pub struct TableFilter {
    pub columns: Vec<(String, String)>,
    pub helpers: Vec<String>,
}

pub fn set_column(columns: &mut Vec<(String, String)>, key: String, column: String) {
    match columns.iter_mut().find(|(known, _)| *known == key) {
        Some(entry) => entry.1 = column,
        None => columns.push((key, column)),
    }
}

/// `isColumn`.
pub fn is_column(name: Option<&str>) -> bool {
    name.is_some_and(|name| COLUMN.is_match(&Folded::of(name).text))
}

/// `isAcknowledgement`.
pub fn is_acknowledgement(name: Option<&str>) -> bool {
    name.is_some_and(|name| ACKNOWLEDGED.contains(&name))
}

/// `isHelperName`.
pub fn is_helper_name(name: Option<&str>) -> bool {
    name.is_some_and(|name| !is_column(Some(name)) && !is_acknowledgement(Some(name)) && words_of(name).iter().any(|word| HELPER_WORDS.contains(&word.as_str())))
}

/// `columnKey`.
pub fn column_key(name: &str) -> String {
    name.to_lowercase().replace('_', "")
}

/// `filtersByTable`.
pub fn filters_by_table(entries: &[String]) -> Vec<(String, TableFilter)> {
    let mut tables: Vec<(String, TableFilter)> = Vec::new();
    for entry in entries {
        let mut parts = entry.split(SEPARATOR);
        let table = parts.next().unwrap_or_default().to_string();
        let rest: Vec<&str> = parts.collect();
        let index = match tables.iter().position(|(known, _)| *known == table) {
            Some(index) => index,
            None => {
                tables.push((table, TableFilter::default()));
                tables.len() - 1
            }
        };
        let found = &mut tables[index].1;
        if rest.first() == Some(&HELPER_PART) && rest.len() > 1 {
            let helper = rest[1..].join(SEPARATOR);
            if !found.helpers.contains(&helper) {
                found.helpers.push(helper);
            }
        } else if !rest.is_empty() {
            let column = rest.join(SEPARATOR);
            set_column(&mut found.columns, column_key(&column), column);
        }
    }
    tables
}
