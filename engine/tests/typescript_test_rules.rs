//! The test-quality and test-assertion rules on the engine against what their ESLint-plugin rules report for the same
//! files. The expected rows come from `parity/typescript-lint-expected.mts <list> <out> <rules>`, run from the folder of
//! `no-test-helpers-in-source` for that rule, so the paths it sees are the file names, and with the files of
//! `no-interval-polling-in-tests` read from a copy outside any `tests/fixtures` folder, which that rule skips. The files
//! of `integration-test-uses-approved-harness` are read from a copy under `test/integration/`, where that rule looks.
use std::path::Path;
use std::process::Command;

type Row = Vec<serde_json::Value>;

const RULES: [&str; 23] = [
    "integration-test-uses-approved-harness",
    "no-assertion-in-loop",
    "no-copy-pasted-tests",
    "no-first-test-charged-setup",
    "no-fixed-port-in-tests",
    "no-fixed-sleep-synchronization",
    "no-float-equality-in-tests",
    "no-git-repository-per-test",
    "no-interval-polling-in-tests",
    "no-listing-order-in-assertions",
    "no-node-process-per-test",
    "no-partial-output-assertion",
    "no-server-or-worker-per-test",
    "no-shared-temp-path-in-tests",
    "no-shared-test-state",
    "no-switched-off-tests",
    "no-test-helpers-in-source",
    "no-uncleared-shared-mock",
    "no-uninjectable-delay",
    "no-unowned-async-assertion",
    "no-unpinned-assertion",
    "no-weak-assertion",
    "no-worker-state-in-concurrent-tests",
];
/// Its files are named as the rule would see them relative to the project: the caller gives that path as a setting.
const PATH_RULE: &str = "no-test-helpers-in-source";
/// Its files are integration tests, which the caller tells it with a setting.
const INTEGRATION_RULE: &str = "integration-test-uses-approved-harness";

fn sorted(mut rows: Vec<Row>) -> Vec<Row> {
    rows.sort_by_key(|row| serde_json::to_string(row).expect("text"));
    rows
}

fn listed(fixtures: &Path) -> Vec<String> {
    let mut lines = Vec::new();
    for rule in RULES {
        let mut names: Vec<String> =
            std::fs::read_dir(fixtures.join(rule)).expect("rule fixtures").map(|entry| entry.expect("entry").file_name().to_string_lossy().into_owned()).collect();
        names.sort();
        let setting = |name: &str| match rule {
            PATH_RULE => format!("\t{rule}.path={name}"),
            INTEGRATION_RULE => format!("\t{rule}.integration=true"),
            _ => String::new(),
        };
        lines.extend(names.iter().map(|name| format!("{}\t{rule}/{name}{}", fixtures.join(rule).join(name).display(), setting(name))));
    }
    lines
}

#[test]
fn test_rules_report_what_the_eslint_rules_report() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let fixtures = root.join("fixtures").join("typescript-test-rules");
    let list = std::env::temp_dir().join(format!("nitpicker-engine-test-rules-{}.tsv", std::process::id()));
    std::fs::write(&list, listed(&fixtures).join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).args(["typescript-lint", "--rules", &RULES.join(","), "--files"]).arg(&list).output().expect("engine runs");
    let _ = std::fs::remove_file(&list);
    assert!(output.status.success());
    let found: Vec<Row> = serde_json::from_slice(&output.stdout).expect("json");
    let expected: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("typescript-test-rules.json")).expect("expected")).expect("json");
    let reporting: std::collections::BTreeSet<String> = expected.iter().filter_map(|row| row[1].as_str()).map(str::to_string).collect();
    assert_eq!(sorted(found), sorted(expected));
    assert_eq!(reporting.len(), RULES.len(), "every rule reports in the fixtures");
}
