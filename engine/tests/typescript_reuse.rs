//! Runs the engine on TypeScript fixtures and compares the definitions, imports, exports and near-duplicate units it reads with what
//! the Node analyzer read from the same files. Half surrogate pairs are compared as written: JSON readers reject them. The expected file comes from `parity/typescript-reuse-expected.mts`.
use std::path::Path;
use std::process::Command;

#[test]
fn reuse_facts_match_the_node_analyzer() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let fixtures = root.join("fixtures").join("typescript-reuse");
    let mut names: Vec<String> =
        std::fs::read_dir(&fixtures).expect("fixtures").map(|entry| entry.expect("entry").file_name().to_string_lossy().into_owned()).collect();
    names.sort();
    let list = std::env::temp_dir().join(format!("nitpicker-engine-reuse-{}.tsv", std::process::id()));
    let out = std::env::temp_dir().join(format!("nitpicker-engine-reuse-{}.jsonl", std::process::id()));
    let lines: Vec<String> = names.iter().map(|name| format!("{}\t{name}", fixtures.join(name).display())).collect();
    std::fs::write(&list, lines.join("\n")).expect("list");
    let status =
        Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).arg("typescript-reuse").arg("--files").arg(&list).arg("--out").arg(&out).status().expect("engine runs");
    assert!(status.success());
    let read = |path: &Path| -> Vec<serde_json::Value> {
        std::fs::read_to_string(path).expect("report").replace("\\\\", "<backslash>").replace("\\ud", "<half>").lines().map(|line| serde_json::from_str(line).expect("json")).collect()
    };
    let found = read(&out);
    let expected = read(&root.join("expected").join("typescript-reuse.jsonl"));
    let _ = std::fs::remove_file(&list);
    let _ = std::fs::remove_file(&out);
    assert_eq!(found.len(), expected.len());
    for (found, expected) in found.iter().zip(&expected) {
        for key in ["definitions", "imports", "dynamicImports", "exports", "jsxTags", "nearDuplicateUnits"] {
            assert_eq!(found[key], expected[key], "{key} of {} differ", expected["path"]);
        }
    }
    let definitions: usize = expected.iter().map(|file| file["definitions"].as_array().map_or(0, Vec::len)).sum();
    assert!(definitions > 30);
    let units: usize = expected.iter().map(|file| file["nearDuplicateUnits"].as_array().map_or(0, Vec::len)).sum();
    assert!(units > 30);
}

#[test]
fn files_the_engine_cannot_read_like_the_compiler_are_marked() {
    let folder = std::env::temp_dir().join(format!("nitpicker-engine-unparsed-{}", std::process::id()));
    std::fs::create_dir_all(&folder).expect("folder");
    let sources = [("broken.ts", "function a() { return 1 }\nlet x = ;\n"), ("html.js", "function f(r) { var q = 1 <!-- note\n return r.test(q) }\n"), ("fine.js", "function g() { return 1 }\n")];
    let mut lines = Vec::new();
    for (name, text) in sources {
        std::fs::write(folder.join(name), text).expect("source");
        lines.push(format!("{}\t{name}", folder.join(name).display()));
    }
    let list = folder.join("list.tsv");
    std::fs::write(&list, lines.join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).arg("typescript-reuse").arg("--files").arg(&list).output().expect("engine runs");
    let _ = std::fs::remove_dir_all(&folder);
    let facts: Vec<serde_json::Value> = String::from_utf8_lossy(&output.stdout).lines().map(|line| serde_json::from_str(line).expect("json")).collect();
    let marked: Vec<bool> = facts.iter().map(|file| file["unparsed"].is_string()).collect();
    assert_eq!(marked, [true, true, false]);
    assert_eq!(facts[2]["definitions"].as_array().map(Vec::len), Some(1));
}
