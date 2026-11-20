//! Runs the engine's testing-library rules on fixtures and compares the findings with what the ESLint plugin
//! reported for the same files. The expected file comes from `parity/typescript-lint-expected.mts`.
use std::path::Path;
use std::process::Command;

type Row = (String, String, u64, u64, String);

fn rows(path: &Path) -> Vec<Row> {
    let mut rows: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(path).expect("rows")).expect("json");
    rows.sort();
    rows
}

#[test]
fn testing_library_findings_match_the_plugin() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let fixtures = root.join("fixtures").join("typescript-lint");
    let mut names: Vec<String> =
        std::fs::read_dir(&fixtures).expect("fixtures").map(|entry| entry.expect("entry").file_name().to_string_lossy().into_owned()).collect();
    names.sort();
    let list = std::env::temp_dir().join(format!("nitpicker-engine-lint-{}.tsv", std::process::id()));
    let out = std::env::temp_dir().join(format!("nitpicker-engine-lint-{}.json", std::process::id()));
    let lines: Vec<String> = names.iter().map(|name| format!("{}\t{name}", fixtures.join(name).display())).collect();
    std::fs::write(&list, lines.join("\n")).expect("list");
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg("typescript-lint")
        .arg("--files")
        .arg(&list)
        .arg("--out")
        .arg(&out)
        .status()
        .expect("engine runs");
    assert!(status.success());
    let found: Vec<Row> = rows(&out).into_iter().filter(|row| row.1.starts_with("testing-library/")).collect();
    let expected = rows(&root.join("expected").join("typescript-lint.json"));
    let _ = std::fs::remove_file(&list);
    let _ = std::fs::remove_file(&out);
    assert_eq!(found, expected);
    let reporting: std::collections::BTreeSet<&str> = expected.iter().map(|row| row.1.as_str()).collect();
    assert_eq!(reporting.len(), 12, "every rule reports in the fixtures");
}
