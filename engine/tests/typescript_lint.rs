//! Runs the engine's lint rules on fixtures and compares the findings with what the ESLint rules reported for
//! the same files. The expected files come from `parity/typescript-lint-expected.mts`.
use std::path::Path;
use std::process::Command;

/// A finding as written: file, rule, line, column, message, and the end of the range when there is one.
type Row = Vec<serde_json::Value>;

fn sorted(mut rows: Vec<Row>) -> Vec<Row> {
    rows.sort_by_key(|row| serde_json::to_string(row).expect("text"));
    rows
}

fn rows(path: &Path) -> Vec<Row> {
    sorted(serde_json::from_str(&std::fs::read_to_string(path).expect("rows")).expect("json"))
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
    let found: Vec<Row> = rows(&out).into_iter().filter(|row| row[1].as_str().is_some_and(|rule| rule.starts_with("testing-library/"))).collect();
    let expected = rows(&root.join("expected").join("typescript-lint.json"));
    let _ = std::fs::remove_file(&list);
    let _ = std::fs::remove_file(&out);
    assert_eq!(found, expected);
    let reporting: std::collections::BTreeSet<&str> = expected.iter().filter_map(|row| row[1].as_str()).collect();
    assert_eq!(reporting.len(), 12, "every rule reports in the fixtures");
}

const SCOPED: [&str; 3] = ["src/direct.test.tsx", "src/no-react.test.ts", "src/through-helper.test.ts"];

fn engine_on_scope_fixtures(arguments: &[&str]) -> String {
    let project = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join("typescript-scope");
    let list = std::env::temp_dir().join(format!("nitpicker-engine-scope-{}-{}.tsv", arguments[0], std::process::id()));
    let lines: Vec<String> = SCOPED.iter().map(|name| format!("{}\t{name}", project.join(name).display())).collect();
    std::fs::write(&list, lines.join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).args(arguments).arg("--files").arg(&list).output().expect("engine runs");
    let _ = std::fs::remove_file(&list);
    assert!(output.status.success());
    String::from_utf8(output.stdout).expect("text").replace(&format!("{}/", project.display()), "")
}

#[test]
fn imports_resolve_through_the_path_mapping_of_the_nearest_config() {
    let expected = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("expected").join("typescript-scope-imports.jsonl");
    assert_eq!(engine_on_scope_fixtures(&["typescript-imports"]), std::fs::read_to_string(expected).expect("expected"));
}

fn testing_library(found: Vec<Row>) -> Vec<Row> {
    found.into_iter().filter(|row| row[1].as_str().is_some_and(|rule| rule.starts_with("testing-library/"))).collect()
}

#[test]
fn a_test_file_takes_its_utilities_from_the_helper_its_imports_reach() {
    let expected = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("expected").join("typescript-scope.json");
    let found: Vec<Row> = serde_json::from_str(&engine_on_scope_fixtures(&["typescript-lint", "--testing-library-scope"])).expect("json");
    assert_eq!(sorted(testing_library(found)), rows(&expected));
    let unscoped: Vec<Row> = testing_library(serde_json::from_str(&engine_on_scope_fixtures(&["typescript-lint"])).expect("json"));
    assert_eq!(unscoped.len(), 1, "without the scope only the direct import counts");
}

const REACT_TESTS: [&str; 4] = ["hover.test.tsx", "internals.test.tsx", "keyboard.test.tsx", "outside.test.ts"];
const REACT_TEST_RULES: &str = "hover-test-needs-keyboard,react-test-no-implementation-details";

#[test]
fn react_test_rules_report_what_the_eslint_rules_report() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let fixtures = root.join("fixtures").join("typescript-react-tests");
    let list = std::env::temp_dir().join(format!("nitpicker-engine-react-tests-{}.tsv", std::process::id()));
    let lines: Vec<String> = REACT_TESTS.iter().map(|name| format!("{}\t{name}", fixtures.join(name).display())).collect();
    std::fs::write(&list, lines.join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).args(["typescript-lint", "--rules", REACT_TEST_RULES, "--files"]).arg(&list).output().expect("engine runs");
    let _ = std::fs::remove_file(&list);
    assert!(output.status.success());
    let found: Vec<Row> = serde_json::from_slice(&output.stdout).expect("json");
    assert_eq!(sorted(found), rows(&root.join("expected").join("typescript-react-tests.json")));
}

const REDECLARED: [(&str, &str, bool); 8] = [
    ("function.ts", "export function run(a: string) { function a() {} return a; }", false),
    ("rest.ts", "export function run(...a: string[]) { function a() {} return a; }", false),
    ("pattern.ts", "export function run({ a }: { a: string }) { async function a() {} return a; }", false),
    ("arrow.ts", "export const run = (a: string) => { function* a() {} return a; };", false),
    ("class.ts", "export function run(a: string) { class a {} return a; }", true),
    ("lexical.ts", "export function run(a: string) { let a = 1; return a; }", true),
    ("block.ts", "export function run(a: string) { { var a: unknown; function a() {} } return a; }", true),
    ("parameters.ts", "export function run(a: string, a: string) { return a; }", true),
];

#[test]
fn only_a_function_declaration_may_redeclare_a_parameter() {
    let directory = std::env::temp_dir().join(format!("nitpicker-engine-redeclared-{}", std::process::id()));
    std::fs::create_dir_all(&directory).expect("directory");
    let lines: Vec<String> = REDECLARED
        .iter()
        .map(|(name, text, _)| {
            std::fs::write(directory.join(name), text).expect("file");
            format!("{}\t{name}", directory.join(name).display())
        })
        .collect();
    let list = directory.join("list.tsv");
    std::fs::write(&list, lines.join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).args(["typescript-lint", "--files"]).arg(&list).output().expect("engine runs");
    let _ = std::fs::remove_dir_all(&directory);
    assert!(output.status.success());
    let found: Vec<Row> = serde_json::from_slice(&output.stdout).expect("json");
    let unparsed: Vec<&str> = REDECLARED.iter().filter(|(_, _, refused)| *refused).map(|(name, _, _)| *name).collect();
    let marked: Vec<&str> = REDECLARED
        .iter()
        .map(|(name, _, _)| *name)
        .filter(|name| found.iter().any(|row| row[0] == *name && row[1] == "!parse"))
        .collect();
    assert_eq!(marked, unparsed);
}
