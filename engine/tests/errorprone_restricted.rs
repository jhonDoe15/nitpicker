//! RestrictedApi reads `@RestrictedApi` from class files, and leaves a file to Error Prone where the engine cannot tell.
use std::path::Path;
use std::process::Command;

type Row = (String, String, u64, u64, String);

/// A library compiled with javac; the uses compile against its class files. Error Prone reports nothing in
/// `lookahead/Ahead.java`, whose path a look-ahead pattern allows: the engine does not match such patterns and hands
/// the file back.
#[test]
fn restricted_api_reads_class_files_and_hands_back_what_it_cannot_tell() {
    let base = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join("errorprone-restricted");
    let classes = std::env::temp_dir().join(format!("nitpicker-engine-restricted-classes-{}", std::process::id()));
    let mut library = Vec::new();
    let mut pending = vec![base.join("library")];
    while let Some(folder) = pending.pop() {
        for entry in std::fs::read_dir(folder).expect("library").flatten() {
            let path = entry.path();
            if path.is_dir() { pending.push(path) } else { library.push(path) }
        }
    }
    let javac = Path::new(&std::env::var("JAVA_HOME").expect("JAVA_HOME")).join("bin").join("javac");
    assert!(Command::new(javac).arg("-d").arg(&classes).args(&library).env_remove("JAVA_TOOL_OPTIONS").status().expect("javac runs").success());
    let sources = base.join("sources");
    let out = std::env::temp_dir().join(format!("nitpicker-engine-restricted-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&sources)
        .args(["--rules", "_ErrorProne", "--classpath"])
        .arg(&classes)
        .arg("--out")
        .arg(&out)
        .env("NP_EP_ONLY", "RestrictedApi")
        .status()
        .expect("engine runs");
    let _ = std::fs::remove_dir_all(&classes);
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", sources.display());
    let mut found: Vec<Row> = report["findings"]
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
                finding["message"].as_str().expect("message").lines().next().unwrap_or_default().to_string(),
            )
        })
        .collect();
    found.sort();
    let listed = std::fs::read_to_string(Path::new(env!("CARGO_MANIFEST_DIR")).join("tests").join("expected").join("errorprone-restricted.json")).expect("expected");
    let mut expected: Vec<Row> = serde_json::from_str(&listed).expect("rows");
    expected.sort();
    assert_eq!(found, expected);
}
