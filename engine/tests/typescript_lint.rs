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

#[test]
fn a_test_file_takes_its_utilities_from_the_helper_its_imports_reach() {
    let expected = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("expected").join("typescript-scope.json");
    let found: Vec<Row> = serde_json::from_str::<Vec<Row>>(&engine_on_scope_fixtures(&["typescript-lint", "--testing-library-scope"]))
        .expect("json")
        .into_iter()
        .filter(|row| row[1].as_str().is_some_and(|rule| rule.starts_with("testing-library/")))
        .collect();
    assert_eq!(sorted(found), rows(&expected));
    let unscoped: Vec<Row> = serde_json::from_str::<Vec<Row>>(&engine_on_scope_fixtures(&["typescript-lint"]))
        .expect("json")
        .into_iter()
        .filter(|row| row[1].as_str().is_some_and(|rule| rule.starts_with("testing-library/")))
        .collect();
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

#[test]
fn config_hands_multi_root_layout_and_rule_options_to_typescript_lint() {
    let pid = std::process::id();
    let config_file = std::env::temp_dir().join(format!("nitpicker-engine-config-{pid}.json"));
    let list_file = std::env::temp_dir().join(format!("nitpicker-engine-config-files-{pid}.tsv"));
    let config_json = serde_json::json!({
        "projectRoot": "/workspace/app",
        "layout": {
            "sourceRoots": ["./packages/api/src/", "packages\\web\\src", "shared"],
            "testRoots": ["test", "integration", "e2e"],
            "extensions": ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"],
            "colocatedTests": true,
            "excludedGlobs": ["packages/api/src/legacy/**"],
            "generatedFiles": ["shared/generated-schema.ts"],
            "testPatterns": {
                "include": ["**/*.{test,spec}.{ts,tsx,mts,cts,js,jsx,mjs,cjs}", "integration/**/*.ts"],
                "exclude": ["**/*.fixture.ts"],
                "includeRegexes": [],
                "excludeRegexes": []
            }
        },
        "rules": {
            "report-module-load-effects": { "commonJsExports": true },
            "test-must-use-production-runtime": { "runner": "vitest", "exemptPattern": "contract/" },
            "no-copied-constant": {}
        }
    });
    std::fs::write(&config_file, serde_json::to_string(&config_json).expect("json")).expect("config");
    let listed = [
        "/workspace/app/packages/api/src/server.ts\tpackages/api/src/server.ts",
        "/workspace/app/packages/web/src/App.tsx\t./packages\\web\\src\\App.tsx",
        "/workspace/app/packages/api/src/server.test.ts\tpackages/api/src/server.test.ts",
        "/workspace/app/packages/web/src/test-support/render.tsx\tpackages/web/src/test-support/render.tsx",
        "/workspace/app/packages/api/src/legacy/old.ts\tpackages/api/src/legacy/old.ts",
        "/workspace/app/shared/generated-schema.ts\tshared/generated-schema.ts",
        "/workspace/app/integration/api.ts\tintegration/api.ts",
        "/workspace/app/integration/helper.fixture.ts\tintegration/helper.fixture.ts",
        "/workspace/app/e2e/login.spec.ts\te2e/login.spec.ts",
    ];
    std::fs::write(&list_file, listed.join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .args(["typescript-lint", "--config"])
        .arg(&config_file)
        .arg("--files")
        .arg(&list_file)
        .arg("--dump-config")
        .output()
        .expect("engine runs");
    let _ = std::fs::remove_file(&config_file);
    let _ = std::fs::remove_file(&list_file);
    assert!(output.status.success(), "stderr: {}", String::from_utf8_lossy(&output.stderr));
    let dumped: serde_json::Value = serde_json::from_slice(&output.stdout).expect("dump json");
    assert_eq!(dumped["layout"]["sourceRoots"], serde_json::json!(["packages/api/src", "packages/web/src", "shared"]));
    assert_eq!(dumped["layout"]["testRoots"], serde_json::json!(["test", "integration", "e2e"]));
    assert_eq!(dumped["rules"]["report-module-load-effects"]["commonJsExports"], serde_json::json!(true));
    assert_eq!(dumped["rules"]["test-must-use-production-runtime"]["runner"], serde_json::json!("vitest"));

    let files = dumped["files"].as_array().expect("files array");
    assert_eq!(files.len(), listed.len());
    assert_eq!(files[0]["file"], "packages/api/src/server.ts");
    assert_eq!(files[0]["isSourceFile"], true);
    assert_eq!(files[0]["isTestFile"], false);
    assert_eq!(files[0]["sourceRoot"], "packages/api/src");

    assert_eq!(files[1]["file"], "packages/web/src/App.tsx");
    assert_eq!(files[1]["isSourceFile"], true);
    assert_eq!(files[1]["sourceRoot"], "packages/web/src");

    assert_eq!(files[2]["isSourceFile"], false);
    assert_eq!(files[2]["isTestFile"], true);
    assert_eq!(files[2]["isRunnableTestFile"], true);

    assert_eq!(files[3]["isSourceFile"], false);
    assert_eq!(files[3]["isTestFile"], true);
    assert_eq!(files[3]["isRunnableTestFile"], false);

    assert_eq!(files[4]["isSourceFile"], false);
    assert_eq!(files[4]["isExcluded"], true);

    assert_eq!(files[5]["isSourceFile"], false);
    assert_eq!(files[5]["isGeneratedPath"], true);

    assert_eq!(files[6]["isTestFile"], true);
    assert_eq!(files[6]["isRunnableTestFile"], true);

    assert_eq!(files[7]["isTestFile"], true);
    assert_eq!(files[7]["isRunnerTestFile"], false);

    assert_eq!(files[8]["isTestFile"], true);
    assert_eq!(files[8]["isEndToEndTest"], true);
}

fn run_deep_nesting_case(tag: &str, deep_source: &str, rules: Option<&str>) {
    let pid = std::process::id();
    let dir = std::env::temp_dir().join(format!("nitpicker-engine-deep-{tag}-{pid}"));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("temp dir");

    let deep_file = dir.join("deep.ts");
    let normal_file = dir.join("normal.ts");
    let list_file = dir.join("files.tsv");

    std::fs::write(&deep_file, deep_source).expect("deep file");
    std::fs::write(&normal_file, "try { run(); } catch (err) {}\n").expect("normal file");
    let list_content = format!(
        "{}\tdeep.ts\n{}\tnormal.ts\n",
        deep_file.display(),
        normal_file.display(),
    );
    std::fs::write(&list_file, list_content).expect("list file");

    let mut command = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"));
    command.arg("typescript-lint").arg("--files").arg(&list_file);
    if let Some(rules) = rules {
        command.arg("--rules").arg(rules);
    }
    let output = command.output().expect("engine runs");
    let _ = std::fs::remove_dir_all(&dir);

    assert!(
        output.status.success(),
        "typescript-lint failed for {tag} (status={:?}): {}",
        output.status,
        String::from_utf8_lossy(&output.stderr)
    );

    let found: Vec<Row> = serde_json::from_slice(&output.stdout).expect("json");
    assert!(
        found.iter().any(|row| row[0] == "normal.ts" && row[1] == "nitpicker/no-silent-catch"),
        "expected normal.ts finding alongside {tag}, got: {found:?}"
    );
    assert!(
        found.iter().any(|row| row[0] == "deep.ts" && row[1] == "!parse"),
        "expected deep.ts to fall back with !parse for {tag}, got: {found:?}"
    );
}

#[test]
fn deeply_nested_if_blocks_do_not_overflow_the_stack() {
    let deep = format!("{}{}", "if (a) {".repeat(20_000), "}".repeat(20_000));
    run_deep_nesting_case("if-no-silent-catch", &deep, Some("no-silent-catch"));
    run_deep_nesting_case("if-all-rules", &deep, None);
}

#[test]
fn deeply_chained_calls_do_not_overflow_the_stack() {
    let deep = format!("a{}", ".b()".repeat(50_000));
    run_deep_nesting_case("chain-no-silent-catch", &deep, Some("no-silent-catch"));
    run_deep_nesting_case("chain-all-rules", &deep, None);
}
