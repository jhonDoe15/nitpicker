//! Runs the contract and handler rules on a fixture project that has fake framework packages in its
//! `node_modules` (copied from `libraries` for the run, since `node_modules` is never committed), and compares
//! with what the ESLint-plugin rules reported for the same files with the JavaScript compiler.
use std::path::{Path, PathBuf};
use std::process::Command;

type Row = Vec<serde_json::Value>;

const RULES: &str = "contract-infrastructure-type,handler-entity-type";
const FEATURE: &str = "contract-infrastructure-type.feature";

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

fn source_files(folder: &Path, root: &Path, found: &mut Vec<String>) {
    for entry in std::fs::read_dir(folder).expect("read folder").flatten() {
        let path = entry.path();
        if path.is_dir() {
            source_files(&path, root, found);
        } else if path.extension().is_some_and(|extension| extension == "ts" || extension == "js") {
            found.push(path.strip_prefix(root).expect("inside").to_string_lossy().replace('\\', "/"));
        }
    }
}

fn feature_of(file: &str) -> String {
    let parts: Vec<&str> = file.split('/').collect();
    let is_index = parts.len() == 5 && parts[..3] == ["src", "main", "features"] && parts[4].starts_with("index.");
    if is_index { parts[3].to_string() } else { String::new() }
}

fn project(tag: &str) -> (PathBuf, Vec<String>) {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/typescript-typed-contracts");
    let root = std::env::temp_dir().join(format!("nitpicker-engine-typed-contracts-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&root);
    copy_tree(&fixture.join("project"), &root);
    copy_tree(&fixture.join("libraries"), &root.join("node_modules"));
    let mut files = Vec::new();
    source_files(&root.join("src"), &root, &mut files);
    files.sort();
    (root, files)
}

fn lint(root: &Path, files: &[String], compiler: &Path) -> Vec<Row> {
    let list = root.join("list.tsv");
    let out = root.join("rows.json");
    let lines: Vec<String> = files.iter().map(|file| format!("{}\t{file}\t{FEATURE}={}", root.join(file).display(), feature_of(file))).collect();
    std::fs::write(&list, lines.join("\n")).expect("list");
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .args(["typescript-lint", "--rules", RULES, "--files"])
        .arg(&list)
        .arg("--out")
        .arg(&out)
        .arg("--compiler")
        .arg(compiler)
        .arg("--project")
        .arg(root.join("tsconfig.json"))
        .status()
        .expect("engine runs");
    assert!(status.success());
    let mut rows: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(&out).expect("rows")).expect("json");
    rows.sort_by_key(|row| serde_json::to_string(row).expect("text"));
    rows
}

#[test]
fn contract_and_handler_rules_match_the_plugin_on_the_fixture_project() {
    let Some(compiler) = compiler() else {
        eprintln!("no TypeScript 7 compiler installed; contract and handler rules not compared");
        return;
    };
    let expected = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/expected/typescript-typed-contracts.json");
    let mut expected: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(expected).expect("expected")).expect("json");
    expected.sort_by_key(|row| serde_json::to_string(row).expect("text"));
    let (root, files) = project("compiler");
    let rows = lint(&root, &files, &compiler);
    let _ = std::fs::remove_dir_all(&root);
    assert_eq!(rows, expected);
}

#[test]
fn every_file_stays_with_the_plugin_without_the_compiler() {
    let (root, files) = project("missing");
    let missing = std::env::temp_dir().join("nitpicker-engine-no-such-compiler");
    let rows = lint(&root, &files, &missing);
    let _ = std::fs::remove_dir_all(&root);
    assert_eq!(rows.len(), files.len());
    assert!(rows.iter().all(|row| row[1] == "!types"));
}
