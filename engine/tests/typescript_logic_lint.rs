//! Runs the engine's logic rules (cognitive complexity, recursion) on fixtures and compares the findings with
//! what the ESLint-plugin rules reported for the same files. The expected file comes from
//! `parity/typescript-lint-expected.mts <list> <out> cognitive-complexity,no-self-recursion`.
use std::path::Path;
use std::process::Command;

type Row = Vec<serde_json::Value>;

const RULES: &str = "cognitive-complexity,no-self-recursion";
const FILES: [&str; 4] = ["complexity.ts", "features/billing/domain/totals.ts", "line-separators.ts", "recursion.ts"];

fn sorted(mut rows: Vec<Row>) -> Vec<Row> {
    rows.sort_by_key(|row| serde_json::to_string(row).expect("text"));
    rows
}

fn engine_rows(lines: &[String], name: &str) -> Vec<Row> {
    let list = std::env::temp_dir().join(format!("nitpicker-engine-logic-{name}-{}.tsv", std::process::id()));
    std::fs::write(&list, lines.join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).args(["typescript-lint", "--rules", RULES, "--files"]).arg(&list).output().expect("engine runs");
    let _ = std::fs::remove_file(&list);
    assert!(output.status.success());
    sorted(serde_json::from_slice(&output.stdout).expect("json"))
}

fn fixtures() -> std::path::PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join("typescript-logic")
}

#[test]
fn logic_rules_report_what_the_eslint_rules_report() {
    let lines: Vec<String> = FILES.iter().map(|name| format!("{}\t{name}", fixtures().join(name).display())).collect();
    let expected_file = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("expected").join("typescript-logic.json");
    let expected: Vec<Row> = sorted(serde_json::from_str(&std::fs::read_to_string(expected_file).expect("rows")).expect("json"));
    assert_eq!(engine_rows(&lines, "fixtures"), expected);
}

#[test]
fn the_complexity_limit_comes_from_the_rule_options() {
    let file = fixtures().join("recursion.ts");
    let lines = [format!("{}\trecursion.ts\tcognitive-complexity.max=0", file.display())];
    let found = engine_rows(&lines, "limit");
    let limits: Vec<&str> = found.iter().filter(|row| row[1] == "nitpicker/cognitive-complexity").filter_map(|row| row[4].as_str()).collect();
    assert!(!limits.is_empty());
    assert!(limits.iter().all(|message| message.contains("the limit is 0.")));
}
