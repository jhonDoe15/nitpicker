//! The URL, header, file path, secret, escaping, wildcard, response, hash, deserialization, redirect, encoding,
//! selector, HTML, TLS, request-input, SQL, timeout, existence-check and route-auth rules on the engine against what
//! their ESLint-plugin rules report for the same files, with the rule options of each variant in `settings.tsv` for the
//! option fixtures. The expected rows come from `parity/typescript-lint-expected.mts <list> <out> <rules>`.
use std::path::Path;
use std::process::Command;

type Row = Vec<serde_json::Value>;

const RULES: [&str; 32] = [
    "no-btoa-on-runtime-text",
    "no-case-mixed-header-merge",
    "no-case-sensitive-path-compare",
    "no-directory-passing-existence-check",
    "no-disabled-tls-verification",
    "no-double-decode",
    "no-dynamic-import-of-path",
    "no-error-response-without-status",
    "no-hardcoded-secret",
    "no-incomplete-escaping",
    "no-lossy-utf8-decode",
    "no-non-latin1-header-value",
    "no-raw-http-value",
    "no-secret-in-log",
    "no-send-without-return",
    "no-slash-only-redirect-guard",
    "no-sql-string-building",
    "no-unchecked-response-json",
    "no-unchecked-url-sink",
    "no-uncoerced-request-input",
    "no-unencoded-url-part",
    "no-unescaped-css-selector",
    "no-unescaped-filter-value",
    "no-unescaped-html-interpolation",
    "no-unescaped-pattern-translation",
    "no-unresolved-relative-url",
    "no-unsafe-deserialization",
    "no-unstripped-remote-text",
    "no-untrimmed-request-text",
    "no-weak-hash",
    "require-client-timeout",
    "require-http-timeout",
];

const OPTION_RULES: [&str; 3] = ["no-route-without-auth", "no-sql-string-building", "require-http-timeout"];

fn sorted(mut rows: Vec<Row>) -> Vec<Row> {
    rows.sort_by_key(|row| serde_json::to_string(row).expect("text"));
    rows
}

fn listed(fixtures: &Path) -> Vec<String> {
    let mut lines = Vec::new();
    for rule in RULES {
        let mut names: Vec<String> =
            std::fs::read_dir(fixtures.join(rule)).expect("rule fixtures").map(|entry| entry.expect("entry").file_name().to_string_lossy().into_owned()).collect();
        names.sort();
        lines.extend(names.iter().map(|name| format!("{}\t{rule}/{name}", fixtures.join(rule).join(name).display())));
    }
    lines
}

#[test]
fn web_rules_report_what_the_eslint_rules_report() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let fixtures = root.join("fixtures").join("typescript-web-rules");
    let list = std::env::temp_dir().join(format!("nitpicker-engine-web-rules-{}.tsv", std::process::id()));
    std::fs::write(&list, listed(&fixtures).join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).args(["typescript-lint", "--rules", &RULES.join(","), "--files"]).arg(&list).output().expect("engine runs");
    let _ = std::fs::remove_file(&list);
    assert!(output.status.success());
    let found: Vec<Row> = serde_json::from_slice(&output.stdout).expect("json");
    let expected: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("typescript-web-rules.json")).expect("expected")).expect("json");
    let reporting: std::collections::BTreeSet<String> = expected.iter().filter_map(|row| row[1].as_str()).map(str::to_string).collect();
    assert_eq!(sorted(found), sorted(expected));
    assert_eq!(reporting.len(), RULES.len(), "every rule reports in the fixtures");
}

fn engine_rows(list_lines: &[String], rules: &str) -> Vec<Row> {
    let list = std::env::temp_dir().join(format!("nitpicker-engine-web-options-{rules}-{}.tsv", std::process::id()));
    std::fs::write(&list, list_lines.join("\n")).expect("list");
    let output = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine")).args(["typescript-lint", "--rules", rules, "--files"]).arg(&list).output().expect("engine runs");
    let _ = std::fs::remove_file(&list);
    assert!(output.status.success());
    serde_json::from_slice(&output.stdout).expect("json")
}

#[test]
fn web_rule_options_report_what_the_eslint_rules_report() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let fixtures = root.join("fixtures").join("typescript-web-rule-options");
    let variants = std::fs::read_to_string(fixtures.join("settings.tsv")).expect("settings");
    let mut found = Vec::new();
    for rule in OPTION_RULES {
        let mut lines = Vec::new();
        for line in variants.lines().filter(|line| line.starts_with(&format!("{rule}/"))) {
            let mut fields = line.split('\t');
            let variant = fields.next().expect("variant");
            let settings: Vec<&str> = fields.skip(1).collect();
            let mut names: Vec<String> =
                std::fs::read_dir(fixtures.join(variant)).expect("variant fixtures").map(|entry| entry.expect("entry").file_name().to_string_lossy().into_owned()).collect();
            names.sort();
            for name in names {
                let path = fixtures.join(variant).join(&name);
                lines.push(std::iter::once(format!("{}\t{variant}/{name}", path.display())).chain(settings.iter().map(|setting| setting.to_string())).collect::<Vec<_>>().join("\t"));
            }
        }
        found.extend(engine_rows(&lines, rule));
    }
    let expected: Vec<Row> = serde_json::from_str(&std::fs::read_to_string(root.join("expected").join("typescript-web-rule-options.json")).expect("expected")).expect("json");
    let reporting: std::collections::BTreeSet<String> = expected.iter().filter_map(|row| row[1].as_str()).map(str::to_string).collect();
    assert_eq!(sorted(found), sorted(expected));
    assert_eq!(reporting.len(), OPTION_RULES.len(), "every option rule reports in the fixtures");
}
