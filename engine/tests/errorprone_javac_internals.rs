//! Checks that read javac's own classes: the fixtures use `com.sun.tools.javac`, which the JDK's `jmods` hold, and the
//! rows come from Error Prone runs with `--add-exports` for the packages they use.
use std::path::Path;
use std::process::Command;

type Row = (String, String, u64, u64, String);

fn rows(folder: &str, checks: &str) -> Vec<Row> {
    let sources = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join("errorprone-javac").join(folder);
    let out = std::env::temp_dir().join(format!("nitpicker-engine-javac-{folder}-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&sources)
        .args(["--rules", "_ErrorProne", "--out"])
        .arg(&out)
        .env("NP_EP_ONLY", checks)
        .status()
        .expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", sources.display());
    let mut found: Vec<Row> = report["findings"]
        .as_array()
        .expect("findings")
        .iter()
        .map(|finding| {
            let file = finding["file"].as_str().expect("file");
            (
                file.strip_prefix(&prefix).unwrap_or(file).to_string(),
                finding["rule"].as_str().expect("rule").to_string(),
                finding["line"].as_u64().expect("line"),
                finding["column"].as_u64().expect("column"),
                finding["message"].as_str().expect("message").to_string(),
            )
        })
        .collect();
    found.sort();
    found
}

fn expected(name: &str) -> Vec<Row> {
    let listed = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("expected").join(name)).expect("expected");
    let mut rows: Vec<Row> = serde_json::from_str(&listed).expect("rows");
    rows.sort();
    rows
}

/// `helpers` holds a copy of `ASTHelpers`, which turns the check on and is exempt itself; `plain` has none.
#[test]
fn ast_helpers_suggestions_need_ast_helpers_in_the_compilation() {
    assert_eq!(rows("helpers", "ASTHelpersSuggestions"), expected("errorprone-javac-internals.json"));
    assert_eq!(rows("plain", "ASTHelpersSuggestions"), Vec::<Row>::new());
}
