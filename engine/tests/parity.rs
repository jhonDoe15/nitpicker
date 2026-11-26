//! Runs the engine on small Java fixtures and compares its findings with what PMD reported for the same rules.
//! The expected files come from `parity/pmd-expected.py`.
use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicUsize, Ordering};

static RUNS: AtomicUsize = AtomicUsize::new(0);

type Row = (String, String, u64, u64);

/// Rows with how often each one is reported, so a doubled finding is a difference too.
type Rows = BTreeMap<Row, usize>;

fn counted(rows: impl IntoIterator<Item = Row>) -> Rows {
    let mut counts = Rows::new();
    for row in rows {
        *counts.entry(row).or_default() += 1;
    }
    counts
}

fn rows(case: &str, rules: &str) -> (Rows, Rows) {
    rows_of(case, "_XPath", rules)
}

fn rows_of(case: &str, rule: &str, rules: &str) -> (Rows, Rows) {
    rows_selected(case, rule, rules, None)
}

fn rows_selected(case: &str, rule: &str, rules: &str, only: Option<&str>) -> (Rows, Rows) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let source = root.join("fixtures").join(case);
    let run = RUNS.fetch_add(1, Ordering::Relaxed);
    let out = std::env::temp_dir().join(format!("nitpicker-engine-{case}-{}-{}-{run}.json", only.unwrap_or("all"), std::process::id()));
    let mut command = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"));
    if let Some(names) = only {
        command.env("NP_EP_ONLY", names);
    }
    let status = command
        .arg(&source)
        .args(["--rules", rule, "--out"])
        .arg(&out)
        .env("NP_XPATH_RULES", root.join("rules").join(format!("{rules}.json")))
        .status()
        .expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", source.display());
    let found = counted(report["findings"]
        .as_array()
        .expect("findings")
        .iter()
        .map(|finding| {
            let file = finding["file"].as_str().expect("file");
            let failed = finding["rule"].as_str().expect("rule").starts_with('!');
            (
                file.strip_prefix(&prefix).unwrap_or(file).to_string(),
                finding["rule"].as_str().expect("rule").to_string(),
                if failed { 0 } else { finding["line"].as_u64().expect("line") },
                if failed { 0 } else { finding["column"].as_u64().expect("column") },
            )
        })
        .collect::<Vec<Row>>());
    let expected: Vec<Row> =
        serde_json::from_str(&std::fs::read_to_string(root.join("expected").join(format!("{case}.json"))).expect("expected")).expect("rows");
    (found, counted(expected))
}

fn same_as_pmd(case: &str, rules: &str) {
    let (found, mut expected) = rows(case, rules);
    let wrong = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("expected").join(format!("{case}-pmd-wrong.json"));
    if let Ok(listed) = std::fs::read_to_string(&wrong) {
        let wrong: Vec<Row> = serde_json::from_str(&listed).expect("rows");
        for row in wrong {
            assert!(expected.remove(&row).is_some(), "{case}: {row:?} is listed as a wrong PMD finding but PMD did not report it");
            assert!(!found.contains_key(&row), "{case}: {row:?} copies a wrong PMD finding");
        }
    }
    let missed: Vec<&Row> = expected.iter().filter(|(row, count)| found.get(*row).unwrap_or(&0) < count).map(|(row, _)| row).collect();
    let extra: Vec<&Row> = found.iter().filter(|(row, count)| expected.get(*row).unwrap_or(&0) < count).map(|(row, _)| row).collect();
    assert!(missed.is_empty() && extra.is_empty(), "{case}: missed {missed:?}, extra {extra:?}");
    assert!(!expected.is_empty(), "{case}: nothing expected");
}

#[test]
fn suppressions_hide_what_pmd_hides() {
    same_as_pmd("suppressions", "suppressions");
}

#[test]
fn regular_expressions_match_what_pmd_matches() {
    same_as_pmd("regex", "regex");
}

#[test]
fn review_rules_report_what_pmd_reports() {
    same_as_pmd("formats", "all");
}

#[test]
fn rules_written_with_pmd_7_node_names_match_pmd() {
    same_as_pmd("pmd7names", "all");
}

#[test]
fn rare_built_in_rules_and_switch_facts_match_pmd() {
    same_as_pmd("builtins", "all");
}

#[test]
fn concurrency_and_value_rules_report_what_pmd_reports() {
    same_as_pmd("values", "all");
}

#[test]
fn error_prone_checks_report_what_error_prone_reports() {
    let (found, expected) = rows_of("errorprone", "_ErrorProne", "all");
    let found: BTreeMap<Row, _> = found.into_iter().filter(|(row, _)| row.1 != "NullAway").collect();
    let missed: Vec<&Row> = expected.iter().filter(|(row, count)| found.get(*row).unwrap_or(&0) < count).map(|(row, _)| row).collect();
    let extra: Vec<&Row> = found.iter().filter(|(row, count)| expected.get(*row).unwrap_or(&0) < count).map(|(row, _)| row).collect();
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:?}, extra {extra:?}");
    assert_eq!(expected.keys().map(|row| row.1.as_str()).collect::<BTreeSet<_>>().len(), 193);
}

/// A Java run selects some checks (`NP_EP_ONLY`); the others are skipped, and each selected check reports what it
/// reports in a run of all of them.
#[test]
fn a_selected_error_prone_check_reports_the_same_alone() {
    let (all, expected) = rows_of("errorprone", "_ErrorProne", "all");
    let mut names: BTreeSet<String> = expected.keys().map(|row| row.1.clone()).collect();
    names.insert("NullAway".to_string());
    for name in &names {
        let (alone, _) = rows_selected("errorprone", "_ErrorProne", "all", Some(name));
        let wanted: Rows = all.iter().filter(|(row, _)| &row.1 == name).map(|(row, count)| (row.clone(), *count)).collect();
        assert!(!wanted.is_empty(), "{name}: nothing reported");
        assert_eq!(alone, wanted, "{name}");
    }
}

#[test]
fn types_and_signatures_match_what_pmd_resolves() {
    same_as_pmd("types", "types");
}

/// PMD erases the supertypes of a raw type, so a raw `Serde` is no `Closeable` there, and a type variable is exactly no class.
#[test]
fn raw_types_and_type_variables_match_pmd() {
    same_as_pmd("raw", "raw");
}

#[test]
fn line_breaks_encodings_and_functions_match_pmd() {
    same_as_pmd("edges", "edges");
}

/// PMD 7.16.0 strips a byte order mark but then counts lines and columns as if it were still there, so a class on
/// line 2 is reported on line 1. The engine reports the true place; these rows were checked by hand.
#[test]
fn byte_order_mark_does_not_move_findings() {
    same_as_pmd("bom", "edges");
}

/// Java allows a NUL character in strings, text blocks, character literals and comments, and PMD parses such a file.
/// The grammar stops at it, so the engine reads it as a space there; a NUL in code still marks the file broken.
#[test]
fn a_nul_character_breaks_a_file_only_in_code() {
    let folder = std::env::temp_dir().join(format!("nitpicker-engine-nul-{}", std::process::id()));
    std::fs::create_dir_all(&folder).expect("folder");
    let sources = [
        ("Text", "String s = \"a\0b\";"),
        ("Letter", "char c = '\0';"),
        ("Block", "String t = \"\"\"\n  x\0y\n  \"\"\";"),
        ("Line", "// a\0b\nint a;"),
        ("Comment", "/* a\0b */ int a;"),
        ("Code", "int\0 a;"),
    ];
    for (name, body) in sources {
        std::fs::write(folder.join(format!("{name}.java")), format!("class {name} {{\n{body}\n}}\n")).expect("source");
    }
    let rules = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("rules").join("edges.json");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&folder)
        .args(["--rules", "_XPath"])
        .env("NP_XPATH_RULES", rules)
        .env("NP_XPATH_ONLY", "Field")
        .output()
        .expect("engine runs");
    let _ = std::fs::remove_dir_all(&folder);
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).expect("json");
    let broken: Vec<String> = report["syntaxErrorFiles"]
        .as_array()
        .expect("files")
        .iter()
        .map(|file| Path::new(file.as_str().expect("file")).file_name().expect("name").to_string_lossy().into_owned())
        .collect();
    assert_eq!(broken, ["Code.java"]);
    assert_eq!(report["findings"].as_array().map(Vec::len), Some(6));
}

/// One file of a single expression thousands of terms deep: the run of one file uses the large worker stack too.
#[test]
fn one_deeply_nested_file_is_analysed() {
    let folder = std::env::temp_dir().join(format!("nitpicker-engine-deep-{}", std::process::id()));
    std::fs::create_dir_all(&folder).expect("folder");
    let terms = vec!["\"a\""; 10_000].join(" + ");
    std::fs::write(folder.join("Deep.java"), format!("class Deep {{ String s = {terms}; }}\n")).expect("source");
    let rules = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("rules").join("edges.json");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&folder)
        .args(["--rules", "_XPath"])
        .env("NP_XPATH_RULES", rules)
        .env("NP_XPATH_ONLY", "Field")
        .output()
        .expect("engine runs");
    let _ = std::fs::remove_dir_all(&folder);
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    let report: serde_json::Value = serde_json::from_slice(&output.stdout).expect("json");
    assert_eq!(report["findings"].as_array().map(Vec::len), Some(1));
}

#[test]
fn patterns_type_their_variables_like_pmd() {
    same_as_pmd("patterns", "all");
}

fn override_lines(release: &str) -> Vec<u64> {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join("release");
    let out = std::env::temp_dir().join(format!("nitpicker-engine-release-{release}-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&source)
        .args(["--rules", "_ErrorProne", "--release", release, "--out"])
        .arg(&out)
        .status()
        .expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let findings = report["findings"].as_array().expect("findings").iter();
    let mut lines: Vec<u64> = findings.filter(|finding| finding["rule"] == "MissingOverride").map(|finding| finding["line"].as_u64().expect("line")).collect();
    lines.sort();
    lines
}

#[test]
fn an_older_release_sees_the_library_of_that_release() {
    assert_eq!(override_lines("17"), [6, 10]);
    assert_eq!(override_lines("21"), [6, 10, 14, 18]);
}

#[test]
fn null_away_reports_what_null_away_reports() {
    type Told = (String, u64, u64, String);
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let source = root.join("fixtures").join("nullaway");
    let out = std::env::temp_dir().join(format!("nitpicker-engine-nullaway-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&source)
        .args(["--rules", "_ErrorProne", "--out"])
        .arg(&out)
        .env("NP_EP_ONLY", "NullAway")
        .env("NP_NULLAWAY_PACKAGES", "n")
        .status()
        .expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", source.display());
    let text = |finding: &serde_json::Value, key: &str| finding[key].as_str().expect("text").to_string();
    let number = |finding: &serde_json::Value, key: &str| finding[key].as_u64().expect("number");
    let found: BTreeSet<Told> = report["findings"]
        .as_array()
        .expect("findings")
        .iter()
        .map(|finding| {
            let file = text(finding, "file");
            (file.strip_prefix(&prefix).unwrap_or(&file).to_string(), number(finding, "line"), number(finding, "column"), text(finding, "message"))
        })
        .collect();
    let expected: Vec<Told> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("nullaway.json")).expect("expected")).expect("rows");
    let expected: BTreeSet<Told> = expected.into_iter().collect();
    let missed: Vec<&Told> = expected.difference(&found).collect();
    let extra: Vec<&Told> = found.difference(&expected).collect();
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:?}, extra {extra:?}");
    assert_eq!(expected.len(), 119);
}

#[test]
fn ported_rules_report_what_pmd_reports_with_its_messages() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let source = root.join("fixtures").join("coded");
    let out = std::env::temp_dir().join(format!("nitpicker-engine-coded-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&source)
        .args(["--rules", "_XPath", "--out"])
        .arg(&out)
        .env("NP_XPATH_RULES", root.join("rules").join("coded.json"))
        .status()
        .expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", source.display());
    let mut found: Vec<(String, String, u64, u64, String)> = report["findings"]
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
    let read = |name: &str| -> Vec<(String, String, u64, u64, String)> {
        serde_json::from_str(&std::fs::read_to_string(root.join("expected").join(name)).expect("expected")).expect("rows")
    };
    let wrong = read("coded-pmd-wrong.json");
    let mut expected = read("coded.json");
    for row in &wrong {
        assert!(expected.contains(row), "{row:?} is listed as a wrong PMD finding but PMD did not report it");
        assert!(!found.contains(row), "{row:?} copies a wrong PMD finding");
    }
    expected.retain(|row| !wrong.contains(row) && row.1 != "!error");
    let missed: Vec<_> = expected.iter().filter(|row| !found.contains(row)).collect();
    let extra: Vec<_> = found.iter().filter(|row| !expected.contains(row)).collect();
    assert!(missed.is_empty() && extra.is_empty() && found.len() == expected.len(), "missed {missed:?}, extra {extra:?}");
}
