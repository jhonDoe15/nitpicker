//! The preconditions that decide which files a Java run still hands to Error Prone for checks the engine lacks.
use std::path::Path;
use std::process::Command;

fn may_report(case: &str, files: &[(&str, String)], checks: &str) -> Vec<(String, String)> {
    let dir = std::env::temp_dir().join(format!("nitpicker-engine-may-report-{}-{case}", std::process::id()));
    std::fs::create_dir_all(&dir).expect("folder");
    for (name, text) in files {
        std::fs::write(dir.join(name), text).expect("source");
    }
    let out = dir.join("out.json");
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&dir)
        .args(["--rules", "_ErrorProne", "--out"])
        .arg(&out)
        .env("NP_EP_MAY_REPORT", checks)
        .status()
        .expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_dir_all(&dir);
    let mut rows: Vec<(String, String)> = report["findings"]
        .as_array()
        .expect("findings")
        .iter()
        .filter(|finding| finding["rule"] == "_MayReport")
        .map(|finding| {
            let file = Path::new(finding["file"].as_str().expect("file")).file_name().expect("name").to_string_lossy().into_owned();
            (file, finding["message"].as_str().expect("message").to_string())
        })
        .collect();
    rows.sort();
    rows
}

fn row(file: &str, checks: &str) -> (String, String) {
    (file.to_string(), checks.to_string())
}

#[test]
fn deeply_nested_needs_a_deep_tree() {
    let chain = format!("class Deep {{ Object f(StringBuilder b) {{ return b{}; }} }}\n", ".append(1)".repeat(400));
    let files = [
        ("Deep.java", chain),
        ("Flat.java", "class Flat { int f(int x) { return x + 1; } }\n".to_string()),
        ("Broken.java", "class Broken { int f( { }\n".to_string()),
    ];
    assert_eq!(
        may_report("deep", &files, "DeeplyNested"),
        vec![row("Broken.java", "DeeplyNested"), row("Deep.java", "DeeplyNested"), row("Flat.java", "")]
    );
}
