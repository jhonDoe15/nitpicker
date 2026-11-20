//! Runs the engine on small Java fixtures and compares its findings with what PMD reported for the same rules.
//! The expected files come from `parity/pmd-expected.py`.
use std::collections::BTreeSet;
use std::path::Path;
use std::process::Command;

type Row = (String, String, u64, u64);

fn rows(case: &str, rules: &str) -> (BTreeSet<Row>, BTreeSet<Row>) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let source = root.join("fixtures").join(case);
    let out = std::env::temp_dir().join(format!("nitpicker-engine-{case}-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&source)
        .args(["--rules", "_XPath", "--out"])
        .arg(&out)
        .env("NP_XPATH_RULES", root.join("rules").join(format!("{rules}.json")))
        .status()
        .expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", source.display());
    let found = report["findings"]
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
        .collect();
    let expected: Vec<Row> =
        serde_json::from_str(&std::fs::read_to_string(root.join("expected").join(format!("{case}.json"))).expect("expected")).expect("rows");
    (found, expected.into_iter().collect())
}

fn same_as_pmd(case: &str, rules: &str) {
    let (found, expected) = rows(case, rules);
    let missed: Vec<&Row> = expected.difference(&found).collect();
    let extra: Vec<&Row> = found.difference(&expected).collect();
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
