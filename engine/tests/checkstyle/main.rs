//! Runs the engine's `Checkstyle` rule on small Java fixtures and compares its findings with what Checkstyle 13.5.0
//! reported for the same files with the formatted configuration a Java run writes.
use std::collections::BTreeMap;
use std::path::Path;
use std::process::Command;

type Row = (String, String, u64, u64, String);

fn counted(rows: impl IntoIterator<Item = Row>) -> BTreeMap<Row, usize> {
    let mut counts = BTreeMap::new();
    for row in rows {
        *counts.entry(row).or_default() += 1;
    }
    counts
}

#[test]
fn same_as_checkstyle() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let source = root.join("fixtures").join("checkstyle");
    let out = std::env::temp_dir().join(format!(
        "nitpicker-engine-checkstyle-{}.json",
        std::process::id()
    ));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&source)
        .args(["--rules", "Checkstyle", "--out"])
        .arg(&out)
        .status()
        .expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let found = counted(
        report["findings"]
            .as_array()
            .expect("findings")
            .iter()
            .map(|finding| {
                let file = Path::new(finding["file"].as_str().expect("file"));
                (
                    file.file_name()
                        .expect("name")
                        .to_string_lossy()
                        .into_owned(),
                    finding["rule"].as_str().expect("rule").to_string(),
                    finding["line"].as_u64().expect("line"),
                    finding["column"].as_u64().unwrap_or(0),
                    finding["message"].as_str().expect("message").to_string(),
                )
            }),
    );
    let expected: Vec<Row> = serde_json::from_str(
        &std::fs::read_to_string(root.join("expected").join("checkstyle.json")).expect("expected"),
    )
    .expect("rows");
    let expected = counted(expected);
    let missed: Vec<&Row> = expected
        .keys()
        .filter(|row| found.get(*row) != expected.get(*row))
        .collect();
    let extra: Vec<&Row> = found
        .keys()
        .filter(|row| !expected.contains_key(*row))
        .collect();
    assert!(
        missed.is_empty() && extra.is_empty(),
        "missed {missed:#?}\nextra {extra:#?}"
    );
}
