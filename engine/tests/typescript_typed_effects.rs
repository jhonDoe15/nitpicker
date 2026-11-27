//! Runs the rules that need the shared effects analysis on fixture projects with fake IO packages in each
//! subproject's `node_modules` (copied from `libraries` for the run, since `node_modules` is never committed),
//! and compares with what the ESLint-plugin rules reported for the same files with the JavaScript compiler.
use std::path::{Path, PathBuf};
use std::process::Command;

type Row = Vec<serde_json::Value>;

const REMOTE_CALLS: [&str; 2] = ["no-remote-call-in-transaction", "no-remote-call-under-lock"];
const WRITES: [&str; 4] = ["no-retry-without-idempotency", "no-dual-write", "no-stale-retry-after-conflict", "no-unisolated-job-loop"];
const LOOPS: [&str; 2] = ["no-lazy-relation-in-loop", "no-io-in-loop"];

fn compiler() -> Option<PathBuf> {
    if let Some(named) = std::env::var_os("NITPICKER_TYPESCRIPT_COMPILER") {
        return Some(PathBuf::from(named));
    }
    let platform = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("linux", "x86_64") => "linux-x64",
        ("linux", "aarch64") => "linux-arm64",
        ("macos", "x86_64") => "darwin-x64",
        ("macos", "aarch64") => "darwin-arm64",
        ("windows", "x86_64") => "win32-x64",
        ("windows", "aarch64") => "win32-arm64",
        _ => return None,
    };
    let name = if cfg!(windows) { "tsc.exe" } else { "tsc" };
    let installed = Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("../node_modules/@typescript/typescript-{platform}/lib/{name}"));
    installed.is_file().then_some(installed)
}

fn copy_tree(from: &Path, to: &Path) {
    std::fs::create_dir_all(to).expect("folder");
    for entry in std::fs::read_dir(from).expect("read folder").flatten() {
        let target = to.join(entry.file_name());
        if entry.path().is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            std::fs::copy(entry.path(), target).expect("copy");
        }
    }
}

fn posix(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn project(name: &str, tag: &str) -> (PathBuf, Vec<String>) {
    let fixtures = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
    let fixture = fixtures.join(name);
    let root = std::env::temp_dir().join(format!("nitpicker-engine-{name}-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    copy_tree(&fixture.join("project"), &root);
    let root = if cfg!(windows) { root } else { root.canonicalize().expect("root") };
    let mut subprojects: Vec<String> = std::fs::read_dir(&root).expect("read folder").flatten().filter(|entry| entry.path().is_dir()).map(|entry| entry.file_name().to_string_lossy().into_owned()).collect();
    subprojects.sort();
    let mut files = Vec::new();
    for subproject in subprojects {
        copy_tree(&fixtures.join("typescript-typed-effects/libraries"), &root.join(&subproject).join("node_modules"));
        if fixture.join("libraries").is_dir() {
            copy_tree(&fixture.join("libraries"), &root.join(&subproject).join("node_modules"));
        }
        for entry in std::fs::read_dir(root.join(&subproject).join("src")).expect("read folder").flatten() {
            files.push(format!("{subproject}/src/{}", entry.file_name().to_string_lossy()));
        }
    }
    files.sort();
    (root, files)
}

fn test_sources(root: &Path, files: &[String]) -> PathBuf {
    let path = root.join("test-sources.tsv");
    let lines: Vec<String> = files.iter().map(|file| format!("{}\t{}", u8::from(file.contains(".test.")), posix(&root.join(file)))).collect();
    std::fs::write(&path, format!("{}\n{}\n", posix(root), lines.join("\n"))).expect("test sources");
    path
}

fn lint(rules: &[&str], root: &Path, files: &[String], compiler: &Path) -> Vec<Row> {
    let list = root.join("list.tsv");
    let out = root.join("rows.json");
    let sources = test_sources(root, files);
    let settings: Vec<String> = rules.iter().map(|rule| format!("{rule}.test-sources={}", sources.display())).collect();
    let linted = files.iter().filter(|file| file.contains("/case-"));
    let lines: Vec<String> = linted.map(|file| format!("{}\t{file}\t{}", root.join(file).display(), settings.join("\t"))).collect();
    std::fs::write(&list, lines.join("\n")).expect("list");
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .args(["typescript-lint", "--rules", &rules.join(","), "--files"])
        .arg(&list)
        .arg("--out")
        .arg(&out)
        .arg("--compiler")
        .arg(compiler)
        .arg("--project")
        .arg(root.join("tsconfig.json"))
        .current_dir(root)
        .status()
        .expect("engine runs");
    assert!(status.success());
    let mut rows: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(&out).expect("rows")).expect("json");
    rows.sort_by_key(|row| serde_json::to_string(row).expect("text"));
    rows
}

fn compare(name: &str, rules: &[&str]) {
    let Some(compiler) = compiler() else {
        eprintln!("no TypeScript 7 compiler installed; {name} not compared");
        return;
    };
    let expected = Path::new(env!("CARGO_MANIFEST_DIR")).join(format!("tests/expected/{name}.json"));
    let mut expected: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(expected).expect("expected")).expect("json");
    expected.sort_by_key(|row| serde_json::to_string(row).expect("text"));
    let (root, files) = project(name, "compiler");
    let rows = lint(rules, &root, &files, &compiler);
    let _ = std::fs::remove_dir_all(&root);
    assert_eq!(rows, expected);
}

#[test]
fn remote_call_rules_match_the_plugin_on_the_fixture_project() {
    compare("typescript-typed-effects", &REMOTE_CALLS);
}

#[test]
fn write_rules_match_the_plugin_on_the_fixture_project() {
    compare("typescript-typed-writes", &WRITES);
}

#[test]
fn loop_rules_match_the_plugin_on_the_fixture_project() {
    compare("typescript-typed-loops", &LOOPS);
}

#[test]
fn every_file_stays_with_the_plugin_without_the_compiler() {
    let (root, files) = project("typescript-typed-effects", "missing");
    let missing = std::env::temp_dir().join("nitpicker-engine-no-such-compiler");
    let rows = lint(&REMOTE_CALLS, &root, &files, &missing);
    let _ = std::fs::remove_dir_all(&root);
    assert_eq!(rows.len(), files.iter().filter(|file| file.contains("/case-")).count());
    assert!(rows.iter().all(|row| row[1] == "!types"));
}
