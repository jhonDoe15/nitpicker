//! Runs the engine's operand rules (no-operand-slip, no-operand-depth-recursion) on fixtures and compares the
//! findings with what the ESLint-plugin rules reported for the same files. The expected file comes from
//! `parity/typescript-lint-expected.mts <list> <out> no-operand-slip,no-operand-depth-recursion`.
use std::path::Path;
use std::process::Command;

type Row = Vec<serde_json::Value>;

const RULES: &str = "no-operand-slip,no-operand-depth-recursion";
const FILES: [&str; 2] = ["slips.ts", "recursion.ts"];

fn sorted(mut rows: Vec<Row>) -> Vec<Row> {
    rows.sort_by_key(|row| serde_json::to_string(row).expect("text"));
    rows
}

#[test]
fn operand_rules_report_what_the_eslint_rules_report() {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join("typescript-operands");
    let lines: Vec<String> = FILES.iter().map(|name| format!("{}\t{name}", fixtures.join(name).display())).collect();
    let list = std::env::temp_dir().join(format!("nitpicker-engine-operands-{}.tsv", std::process::id()));
    std::fs::write(&list, lines.join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).args(["typescript-lint", "--rules", RULES, "--files"]).arg(&list).output().expect("engine runs");
    let _ = std::fs::remove_file(&list);
    assert!(output.status.success());
    let found = sorted(serde_json::from_slice(&output.stdout).expect("json"));
    let expected_file = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("expected").join("typescript-operands.json");
    let expected: Vec<Row> = sorted(serde_json::from_str(&std::fs::read_to_string(expected_file).expect("rows")).expect("json"));
    assert_eq!(found, expected);
}
