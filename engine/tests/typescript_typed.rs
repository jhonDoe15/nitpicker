//! Runs the typed checks against a real TypeScript 7 compiler when one is installed, and compares with what the
//! Node checks reported for the same fixture projects (`parity/typescript-typed-expected.mts`). Also checks
//! that the engine says "types unavailable" (exit status 3) instead of failing when it cannot use the compiler.
use std::path::{Path, PathBuf};
use std::process::{Command, Output};

const TYPES_UNAVAILABLE: i32 = 3;

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

fn fixtures() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures/typescript-typed")
}

fn engine(compiler: &Path, project: &Path, checks: &str, more: &[&str]) -> Output {
    Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg("typescript-typed")
        .arg("--compiler")
        .arg(compiler)
        .arg("--project")
        .arg(project)
        .arg("--checks")
        .arg(checks)
        .args(more)
        .output()
        .expect("engine runs")
}

fn sorted(findings: &serde_json::Value) -> Vec<String> {
    let mut rows: Vec<String> = findings.as_array().expect("findings").iter().map(|row| row.to_string()).collect();
    rows.sort();
    rows
}

#[test]
fn checks_match_the_node_checks_on_the_fixture_projects() {
    let Some(compiler) = compiler() else {
        eprintln!("no TypeScript 7 compiler installed; typed checks not compared");
        return;
    };
    let expected: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/expected/typescript-typed.json")).expect("expected")).expect("json");
    let projects = expected.as_object().expect("projects");
    assert!(!projects.is_empty());
    for (project, checks) in projects {
        let names: Vec<&str> = checks.as_object().expect("checks").keys().map(String::as_str).collect();
        for more in [&[][..], &["--all-reads"][..]] {
            let output = engine(&compiler, &fixtures().join(project).join("tsconfig.json"), &names.join(","), more);
            assert!(output.status.success(), "{project}: {}", String::from_utf8_lossy(&output.stderr));
            let report: serde_json::Value = serde_json::from_slice(&output.stdout).expect("report");
            for name in &names {
                assert_eq!(sorted(&report["checks"][name]["findings"]), sorted(&checks[name]), "{project} {name} {more:?}");
            }
            assert_eq!(report["session"]["places_not_found"], 0, "{project}: every node is found in the compiler's tree");
        }
    }
}

#[test]
fn contracts_come_only_from_the_own_root_when_one_is_given() {
    let Some(compiler) = compiler() else { return };
    let project = fixtures().join("workspace");
    let input = std::env::temp_dir().join(format!("nitpicker-engine-own-root-{}.json", std::process::id()));
    let own_root = project.join("src/app").to_string_lossy().replace('\\', "/");
    std::fs::write(&input, serde_json::json!({ "ownRoot": own_root }).to_string()).expect("input");
    let narrowed = engine(&compiler, &project.join("tsconfig.json"), "public-contracts", &["--input", &format!("public-contracts={}", input.display())]);
    let whole = engine(&compiler, &project.join("tsconfig.json"), "public-contracts", &[]);
    let _ = std::fs::remove_file(&input);
    let methods = |output: &Output| {
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        let report: serde_json::Value = serde_json::from_slice(&output.stdout).expect("report");
        let rows = report["checks"]["public-contracts"]["findings"].as_array().expect("findings").clone();
        rows.iter().map(|row| format!("{}.{}", row["contract"].as_str().expect("contract"), row["method"].as_str().expect("method"))).collect::<Vec<_>>()
    };
    assert_eq!(methods(&narrowed), ["Repository.save"]);
    assert_eq!(methods(&whole), ["Audit.log", "Audit.trace", "Repository.save", "Sink.flush"]);
}

#[test]
fn a_missing_compiler_means_types_are_unavailable() {
    let output = engine(Path::new("/nonexistent/tsc"), &fixtures().join("contracts/tsconfig.json"), "public-contracts", &[]);
    assert_eq!(output.status.code(), Some(TYPES_UNAVAILABLE));
    assert!(String::from_utf8_lossy(&output.stderr).starts_with("types unavailable: cannot start the TypeScript compiler"));
    assert!(output.stdout.is_empty());
}

#[cfg(unix)]
#[test]
fn another_compiler_version_means_types_are_unavailable() {
    use std::os::unix::fs::PermissionsExt;
    let folder = std::env::temp_dir().join(format!("nitpicker-engine-compiler-{}", std::process::id()));
    std::fs::create_dir_all(&folder).expect("folder");
    let fake = folder.join("tsc");
    std::fs::write(&fake, "#!/bin/sh\necho 'Version 6.0.3'\n").expect("script");
    std::fs::set_permissions(&fake, std::fs::Permissions::from_mode(0o755)).expect("mode");
    let output = engine(&fake, &fixtures().join("contracts/tsconfig.json"), "public-contracts", &[]);
    let _ = std::fs::remove_dir_all(&folder);
    assert_eq!(output.status.code(), Some(TYPES_UNAVAILABLE));
    assert!(String::from_utf8_lossy(&output.stderr).contains("TypeScript 6.0.3 is not supported"));
}

#[test]
fn a_project_that_cannot_be_loaded_means_types_are_unavailable() {
    let Some(compiler) = compiler() else { return };
    let missing = engine(&compiler, &fixtures().join("no-such-project/tsconfig.json"), "public-contracts", &[]);
    assert_eq!(missing.status.code(), Some(TYPES_UNAVAILABLE));
    let folder = std::env::temp_dir().join(format!("nitpicker-engine-broken-{}", std::process::id()));
    std::fs::create_dir_all(&folder).expect("folder");
    std::fs::write(folder.join("tsconfig.json"), "{ \"compilerOptions\": { \"target\": \"es1492\" } ").expect("config");
    let broken = engine(&compiler, &folder.join("tsconfig.json"), "public-contracts", &[]);
    let _ = std::fs::remove_dir_all(&folder);
    assert_eq!(broken.status.code(), Some(TYPES_UNAVAILABLE), "{}", String::from_utf8_lossy(&broken.stderr));
}

#[test]
fn an_unknown_check_is_a_usage_error() {
    let output = engine(Path::new("/nonexistent/tsc"), &fixtures().join("contracts/tsconfig.json"), "no-such-check", &[]);
    assert_eq!(output.status.code(), Some(2));
}
