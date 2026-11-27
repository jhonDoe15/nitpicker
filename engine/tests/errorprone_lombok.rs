//! Error Prone on code Lombok rewrote. `expected/errorprone-lombok.json` holds what Error Prone 2.50.0 with
//! Lombok 1.18.46 reported on the written code of `fixtures/errorprone-lombok`, and
//! `expected/errorprone-lombok-generated.json` what it reported inside the code Lombok generated: the known
//! differences, which the engine never reports. Both come from `parity/errorprone/lombok/corpus.py expected`.
//! `fixtures/errorprone-lombok-members` comes with the class files javac and Lombok wrote for it
//! (`errorprone-lombok-members-classes`): the engine reads the members Lombok added from them.
//! `fixtures/errorprone-lombok-rewrites` uses each Lombok feature that rewrites written code in a way the engine does
//! not model: the engine lists those places as `_LombokRewrite` rows, so a run leaves the file to Error Prone.
use std::collections::BTreeMap;
use std::path::Path;
use std::process::Command;

type Row = (String, String, u64, u64);

fn counted(rows: impl IntoIterator<Item = Row>) -> BTreeMap<Row, usize> {
    let mut counts = BTreeMap::new();
    for row in rows {
        *counts.entry(row).or_default() += 1;
    }
    counts
}

fn expected(name: &str) -> BTreeMap<Row, usize> {
    let file = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("expected").join(format!("{name}.json"));
    counted(serde_json::from_str::<Vec<Row>>(&std::fs::read_to_string(file).expect("expected")).expect("rows"))
}

const LOMBOK_REWRITE: &str = "_LombokRewrite";

fn engine_rows() -> BTreeMap<Row, usize> {
    rows_of("errorprone-lombok", false).into_iter().filter(|(row, _)| row.1 != LOMBOK_REWRITE).collect()
}

fn rows_of(fixture: &str, with_classes: bool) -> BTreeMap<Row, usize> {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures");
    let source = fixtures.join(fixture);
    static RUNS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let run = RUNS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let out = std::env::temp_dir().join(format!("nitpicker-engine-{fixture}-{}-{run}.json", std::process::id()));
    let mut command = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"));
    command.arg(&source).args(["--rules", "_ErrorProne", "--lombok", "--out"]).arg(&out);
    if with_classes {
        command.arg("--classes").arg(fixtures.join(format!("{fixture}-classes")));
    }
    let status = command.status().expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", source.display());
    counted(report["findings"].as_array().expect("findings").iter().map(|finding| {
        let file = finding["file"].as_str().expect("file");
        (
            file.strip_prefix(&prefix).unwrap_or(file).to_string(),
            finding["rule"].as_str().expect("rule").to_string(),
            finding["line"].as_u64().expect("line"),
            finding["column"].as_u64().expect("column"),
        )
    }))
}

#[test]
fn error_prone_checks_report_what_error_prone_reports_on_the_code_written_next_to_lombok() {
    let found: BTreeMap<Row, usize> = engine_rows().into_iter().filter(|(row, _)| row.1 != "NullAway").collect();
    assert_eq!(found, expected("errorprone-lombok"));
}

#[test]
fn nothing_is_reported_where_only_lombok_generated_code_sits() {
    let generated = expected("errorprone-lombok-generated");
    let places: Vec<(&str, u64, u64)> = generated.keys().map(|row| (row.0.as_str(), row.2, row.3)).collect();
    let inside: Vec<Row> = engine_rows().into_keys().filter(|row| places.contains(&(row.0.as_str(), row.2, row.3))).collect();
    assert!(inside.is_empty(), "reported inside generated code: {inside:?}");
    let kinds: std::collections::BTreeSet<&str> = generated.keys().map(|row| row.1.as_str()).collect();
    assert_eq!(kinds.into_iter().collect::<Vec<_>>(), ["RedundantNullCheck", "UnnecessarilyFullyQualified", "UnnecessarySemicolon"]);
}

#[test]
fn error_prone_checks_see_the_members_lombok_wrote_into_the_class_files() {
    let found: BTreeMap<Row, usize> = rows_of("errorprone-lombok-members", true).into_iter().filter(|(row, _)| row.1 != "NullAway").collect();
    let wanted: BTreeMap<Row, usize> = expected("errorprone-lombok-members").into_iter().filter(|(row, _)| row.1 != "NullAway").collect();
    assert_eq!(found, wanted);
}

#[test]
fn without_the_class_files_a_class_that_only_has_a_lombok_logger_is_not_a_utility_class() {
    let found = rows_of("errorprone-lombok-members", false);
    assert!(!found.keys().any(|row| row.0 == "crew/Audit.java" && row.1 == "PrivateConstructorForUtilityClass"));
}

fn rewrite_rows(fixture: &str) -> Vec<(String, u64, u64, String)> {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures");
    let out = std::env::temp_dir().join(format!("nitpicker-engine-{fixture}-rewrites-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(fixtures.join(fixture))
        .args(["--rules", "_ErrorProne", "--lombok", "--out"])
        .arg(&out)
        .status()
        .expect("engine runs");
    assert!(status.success());
    let text = std::fs::read_to_string(&out).expect("report");
    let _ = std::fs::remove_file(&out);
    let report: serde_json::Value = serde_json::from_str(&text).expect("json");
    let findings = report["findings"].as_array().expect("findings");
    let findings = findings.iter().filter(|finding| finding["rule"] == LOMBOK_REWRITE);
    let mut rows: Vec<(String, u64, u64, String)> = findings
        .map(|finding| {
            let file = finding["file"].as_str().expect("file");
            let name = file.rsplit('/').next().unwrap_or(file).to_string();
            let line = finding["line"].as_u64().expect("line");
            let column = finding["column"].as_u64().expect("column");
            (name, line, column, finding["message"].as_str().expect("message").to_string())
        })
        .collect();
    rows.sort();
    rows
}

#[test]
fn every_place_lombok_rewrites_written_code_the_engine_does_not_model_is_listed() {
    let wanted = [
        (17, 1, "ExtensionMethod"),
        (20, 3, "Builder.Default"),
        (21, 3, "Getter(lazy)"),
        (22, 3, "onX"),
        (25, 3, "Javadoc"),
        (27, 3, "SneakyThrows"),
        (29, 5, "Cleanup"),
        (33, 3, "Synchronized"),
        (38, 3, "Locked"),
        (43, 20, "NonNull"),
        (44, 5, "val"),
        (45, 5, "Helper"),
    ];
    let on_demand = [(7, 1, "onX"), (11, 19, "NonNull"), (15, 3, "Locked")];
    let row = |file: &str, (line, column, feature): &(u64, u64, &str)| {
        (file.to_string(), *line, *column, feature.to_string())
    };
    let on_demand = on_demand.iter().map(|place| row("OnDemand.java", place));
    let rewritten = wanted.iter().map(|place| row("Rewritten.java", place));
    let wanted: Vec<(String, u64, u64, String)> = on_demand.chain(rewritten).collect();
    assert_eq!(rewrite_rows("errorprone-lombok-rewrites"), wanted);
}

#[test]
fn without_lombok_nothing_is_listed_as_rewritten() {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures");
    let out = std::env::temp_dir().join(format!("nitpicker-engine-no-lombok-rewrites-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(fixtures.join("errorprone-lombok-rewrites"))
        .args(["--rules", "_ErrorProne", "--out"])
        .arg(&out)
        .status()
        .expect("engine runs");
    assert!(status.success());
    let report = std::fs::read_to_string(&out).expect("report");
    let _ = std::fs::remove_file(&out);
    assert!(!report.contains(LOMBOK_REWRITE));
}
