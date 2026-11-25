//! The coding-standards rules on fixtures, compared with what the ESLint rules reported for the same files
//! (`parity/typescript-lint-expected.mts` with the rule names). Findings that wait on a policy question of the
//! caller are left out: the fixtures are not under a source root, so the JavaScript side answers no to all of them.
use std::path::Path;
use std::process::Command;

type Row = Vec<serde_json::Value>;

const RULES: &str =
    "no-external-executables-in-unit-tests,no-internal-module-mocks,no-wait-for-with-fake-timers,preserve-error-cause,structured-catch-logging";

fn sorted(mut rows: Vec<Row>) -> Vec<Row> {
    rows.sort_by_key(|row| serde_json::to_string(row).expect("text"));
    rows
}

fn trimmed(mut row: Row) -> Row {
    while row.last().is_some_and(serde_json::Value::is_null) {
        row.pop();
    }
    row
}

#[test]
fn coding_standards_findings_match_the_plugin() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let fixtures = root.join("fixtures").join("typescript-coding-standards");
    let mut names: Vec<String> =
        std::fs::read_dir(&fixtures).expect("fixtures").map(|entry| entry.expect("entry").file_name().to_string_lossy().into_owned()).collect();
    names.sort();
    let list = std::env::temp_dir().join(format!("nitpicker-engine-coding-standards-{}.tsv", std::process::id()));
    let lines: Vec<String> = names.iter().map(|name| format!("{}\t{name}", fixtures.join(name).display())).collect();
    std::fs::write(&list, lines.join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).args(["typescript-lint", "--rules", RULES, "--files"]).arg(&list).output().expect("engine runs");
    let _ = std::fs::remove_file(&list);
    assert!(output.status.success());
    let rows: Vec<Row> = serde_json::from_slice(&output.stdout).expect("json");
    let asked = rows.iter().filter(|row| row.len() > 7).count();
    let found = sorted(rows.into_iter().filter(|row| row.len() <= 7).map(trimmed).collect());
    let expected: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("typescript-coding-standards.json")).expect("expected")).expect("json");
    assert_eq!(found, sorted(expected));
    assert!(asked > 0, "the module-mock fixture reports candidates for the caller to decide");
}
