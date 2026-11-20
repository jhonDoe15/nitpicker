//! Runs the engine's SpotBugs patterns on small Java fixtures and compares pattern, line and message with what
//! SpotBugs 4.9.8 reported for the compiled fixtures. `parity/spotbugs/rows.py` turns a SpotBugs XML report into rows.
use std::collections::BTreeSet;
use std::path::Path;
use std::process::Command;

type Row = (String, String, u64, String);

fn found_in(case: &Path, name: &str) -> BTreeSet<Row> {
    let out = std::env::temp_dir().join(format!("nitpicker-engine-spotbugs-{name}-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(case)
        .args(["--rules", "_SpotBugs", "--out"])
        .arg(&out)
        .status()
        .expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", case.display());
    let text = |finding: &serde_json::Value, key: &str| finding[key].as_str().expect("text").to_string();
    report["findings"]
        .as_array()
        .expect("findings")
        .iter()
        .map(|finding| {
            let file = text(finding, "file");
            let file = format!("{name}/{}", file.strip_prefix(&prefix).unwrap_or(&file));
            (file, text(finding, "rule"), finding["line"].as_u64().expect("line"), text(finding, "message"))
        })
        .collect()
}

#[test]
fn patterns_report_what_spotbugs_reports() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let expected: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("spotbugs.json")).expect("expected")).expect("rows");
    let expected: BTreeSet<Row> = expected.into_iter().collect();
    let mut found = BTreeSet::new();
    for case in std::fs::read_dir(root.join("fixtures").join("spotbugs")).expect("fixtures") {
        let case = case.expect("entry").path();
        let name = case.file_name().and_then(|name| name.to_str()).expect("name").to_string();
        found.extend(found_in(&case, &name));
    }
    let missed: Vec<&Row> = expected.difference(&found).collect();
    let extra: Vec<&Row> = found.difference(&expected).collect();
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:?}, extra {extra:?}");
    assert_eq!(expected.iter().map(|row| row.1.as_str()).collect::<BTreeSet<_>>().len(), 5);
}
