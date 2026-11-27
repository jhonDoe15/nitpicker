//! The matcher against what Node's `RegExp.prototype.test` answers for generated patterns, flags and inputs.
use super::JsRegex;
use std::path::PathBuf;

#[derive(serde::Deserialize)]
struct Cases {
    inputs: Vec<Vec<u16>>,
    cases: Vec<(String, String, String)>,
}

#[test]
fn matches_what_node_matches() {
    let fixture = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests").join("fixtures").join("js-regex").join("cases.json");
    let path = std::env::var("JS_REGEX_CASES").map(PathBuf::from).unwrap_or(fixture);
    let cases: Cases = serde_json::from_str(&std::fs::read_to_string(path).expect("cases")).expect("json");
    let mut wrong = Vec::new();
    let mut uncovered = 0;
    for (pattern, flags, expected) in &cases.cases {
        let Some(regex) = JsRegex::new(pattern, flags) else {
            uncovered += 1;
            continue;
        };
        for (input, want) in cases.inputs.iter().zip(expected.chars().map(|bit| bit == '1')) {
            if regex.test(input) != Some(want) {
                wrong.push(format!("/{pattern}/{flags} on {:?}: node {want}", String::from_utf16_lossy(input)));
            }
        }
    }
    eprintln!("{} cases, {uncovered} uncovered", cases.cases.len());
    assert!(wrong.is_empty(), "{} wrong, {uncovered} uncovered:\n{}", wrong.len(), wrong[..wrong.len().min(std::env::var("JS_REGEX_SHOW").ok().and_then(|n| n.parse().ok()).unwrap_or(40))].join("\n"));
    assert!(uncovered * 50 <= cases.cases.len(), "{uncovered} uncovered");
}
