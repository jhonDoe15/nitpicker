//! Runs `_JavacNames` on small Java fixtures and compares the names with the ones javac 21 wrote into the class
//! files of the same sources: anonymous and local classes, the hidden methods of lambdas and the parameters the
//! compiler adds to them. `parity/javac/run.sh` writes the expected rows.
use std::path::Path;
use std::process::Command;

/// Source file, kind, first line, last line, name.
type Expected = (String, String, u64, u64, String);

struct Found {
    file: String,
    rule: String,
    first: u64,
    last: u64,
    name: String,
    used: bool,
}

fn found_in(case: &Path, name: &str) -> Vec<Found> {
    let out = std::env::temp_dir().join(format!("nitpicker-engine-javac-{name}-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).arg(case).args(["--rules", "_JavacNames", "--out"]).arg(&out).status().expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", case.display());
    let text = |finding: &serde_json::Value, key: &str| finding[key].as_str().expect("text").to_string();
    let number = |finding: &serde_json::Value, key: &str| finding[key].as_u64().expect("number");
    report["findings"]
        .as_array()
        .expect("findings")
        .iter()
        .map(|finding| {
            let file = text(finding, "file");
            let file = format!("{name}/{}", file.strip_prefix(&prefix).unwrap_or(&file));
            Found { file, rule: text(finding, "rule"), first: number(finding, "line"), last: number(finding, "column"), name: text(finding, "message"), used: false }
        })
        .collect()
}

/// A serializable lambda's name carries a hash of its shape between the method name and the counter.
fn hashed(name: &str) -> bool {
    let method = name.split('(').next().unwrap_or(name).rsplit('.').next().unwrap_or(name);
    let parts: Vec<&str> = method.split('$').collect();
    parts.len() == 4 && parts[2].len() >= 6 && parts[2].chars().all(|c| c.is_ascii_hexdigit())
}

/// How the engine's row for an expected one reads: the name itself, or for a lambda the compiler made from a
/// method reference the name without parameters, or for a serializable lambda only its class.
fn matches(found: &Found, expected: &Expected) -> bool {
    let (file, kind, first, last, name) = expected;
    if &found.file != file || found.used || found.first > *first || found.last < *last {
        return false;
    }
    let bare = name.split('(').next().unwrap_or(name);
    match found.rule.as_str() {
        "reference" => kind == "lambda" && found.name == bare,
        "serializable" => kind == "lambda" && hashed(name) && bare.rsplit_once('.').is_some_and(|(owner, _)| owner == found.name),
        rule => rule == kind && &found.name == name,
    }
}

#[test]
fn names_are_the_ones_javac_makes() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let expected: Vec<Expected> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("javac.json")).expect("expected")).expect("rows");
    let mut found = Vec::new();
    for case in std::fs::read_dir(root.join("fixtures").join("javac")).expect("fixtures") {
        let case = case.expect("entry").path();
        let name = case.file_name().and_then(|name| name.to_str()).expect("name").to_string();
        found.extend(found_in(&case, &name));
    }
    let mut missed = Vec::new();
    for row in &expected {
        match found.iter_mut().find(|candidate| matches(candidate, row)) {
            Some(same) => same.used = true,
            None => missed.push(row),
        }
    }
    let extra: Vec<(&String, u64, &String)> = found.iter().filter(|row| !row.used).map(|row| (&row.file, row.first, &row.name)).collect();
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:?}, extra {extra:?}");
    assert!(expected.len() > 300);
}
