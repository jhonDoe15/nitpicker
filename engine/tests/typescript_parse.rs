//! Which files the engine's TypeScript lint leaves to ESLint as `!parse`: those typescript-estree refuses, listed by
//! `parity/typescript-parse-expected.mts` over the same cases, and the few `stricter.txt` holds, which it parses but
//! where ESLint's scope manager binds a name otherwise than oxc does, or oxc reads `await` as a name.
use std::path::{Path, PathBuf};
use std::process::Command;

type Row = Vec<serde_json::Value>;

fn lint(directory: &Path, files: &[(String, String)], rules: &str) -> Vec<Row> {
    std::fs::create_dir_all(directory).expect("directory");
    let lines: Vec<String> = files
        .iter()
        .map(|(name, text)| {
            std::fs::write(directory.join(name), text).expect("file");
            format!("{}\t{name}", directory.join(name).display())
        })
        .collect();
    let list = directory.join("list.tsv");
    std::fs::write(&list, lines.join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).args(["typescript-lint", "--rules", rules, "--files"]).arg(&list).output().expect("engine runs");
    let _ = std::fs::remove_dir_all(directory);
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    serde_json::from_slice(&output.stdout).expect("json")
}

fn scratch(name: &str) -> PathBuf {
    std::env::temp_dir().join(format!("nitpicker-engine-{name}-{}", std::process::id()))
}

fn cases(name: &str) -> Vec<(String, String)> {
    let path = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join("typescript-parse").join(name);
    let written = std::fs::read_to_string(path).expect("cases");
    written
        .split("=== ")
        .skip(1)
        .map(|case| {
            let (name, text) = case.split_once('\n').expect("case name");
            (name.to_string(), text.to_string())
        })
        .collect()
}

fn unparsed(name: &str) -> Vec<String> {
    let files = cases(name);
    let found = lint(&scratch(name.trim_end_matches(".txt")), &files, "no-weak-hash");
    files.into_iter().map(|(name, _)| name).filter(|name| found.iter().any(|row| row[0] == name.as_str() && row[1] == "!parse")).collect()
}

#[test]
fn files_are_unparsed_exactly_when_typescript_estree_refuses_them() {
    let expected = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("expected").join("typescript-parse.json");
    let expected: Vec<String> = serde_json::from_str(&std::fs::read_to_string(expected).expect("expected")).expect("json");
    assert_eq!(unparsed("cases.txt"), expected);
}

#[test]
fn files_read_otherwise_than_eslint_reads_them_stay_unparsed() {
    let names: Vec<String> = cases("stricter.txt").into_iter().map(|(name, _)| name).collect();
    assert_eq!(unparsed("stricter.txt"), names);
}

#[test]
fn a_deeply_nested_file_leaves_the_other_files_their_findings() {
    let blocks = format!("{}{}", "{".repeat(6000), "}".repeat(6000));
    let callbacks = format!("f({}1{});", "() => f(".repeat(1500), ")".repeat(1500));
    let hashed = "import { createHash } from 'node:crypto';\ncreateHash('md5');\n".to_string();
    let files = [("a.ts".to_string(), blocks.clone()), ("b.ts".to_string(), blocks), ("c.ts".to_string(), callbacks), ("d.ts".to_string(), hashed)];
    let found = lint(&scratch("nested"), &files, "no-unpaged-listing,no-weak-hash");
    let reported: Vec<(&str, &str)> = found.iter().map(|row| (row[0].as_str().expect("file"), row[1].as_str().expect("rule"))).collect();
    assert_eq!(reported, [("d.ts", "nitpicker/no-weak-hash")]);
}
