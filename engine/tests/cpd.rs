//! Runs `cpd` on each fixture folder in `tests/fixtures/` and compares every token (image, start, end) and every
//! duplication with what PMD 7.16.0 gave through nitpicker's `CpdReport` (100 tokens, identifiers and literals
//! anonymized). `parity/cpd/` holds the scripts that wrote `tests/expected/<fixture>.txt` and `<fixture>-tokens.txt`.
use std::path::Path;
use std::process::Command;

fn attribute<'a>(element: &'a str, name: &str) -> &'a str {
    let start = element.find(&format!(" {name}=\"")).expect("attribute") + name.len() + 3;
    &element[start..start + element[start..].find('"').expect("closing quote")]
}

fn summary(xml: &str, prefix: &str) -> String {
    let mut out = String::new();
    let mut in_duplication = false;
    for line in xml.lines().map(str::trim) {
        if line.starts_with("<duplication ") {
            in_duplication = true;
            out.push_str(&format!("duplication lines={} tokens={}\n", attribute(line, "lines"), attribute(line, "tokens")));
        } else if line.starts_with("</duplication>") {
            in_duplication = false;
        } else if line.starts_with("<file ") {
            let path = attribute(line, "path").replace(prefix, "");
            if in_duplication {
                let at = |name: &str| attribute(line, name).to_string();
                out.push_str(&format!(
                    "  {path} {}:{}-{}:{} tokens {}-{}\n",
                    at("line"), at("column"), at("endline"), at("endcolumn"), at("begintoken"), at("endtoken")
                ));
            } else {
                out.push_str(&format!("file {path} {}\n", attribute(line, "totalNumberOfTokens")));
            }
        }
    }
    out
}

fn compare(fixture: &str) {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let fixtures = root.join("fixtures").join(fixture);
    let report = std::env::temp_dir().join(format!("nitpicker-engine-{fixture}-{}.xml", std::process::id()));
    let tokens = std::env::temp_dir().join(format!("nitpicker-engine-{fixture}-{}.txt", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .env("NP_CPD_TOKENS", &tokens)
        .args(["cpd", "--report"])
        .arg(&report)
        .arg(&fixtures)
        .status()
        .expect("engine runs");
    assert!(status.success());
    let prefix = format!("{}/", fixtures.display());
    let found = summary(&std::fs::read_to_string(&report).expect("report"), &prefix);
    let found_tokens = std::fs::read_to_string(&tokens).expect("tokens").replace(&prefix, "");
    let _ = std::fs::remove_file(&report);
    let _ = std::fs::remove_file(&tokens);
    let expected_tokens = std::fs::read_to_string(root.join("expected").join(format!("{fixture}-tokens.txt"))).expect("expected");
    assert_eq!(found_tokens, expected_tokens);
    assert_eq!(found, std::fs::read_to_string(root.join("expected").join(format!("{fixture}.txt"))).expect("expected"));
}

#[test]
fn cpd_finds_what_pmd_cpd_finds() {
    compare("cpd");
}

/// PMD keeps one constructor detector for the whole run: `Open.java` leaves `class A {` open, so `A(` in
/// `Then.java` keeps its name as a constructor call and the two copies of the method differ.
#[test]
fn a_type_left_open_reaches_the_next_file() {
    compare("cpd-open");
}
