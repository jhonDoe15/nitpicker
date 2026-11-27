//! Differential cases: patterns and flags with the message `Pattern.compile` throws on the JDK, written by
//! `parity/errorprone/RegexProbe.java` on that JDK. `REGEX_CASES` names more, as `<file>@<major version>` joined by `:`.
use super::syntax_error;

fn flush(units: &mut Vec<u16>, out: &mut String) {
    out.extend(char::decode_utf16(units.drain(..)).map(|decoded| decoded.unwrap_or('\u{fffd}')));
}

pub fn unescape(text: &str) -> String {
    let mut units = Vec::new();
    let mut out = String::new();
    let mut chars = text.chars();
    while let Some(c) = chars.next() {
        if c != '\\' || chars.clone().next() != Some('u') {
            flush(&mut units, &mut out);
        }
        if c != '\\' {
            out.push(c);
            continue;
        }
        match chars.next() {
            Some('t') => out.push('\t'),
            Some('n') => out.push('\n'),
            Some('u') => units.push(u16::from_str_radix(&chars.by_ref().take(4).collect::<String>(), 16).unwrap_or(63)),
            Some(other) => out.push(other),
            None => {}
        }
    }
    flush(&mut units, &mut out);
    out
}

pub fn differences(cases: &str, jdk: u32) -> (usize, Vec<String>) {
    let mut wrong = Vec::new();
    let mut count = 0;
    for line in cases.lines().filter(|line| !line.is_empty()) {
        let parts: Vec<&str> = line.split('\t').collect();
        let expected = unescape(parts.get(2).copied().unwrap_or_default());
        if expected.starts_with("crash: ") || expected.starts_with("skip: ") {
            continue;
        }
        count += 1;
        let flags = parts.get(1).and_then(|flags| flags.parse().ok()).unwrap_or(0);
        let got = syntax_error(&unescape(parts[0]), flags, jdk).unwrap_or_default();
        if got != expected {
            wrong.push(format!("{line}\n    engine: {}", got.replace('\n', "\\n")));
        }
    }
    (count, wrong)
}

#[test]
fn regex_syntax_matches_the_jdk() {
    let root = env!("CARGO_MANIFEST_DIR");
    let mut files = vec![format!("{root}/tests/expected/regex-cases-21.tsv@21"), format!("{root}/tests/expected/regex-cases-25.tsv@25")];
    files.extend(std::env::var("REGEX_CASES").unwrap_or_default().split(':').filter(|path| !path.is_empty()).map(String::from));
    for entry in files {
        let (file, jdk) = entry.rsplit_once('@').expect("<file>@<jdk major version>");
        let (count, wrong) = differences(&std::fs::read_to_string(file).expect("case file"), jdk.parse().expect("jdk"));
        assert!(wrong.is_empty(), "{file}: {} of {count} differ\n{}", wrong.len(), wrong.iter().take(40).cloned().collect::<Vec<_>>().join("\n"));
    }
}
