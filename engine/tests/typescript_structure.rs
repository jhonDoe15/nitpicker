//! Runs the engine on TypeScript fixtures and compares the structure facts with what the Node analyzer
//! reported for the same files. The expected file comes from `parity/typescript-structure-expected.mts`.
use std::path::Path;
use std::process::Command;

#[test]
fn metrics_match_the_node_analyzer() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let fixtures = root.join("fixtures").join("typescript-structure");
    let mut names: Vec<String> =
        std::fs::read_dir(&fixtures).expect("fixtures").map(|entry| entry.expect("entry").file_name().to_string_lossy().into_owned()).collect();
    names.sort();
    let list = std::env::temp_dir().join(format!("nitpicker-engine-ts-{}.tsv", std::process::id()));
    let out = std::env::temp_dir().join(format!("nitpicker-engine-ts-{}.json", std::process::id()));
    let lines: Vec<String> = names.iter().map(|name| format!("{}\t{name}", fixtures.join(name).display())).collect();
    std::fs::write(&list, lines.join("\n")).expect("list");
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg("typescript-structure")
        .arg("--files")
        .arg(&list)
        .arg("--out")
        .arg(&out)
        .status()
        .expect("engine runs");
    assert!(status.success());
    let found: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let expected: serde_json::Value =
        serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("typescript-structure.json")).expect("expected")).expect("json");
    let _ = std::fs::remove_file(&list);
    let _ = std::fs::remove_file(&out);
    for key in ["summary", "functions", "classes", "unparsed"] {
        assert_eq!(found[key], expected[key], "{key} differ");
    }
    assert!(expected["functions"].as_array().is_some_and(|functions| functions.len() > 50));
}
