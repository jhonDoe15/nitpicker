//! Runs the engine's typed lint rules on a fixture project against a real TypeScript 7 compiler when one is
//! installed, and compares with what the ESLint-plugin rules reported for the same files with the JavaScript
//! compiler. A file outside the program gets a `!types` row and stays with the plugin rules.
use std::path::{Path, PathBuf};
use std::process::Command;

type Row = Vec<serde_json::Value>;

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

fn sorted(mut rows: Vec<Row>) -> Vec<Row> {
    rows.sort_by_key(|row| serde_json::to_string(row).expect("text"));
    rows
}

fn lint(arguments: &[&std::ffi::OsStr], name: &str) -> Vec<Row> {
    let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/typescript-typed-lint");
    let list = std::env::temp_dir().join(format!("nitpicker-engine-typed-lint-{name}-{}.tsv", std::process::id()));
    let out = std::env::temp_dir().join(format!("nitpicker-engine-typed-lint-{name}-{}.json", std::process::id()));
    let lines: Vec<String> = ["src/domain/record.ts", "outside.ts"].iter().map(|file| format!("{}\t{file}", fixture.join(file).display())).collect();
    std::fs::write(&list, lines.join("\n")).expect("list");
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .args(["typescript-lint", "--rules", "no-mutating-method-in-domain", "--files"])
        .arg(&list)
        .arg("--out")
        .arg(&out)
        .args(arguments)
        .arg("--project")
        .arg(fixture.join("tsconfig.json"))
        .status()
        .expect("engine runs");
    assert!(status.success());
    let rows = serde_json::from_str(&std::fs::read_to_string(&out).expect("rows")).expect("json");
    let _ = std::fs::remove_file(&list);
    let _ = std::fs::remove_file(&out);
    sorted(rows)
}

#[test]
fn typed_rules_match_the_plugin_on_the_fixture_project() {
    let Some(compiler) = compiler() else {
        eprintln!("no TypeScript 7 compiler installed; typed lint rules not compared");
        return;
    };
    let expected: Vec<Row> =
        serde_json::from_str(&std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/expected/typescript-typed-lint.json")).expect("expected"))
            .expect("json");
    assert_eq!(lint(&[std::ffi::OsStr::new("--compiler"), compiler.as_os_str()], "compiler"), sorted(expected));
}

#[test]
fn every_file_stays_with_the_plugin_without_the_compiler() {
    let missing = std::env::temp_dir().join("nitpicker-engine-no-such-compiler");
    let rows = lint(&[std::ffi::OsStr::new("--compiler"), missing.as_os_str()], "missing");
    let rules: Vec<&str> = rows.iter().map(|row| row[1].as_str().unwrap_or_default()).collect();
    assert_eq!(rules, ["!types", "!types"]);
}
