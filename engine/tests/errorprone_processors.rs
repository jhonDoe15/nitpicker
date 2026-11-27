//! Error Prone on source sets whose annotation processors only add files. `fixtures/errorprone-processors` is the
//! hand-written code, `errorprone-processors-generated` what AutoValue 1.11.0 and MapStruct 1.6.3 wrote for it and
//! `errorprone-processors-classes` the class files of the compile. `expected/errorprone-processors.json` holds what
//! Error Prone 2.50.0 reported on the hand-written code with those processors.
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::Command;

type Row = (String, String, u64, u64);

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures")
}

fn java_files(root: &Path, out: &mut Vec<PathBuf>) {
    for entry in std::fs::read_dir(root).expect("fixture folder").filter_map(Result::ok) {
        let path = entry.path();
        if path.is_dir() {
            java_files(&path, out);
        } else if path.extension().is_some_and(|extension| extension == "java") {
            out.push(path);
        }
    }
}

/// The engine's rows over the written sources of `fixture` with `context` read as context, each counted.
fn rows_of(fixture: &str, context: Option<&str>, classes: &str) -> BTreeMap<Row, usize> {
    let source = fixtures().join(fixture);
    let mut files = Vec::new();
    java_files(&source, &mut files);
    if let Some(context) = context {
        java_files(&fixtures().join(context), &mut files);
    }
    files.sort();
    static RUNS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);
    let run = RUNS.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let stem = std::env::temp_dir().join(format!("nitpicker-engine-{fixture}-{}-{run}", std::process::id()));
    let (list, out) = (stem.with_extension("txt"), stem.with_extension("json"));
    std::fs::write(&list, files.iter().map(|file| format!("{}\n", file.display())).collect::<String>()).expect("list");
    let mut command = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"));
    command.arg("--files").arg(&list).args(["--rules", "_ErrorProne", "--out"]).arg(&out);
    command.env("NP_EP_AUDIT_CLASSES", fixtures().join(classes));
    if let Some(context) = context {
        command.env("NP_EP_CONTEXT_ROOTS", fixtures().join(context));
    }
    assert!(command.status().expect("engine runs").success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = (std::fs::remove_file(&out), std::fs::remove_file(&list));
    let prefix = format!("{}/", source.display());
    let mut counts = BTreeMap::new();
    for finding in report["findings"].as_array().expect("findings") {
        let file = finding["file"].as_str().expect("file");
        let row = (
            file.strip_prefix(&prefix).unwrap_or(file).to_string(),
            finding["rule"].as_str().expect("rule").to_string(),
            finding["line"].as_u64().expect("line"),
            finding["column"].as_u64().expect("column"),
        );
        *counts.entry(row).or_default() += 1;
    }
    counts
}

fn without(rows: BTreeMap<Row, usize>, rules: &[&str]) -> BTreeMap<Row, usize> {
    rows.into_iter().filter(|(row, _)| !rules.contains(&row.1.as_str())).collect()
}

#[test]
fn error_prone_checks_report_what_error_prone_reports_next_to_autovalue_and_mapstruct() {
    let found = without(rows_of("errorprone-processors", Some("errorprone-processors-generated"), "errorprone-processors-classes"), &["NullAway", "_MayReport"]);
    let file = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/expected/errorprone-processors.json");
    let mut wanted = BTreeMap::new();
    for row in serde_json::from_str::<Vec<Row>>(&std::fs::read_to_string(file).expect("expected")).expect("rows") {
        *wanted.entry(row).or_default() += 1;
    }
    assert_eq!(found, without(wanted, &["NullAway"]));
}

#[test]
fn classes_processors_only_added_files_to_match_their_class_files() {
    let rewritten: Vec<Row> = rows_of("errorprone-processors", Some("errorprone-processors-generated"), "errorprone-processors-classes")
        .into_keys()
        .filter(|row| row.1 == "_Rewritten" || row.0.starts_with('/'))
        .collect();
    assert_eq!(rewritten, Vec::<Row>::new());
}

#[test]
fn classes_lombok_wrote_members_into_are_named_with_the_first_member_their_source_does_not_declare() {
    let report = rows_of_messages("errorprone-lombok-members", "errorprone-lombok-members-classes");
    let wanted = [
        ("crew/Audit.java", 6, "crew.Audit: field static log"),
        ("crew/Badge.java", 6, "crew.Badge: method toString/0"),
        ("crew/Helpers.java", 6, "crew.Helpers: field count"),
        ("crew/Helpers.java", 21, "crew.Holder$Inside$Tools: field member"),
        ("crew/Pass.java", 8, "crew.Pass: method static builder/0"),
        ("crew/Roster.java", 8, "crew.Roster$Middle$Inner: method toString/0"),
        ("crew/Shift.java", 7, "crew.Shift: method static builder/0"),
        ("crew/Shift.java", 10, "crew.Shift$ShiftBuilder: field hours"),
    ];
    assert_eq!(report, wanted.map(|(file, line, message)| (file.to_string(), line, message.to_string())));
}

/// The `_Rewritten` rows of the engine over a fixture: file, line and message, in order.
fn rows_of_messages(fixture: &str, classes: &str) -> Vec<(String, u64, String)> {
    let source = fixtures().join(fixture);
    let out = std::env::temp_dir().join(format!("nitpicker-engine-{fixture}-audit-{}.json", std::process::id()));
    let mut command = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"));
    command.arg(&source).args(["--rules", "_ErrorProne", "--out"]).arg(&out).env("NP_EP_AUDIT_CLASSES", fixtures().join(classes));
    assert!(command.status().expect("engine runs").success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", source.display());
    let mut rows: Vec<(String, u64, String)> = report["findings"]
        .as_array()
        .expect("findings")
        .iter()
        .filter(|finding| finding["rule"] == "_Rewritten")
        .map(|finding| {
            let file = finding["file"].as_str().expect("file");
            (file.strip_prefix(&prefix).unwrap_or(file).to_string(), finding["line"].as_u64().expect("line"), finding["message"].as_str().expect("message").to_string())
        })
        .collect();
    rows.sort();
    rows
}
