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
    rows_with(case, rule, rules, only, &[], case)
}

fn rows_with(case: &str, rule: &str, rules: &str, only: Option<&str>, options: &[&str], expected: &str) -> (Rows, Rows) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let source = root.join("fixtures").join(case);
    let run = RUNS.fetch_add(1, Ordering::Relaxed);
    let out = std::env::temp_dir().join(format!("nitpicker-engine-{}-{}-{}-{run}.json", case.replace('/', "-"), only.unwrap_or("all"), std::process::id()));
    let mut command = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"));
    if let Some(names) = only {
        command.env("NP_EP_ONLY", names);
    }
    let status = command
        .arg(&source)
        .args(["--rules", rule, "--out"])
        .arg(&out)
        .args(options)
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
        serde_json::from_str(&std::fs::read_to_string(root.join("expected").join(format!("{expected}.json"))).expect("expected")).expect("rows");
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
fn repeated_work_rules_report_what_pmd_reports() {
    same_as_pmd("repeats", "all");
}

#[test]
fn memory_growth_rules_report_what_pmd_reports() {
    same_as_pmd("memory", "all");
}

#[test]
fn repeated_scans_and_caches_report_what_pmd_reports() {
    same_as_pmd("fixed", "all");
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

fn same_as_error_prone((found, expected): (Rows, Rows), checks: usize) {
    let found: BTreeMap<Row, _> = found.into_iter().filter(|(row, _)| row.1 != "NullAway").collect();
    let missed: Vec<&Row> = expected.iter().filter(|(row, count)| found.get(*row).unwrap_or(&0) < count).map(|(row, _)| row).collect();
    let extra: Vec<&Row> = found.iter().filter(|(row, count)| expected.get(*row).unwrap_or(&0) < count).map(|(row, _)| row).collect();
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:?}, extra {extra:?}");
    assert_eq!(expected.keys().map(|row| row.1.as_str()).collect::<BTreeSet<_>>().len(), checks);
}

#[test]
fn error_prone_checks_report_what_error_prone_reports() {
    same_as_error_prone(rows_of("errorprone", "_ErrorProne", "all"), 541);
}

/// `--test-only` is Error Prone's `-XepCompilingTestOnlyCode`; the rows come from Error Prone run with that flag.
#[test]
fn error_prone_checks_report_what_error_prone_reports_on_test_only_code() {
    same_as_error_prone(rows_with("errorprone", "_ErrorProne", "all", None, &["--test-only"], "errorprone-test-only"), 528);
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

/// javac's `-encoding`: the rows come from Error Prone compiling each fixture in its character set.
#[test]
fn error_prone_checks_read_sources_in_the_encoding_of_the_compile() {
    for (case, encoding) in [("latin1", "ISO-8859-1"), ("cp1252", "windows-1252"), ("ms932", "windows-31j")] {
        let (found, expected) = rows_with(&format!("encodings/{case}"), "_ErrorProne", "all", None, &["--encoding", encoding], &format!("errorprone-{case}"));
        assert_eq!(found, expected, "{encoding}");
    }
    let report = std::env::temp_dir().join(format!("nitpicker-engine-latin1-{}.json", std::process::id()));
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/encodings/latin1");
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&source)
        .args(["--rules", "_ErrorProne", "--encoding", "latin1", "--out"])
        .arg(&report)
        .env("NP_EP_ONLY", "ReferenceEquality")
        .status()
        .expect("engine runs");
    assert!(status.success());
    let text = std::fs::read_to_string(&report).expect("report");
    let _ = std::fs::remove_file(&report);
    let report: serde_json::Value = serde_json::from_str(&text).expect("json");
    let message = report["findings"][0]["message"].as_str().expect("message");
    assert!(message.contains("return \"caf\u{e9} \u{f1}and\u{fa}\".equals(x);"), "{message}");
}

#[test]
fn an_encoding_the_engine_cannot_decode_as_the_jdk_does_stops_the_run() {
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/encodings/latin1"))
        .args(["--rules", "_ErrorProne", "--encoding", "GB18030"])
        .output()
        .expect("engine runs");
    assert!(!output.status.success());
    assert!(String::from_utf8_lossy(&output.stderr).contains("the engine cannot read sources in the encoding GB18030"));
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

type Told = (String, u64, u64, String);

/// NullAway rows of the engine on `source`, with paths relative to `base`, against expected rows from NullAway itself.
fn null_away_differences(source: &Path, base: &Path, packages: &str, lookup: Option<(&str, &Path)>, expected: &str) -> (Vec<Told>, Vec<Told>, usize) {
    let out = std::env::temp_dir().join(format!("nitpicker-engine-nullaway-{}-{}.json", std::process::id(), RUNS.fetch_add(1, Ordering::Relaxed)));
    let mut command = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"));
    command.arg(source).args(["--rules", "_ErrorProne", "--out"]).arg(&out).env("NP_EP_ONLY", "NullAway").env("NP_NULLAWAY_PACKAGES", packages);
    if let Some((option, entries)) = lookup {
        command.arg(option).arg(entries);
    }
    assert!(command.status().expect("engine runs").success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", base.display());
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
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let expected: Vec<Told> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join(expected)).expect("expected")).expect("rows");
    let expected: BTreeSet<Told> = expected.into_iter().collect();
    let missed = expected.difference(&found).cloned().collect();
    let extra = found.difference(&expected).cloned().collect();
    (missed, extra, expected.len())
}

#[test]
fn null_away_reports_what_null_away_reports() {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join("nullaway");
    let (missed, extra, count) = null_away_differences(&source, &source, "n", None, "nullaway.json");
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:?}, extra {extra:?}");
    assert_eq!(count, 132);
}

/// The Error Prone fixtures, with the top-level packages of the sources as NullAway's annotated packages. Classes in
/// the default package are outside them.
#[test]
fn null_away_reports_what_null_away_reports_on_the_error_prone_fixtures() {
    let source = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join("errorprone");
    let mut found = BTreeSet::new();
    let mut pending = vec![source.clone()];
    while let Some(folder) = pending.pop() {
        for path in std::fs::read_dir(folder).expect("fixtures").flatten().map(|entry| entry.path()) {
            if path.is_dir() {
                pending.push(path);
            } else if path.extension().is_some_and(|extension| extension == "java") {
                let text = std::fs::read_to_string(&path).expect("fixture");
                let declared = text.lines().map(str::trim_start).find_map(|line| line.strip_prefix("package").filter(|rest| rest.starts_with(char::is_whitespace)));
                if let Some((name, _)) = declared.and_then(|rest| rest.split_once(';')) {
                    found.insert(name.trim().to_string());
                }
            }
        }
    }
    let top: Vec<&str> = found.iter().filter(|name| !found.iter().any(|other| name.starts_with(&format!("{other}.")))).map(String::as_str).collect();
    let (missed, extra, count) = null_away_differences(&source, &source, &top.join(","), None, "nullaway-errorprone.json");
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:?}, extra {extra:?}");
    assert_eq!(count, 739);
}

/// A module (`module-info.java` with `requires` and a package it does not export) against a `@NullMarked` library
/// module with a `@NullUnmarked` package, as javac compiles it with `--module-path`: NullAway and the other checks
/// report what Error Prone reports, with the library as a folder and as a multi-release jar inside a folder of modules.
#[test]
fn null_away_and_error_prone_report_the_same_on_a_module() {
    let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join("nullaway-modules");
    let classes = std::env::temp_dir().join(format!("nitpicker-engine-nullaway-modules-{}", std::process::id()));
    let library = ["module-info.java", "lib/Nullable.java", "lib/Store.java", "lib/loose/package-info.java", "lib/loose/Lookup.java", "org/jspecify/annotations/NullMarked.java", "org/jspecify/annotations/NullUnmarked.java"]
        .map(|file| base.join("library").join(file));
    let javac = Path::new(&std::env::var("JAVA_HOME").expect("JAVA_HOME")).join("bin").join("javac");
    assert!(Command::new(javac).arg("-d").arg(&classes).args(&library).env_remove("JAVA_TOOL_OPTIONS").status().expect("javac runs").success());
    let lookup = classes.display().to_string();
    let (found, expected) = rows_with("nullaway-modules/sources", "_ErrorProne", "all", None, &["--module-path", &lookup], "errorprone-modules");
    let packed = std::env::temp_dir().join(format!("nitpicker-engine-nullaway-modules-jars-{}", std::process::id()));
    let jar = Path::new(&std::env::var("JAVA_HOME").expect("JAVA_HOME")).join("bin").join("jar");
    let versioned = packed.join("versioned");
    std::fs::create_dir_all(&versioned).expect("folder");
    std::fs::rename(classes.join("module-info.class"), versioned.join("module-info.class")).expect("move");
    let manifest = packed.join("manifest.txt");
    std::fs::write(&manifest, "Multi-Release: true\n").expect("manifest");
    let folder = packed.join("modules");
    std::fs::create_dir_all(&folder).expect("folder");
    let archive = folder.join("lib.jar");
    let packing = Command::new(jar).arg("--create").arg("--file").arg(&archive).arg("--manifest").arg(&manifest).arg("-C").arg(&classes).arg(".").args(["--release", "9", "-C"]).arg(&versioned).arg(".").env_remove("JAVA_TOOL_OPTIONS").status();
    let _ = std::fs::remove_dir_all(&classes);
    assert!(packing.expect("jar runs").success());
    let (missed, extra, count) = null_away_differences(&base.join("sources"), &base, "demo.app.api,demo.app.internal", Some(("--module-path", &folder)), "nullaway-modules.json");
    let _ = std::fs::remove_dir_all(&packed);
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:?}, extra {extra:?}");
    assert_eq!(count, 8);
    let found: Rows = found.into_iter().filter(|(row, _)| row.1 != "NullAway").collect();
    assert_eq!(found, expected);
}

/// A library compiled with javac carries its `@Nullable` in type annotations; NullAway reads them from the class files.
#[test]
fn null_away_reads_type_annotations_from_class_files() {
    let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join("nullaway-classes");
    let classes = std::env::temp_dir().join(format!("nitpicker-engine-nullaway-classes-{}", std::process::id()));
    let mut sources = Vec::new();
    let mut pending = vec![base.join("library")];
    while let Some(folder) = pending.pop() {
        for entry in std::fs::read_dir(folder).expect("library").flatten() {
            let path = entry.path();
            if path.is_dir() { pending.push(path) } else { sources.push(path) }
        }
    }
    let javac = Path::new(&std::env::var("JAVA_HOME").expect("JAVA_HOME")).join("bin").join("javac");
    assert!(Command::new(javac).arg("-d").arg(&classes).args(&sources).env_remove("JAVA_TOOL_OPTIONS").status().expect("javac runs").success());
    let result = null_away_differences(&base.join("sources"), &base, "u,lib", Some(("--classpath", &classes)), "nullaway-classes.json");
    let _ = std::fs::remove_dir_all(&classes);
    let (missed, extra, count) = result;
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:?}, extra {extra:?}");
    assert_eq!(count, 39);
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
    for row in &read("coded-pmd-missed.json") {
        assert!(!expected.contains(row), "{row:?} is listed as missed by PMD but PMD reported it");
        assert!(found.contains(row), "{row:?} is listed as missed by PMD but the engine does not report it");
        found.retain(|known| known != row);
    }
    expected.retain(|row| !wrong.contains(row) && row.1 != "!error");
    let missed: Vec<_> = expected.iter().filter(|row| !found.contains(row)).collect();
    let extra: Vec<_> = found.iter().filter(|row| !expected.contains(row)).collect();
    assert!(missed.is_empty() && extra.is_empty() && found.len() == expected.len(), "missed {missed:?}, extra {extra:?}");
}
