//! Runs the engine's SpotBugs patterns on small Java fixtures and compares pattern, line and message with what
//! SpotBugs 4.9.8 reported for the compiled fixtures. `parity/spotbugs/rows.py` turns a SpotBugs XML report into rows.
use std::collections::BTreeSet;
use std::path::Path;
use std::process::Command;

type Row = (String, String, u64, String);

fn found_in(case: &Path, name: &str) -> BTreeSet<Row> {
    found_with(case, name, "message")
}

fn found_with(case: &Path, name: &str, key: &str) -> BTreeSet<Row> {
    found_listed(case, name, key).into_iter().collect()
}

fn found_listed(case: &Path, name: &str, key: &str) -> Vec<Row> {
    let out = std::env::temp_dir().join(format!("nitpicker-engine-spotbugs-{name}-{key}-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(case)
        .args(["--rules", "_SpotBugs", "--out"])
        .arg(&out)
        .args(name.starts_with("lombok").then_some("--lombok"))
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
            (file, text(finding, "rule"), finding["line"].as_u64().expect("line"), finding[key].as_str().unwrap_or_default().to_string())
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
    assert_eq!(expected.iter().map(|row| row.1.as_str()).collect::<BTreeSet<_>>().len(), 35);
}

/// SpotBugs names the variable a stored value came from; `tests/expected/spotbugs-variables.json` holds the names
/// SpotBugs gave for the compiled fixtures (the fully qualified name of the finding's place in its SARIF report).
#[test]
fn stores_name_the_variable_spotbugs_names() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let expected: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("spotbugs-variables.json")).expect("expected")).expect("rows");
    let expected: BTreeSet<Row> = expected.into_iter().collect();
    let mut found = BTreeSet::new();
    for case in std::fs::read_dir(root.join("fixtures").join("spotbugs")).expect("fixtures") {
        let case = case.expect("entry").path();
        let name = case.file_name().and_then(|name| name.to_str()).expect("name").to_string();
        found.extend(found_with(&case, &name, "symbol").into_iter().filter(|row| row.1.starts_with("EI_EXPOSE") && row.1.ends_with("REP2")));
    }
    let missed: Vec<&Row> = expected.difference(&found).collect();
    let extra: Vec<&Row> = found.difference(&expected).collect();
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:?}, extra {extra:?}");
}

/// SpotBugs' SARIF report names a place for each finding: `tests/expected/spotbugs-places.json` holds them as
/// `kind:fully qualified name`, one row per SARIF result, for the fixtures it lists. The engine adds the class
/// that declares a compared field after an `@`, for the name SARIF shows.
#[test]
fn findings_name_the_place_spotbugs_sarif_names() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let mut expected: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("spotbugs-places.json")).expect("expected")).expect("rows");
    expected.sort();
    let cases: BTreeSet<String> = expected.iter().filter_map(|row| row.0.split('/').next().map(String::from)).collect();
    let rules: BTreeSet<String> = expected.iter().map(|row| row.1.clone()).collect();
    let mut found: Vec<Row> = Vec::new();
    for name in &cases {
        let case = root.join("fixtures").join("spotbugs").join(name);
        let listed = found_listed(&case, name, "symbol").into_iter().filter(|row| rules.contains(&row.1));
        found.extend(listed.map(|(file, rule, line, place)| (file, rule, line, place.split('@').next().unwrap_or_default().to_string())));
    }
    found.sort();
    assert_eq!(found, expected);
}
