//! The test-code rules on what a test file takes from its surroundings, on their fixtures, against what the ESLint
//! rules report there. Each rule runs on its own folder. Where the verdict depends on the project layout, the engine
//! reports a candidate with the question for the caller, and every fixture candidate is one the caller keeps.
use std::path::Path;
use std::process::Command;

type Row = Vec<serde_json::Value>;

const RULES: [&str; 5] = [
    "no-mocking-subject-under-test",
    "no-production-imports-in-setup-files",
    "no-real-time-random-or-network",
    "no-uncollected-tests",
    "no-wall-clock-bound-in-tests",
];

fn sorted(mut rows: Vec<Row>) -> Vec<Row> {
    rows.sort_by_key(|row| serde_json::to_string(row).expect("text"));
    rows
}

fn reported(fixtures: &Path, rule: &str) -> Vec<Row> {
    let folder = fixtures.join(rule);
    let mut names: Vec<String> = std::fs::read_dir(&folder).expect("rule fixtures").map(|entry| entry.expect("entry").file_name().to_string_lossy().into_owned()).collect();
    names.sort();
    let lines: Vec<String> = names.iter().map(|name| format!("{}\t{rule}/{name}", folder.join(name).display())).collect();
    let list = std::env::temp_dir().join(format!("nitpicker-engine-environment-rules-{}-{rule}.tsv", std::process::id()));
    std::fs::write(&list, lines.join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).args(["typescript-lint", "--rules", rule, "--files"]).arg(&list).output().expect("engine runs");
    let _ = std::fs::remove_file(&list);
    assert!(output.status.success());
    serde_json::from_slice(&output.stdout).expect("json")
}

#[test]
fn environment_rules_report_what_the_eslint_rules_report() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let fixtures = root.join("fixtures").join("typescript-environment-rules");
    let expected: Vec<Row> =
        serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("typescript-environment-rules.json")).expect("expected")).expect("json");
    for rule in RULES {
        let wanted: Vec<Row> = expected.iter().filter(|row| row[1].as_str() == Some(&format!("nitpicker/{rule}"))).cloned().collect();
        assert!(!wanted.is_empty(), "{rule} reports in its fixtures");
        assert_eq!(sorted(reported(&fixtures, rule)), sorted(wanted), "{rule}");
    }
}
