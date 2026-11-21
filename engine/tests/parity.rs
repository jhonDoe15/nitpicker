//! Runs the engine on small Java fixtures and compares its findings with what PMD reported for the same rules.
//! The expected files come from `parity/pmd-expected.py`.
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::process::Command;

type Row = (String, String, u64, u64);

/// Rows with how often each one is reported, so a doubled finding is a difference too.
type Rows = BTreeMap<Row, usize>;

fn counted(rows: impl IntoIterator<Item = Row>) -> Rows {
    let mut counts = Rows::new();
    for row in rows {
        *counts.entry(row).or_default() += 1;
    }
    counts
}

fn rows(case: &str, rules: &str) -> (Rows, Rows) {
    rows_of(case, "_XPath", rules)
}

fn rows_of(case: &str, rule: &str, rules: &str) -> (Rows, Rows) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let source = root.join("fixtures").join(case);
    let out = std::env::temp_dir().join(format!("nitpicker-engine-{case}-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&source)
        .args(["--rules", rule, "--out"])
        .arg(&out)
        .env("NP_XPATH_RULES", root.join("rules").join(format!("{rules}.json")))
        .status()
        .expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", source.display());
    let found = counted(report["findings"]
        .as_array()
        .expect("findings")
        .iter()
        .map(|finding| {
            let file = finding["file"].as_str().expect("file");
            let failed = finding["rule"].as_str().expect("rule").starts_with('!');
            (
                file.strip_prefix(&prefix).unwrap_or(file).to_string(),
                finding["rule"].as_str().expect("rule").to_string(),
                if failed { 0 } else { finding["line"].as_u64().expect("line") },
                if failed { 0 } else { finding["column"].as_u64().expect("column") },
            )
        })
        .collect::<Vec<Row>>());
    let expected: Vec<Row> =
        serde_json::from_str(&std::fs::read_to_string(root.join("expected").join(format!("{case}.json"))).expect("expected")).expect("rows");
    (found, counted(expected))
}

fn same_as_pmd(case: &str, rules: &str) {
    let (found, mut expected) = rows(case, rules);
    let wrong = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("expected").join(format!("{case}-pmd-wrong.json"));
    if let Ok(listed) = std::fs::read_to_string(&wrong) {
        let wrong: Vec<Row> = serde_json::from_str(&listed).expect("rows");
        for row in wrong {
            assert!(expected.remove(&row).is_some(), "{case}: {row:?} is listed as a wrong PMD finding but PMD did not report it");
            assert!(!found.contains_key(&row), "{case}: {row:?} copies a wrong PMD finding");
        }
    }
    let missed: Vec<&Row> = expected.iter().filter(|(row, count)| found.get(*row).unwrap_or(&0) < count).map(|(row, _)| row).collect();
    let extra: Vec<&Row> = found.iter().filter(|(row, count)| expected.get(*row).unwrap_or(&0) < count).map(|(row, _)| row).collect();
    assert!(missed.is_empty() && extra.is_empty(), "{case}: missed {missed:?}, extra {extra:?}");
    assert!(!expected.is_empty(), "{case}: nothing expected");
}

#[test]
fn suppressions_hide_what_pmd_hides() {
    same_as_pmd("suppressions", "suppressions");
}

#[test]
fn regular_expressions_match_what_pmd_matches() {
    same_as_pmd("regex", "regex");
}

#[test]
fn review_rules_report_what_pmd_reports() {
    same_as_pmd("formats", "all");
}

#[test]
fn rare_built_in_rules_and_switch_facts_match_pmd() {
    same_as_pmd("builtins", "all");
}

#[test]
fn error_prone_checks_report_what_error_prone_reports() {
    let (found, expected) = rows_of("errorprone", "_ErrorProne", "all");
    let missed: Vec<&Row> = expected.iter().filter(|(row, count)| found.get(*row).unwrap_or(&0) < count).map(|(row, _)| row).collect();
    let extra: Vec<&Row> = found.iter().filter(|(row, count)| expected.get(*row).unwrap_or(&0) < count).map(|(row, _)| row).collect();
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:?}, extra {extra:?}");
    assert_eq!(expected.keys().map(|row| row.1.as_str()).collect::<BTreeSet<_>>().len(), 38);
}

#[test]
fn types_and_signatures_match_what_pmd_resolves() {
    same_as_pmd("types", "types");
}

#[test]
fn line_breaks_encodings_and_functions_match_pmd() {
    same_as_pmd("edges", "edges");
}

/// PMD 7.16.0 strips a byte order mark but then counts lines and columns as if it were still there, so a class on
/// line 2 is reported on line 1. The engine reports the true place; these rows were checked by hand.
#[test]
fn byte_order_mark_does_not_move_findings() {
    same_as_pmd("bom", "edges");
}

/// One file of a single expression thousands of terms deep: the run of one file uses the large worker stack too.
#[test]
fn one_deeply_nested_file_is_analysed() {
    let folder = std::env::temp_dir().join(format!("nitpicker-engine-deep-{}", std::process::id()));
    std::fs::create_dir_all(&folder).expect("folder");
    let terms = vec!["\"a\""; 10_000].join(" + ");
    std::fs::write(folder.join("Deep.java"), format!("class Deep {{ String s = {terms}; }}\n")).expect("source");
    let rules = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("rules").join("edges.json");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&folder)
        .args(["--rules", "_XPath"])
        .env("NP_XPATH_RULES", rules)
        .env("NP_XPATH_ONLY", "Field")
        .output()
        .expect("engine runs");
    let _ = std::fs::remove_dir_all(&folder);
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).expect("json");
    assert_eq!(report["findings"].as_array().map(Vec::len), Some(1));
}

#[test]
fn patterns_type_their_variables_like_pmd() {
    same_as_pmd("patterns", "all");
}
