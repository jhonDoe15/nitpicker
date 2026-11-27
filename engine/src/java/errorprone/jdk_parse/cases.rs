//! Differential cases: a parser, a text and the exception the JDK throws (`Class: message`, empty when it parses), written
//! by `parity/errorprone/AlwaysThrowsProbe.java` on that JDK. `JDK_PARSE_CASES` names more, as `<file>@<major version>`
//! joined by `:`.
use super::failure;

fn unescape(text: &str) -> String {
    let mut units: Vec<u16> = Vec::new();
    let mut chars = text.chars();
    while let Some(c) = chars.next() {
        if c != '\\' {
            let mut buffer = [0u16; 2];
            units.extend_from_slice(c.encode_utf16(&mut buffer));
            continue;
        }
        match chars.next() {
            Some('t') => units.push(9),
            Some('n') => units.push(10),
            Some('u') => units.push(u16::from_str_radix(&chars.by_ref().take(4).collect::<String>(), 16).unwrap_or(63)),
            Some(other) => units.push(other as u16),
            None => {}
        }
    }
    String::from_utf16_lossy(&units)
}

/// `Parsed.toString` lists the fields in hash order of identity hash codes, which depends on the JVM run: compare them
/// as a set.
fn unordered(message: &str) -> String {
    let Some((head, rest)) = message.split_once("TemporalAccessor: {") else { return message.to_string() };
    let Some((fields, tail)) = rest.split_once('}') else { return message.to_string() };
    let mut sorted: Vec<&str> = fields.split(", ").collect();
    sorted.sort_unstable();
    format!("{head}TemporalAccessor: {{{}}}{tail}", sorted.join(", "))
}

fn differences(cases: &str, jdk: u32) -> (usize, Vec<String>) {
    let mut wrong = Vec::new();
    let mut count = 0;
    for line in cases.lines().filter(|line| !line.is_empty()) {
        let parts: Vec<&str> = line.split('\t').collect();
        let expected = unordered(&unescape(parts.get(2).copied().unwrap_or_default()));
        if expected.contains("Unable to obtain ZonedDateTime") {
            continue;
        }
        count += 1;
        let got = unordered(&failure(parts[0], &unescape(parts[1]), jdk).unwrap_or_default());
        if got != expected {
            wrong.push(format!("{line}\n    engine: {got}"));
        }
    }
    (count, wrong)
}

#[test]
fn jdk_parsers_match_the_jdk() {
    let root = env!("CARGO_MANIFEST_DIR");
    let mut files: Vec<String> = [21, 24, 27].iter().map(|jdk| format!("{root}/tests/expected/jdk-parse-cases-{jdk}.tsv@{jdk}")).collect();
    files.extend(std::env::var("JDK_PARSE_CASES").unwrap_or_default().split(':').filter(|path| !path.is_empty()).map(String::from));
    for entry in files {
        let (file, jdk) = entry.rsplit_once('@').expect("<file>@<jdk major version>");
        let (count, wrong) = differences(&std::fs::read_to_string(file).expect("case file"), jdk.parse().expect("jdk"));
        assert!(wrong.is_empty(), "{file}: {} of {count} differ\n{}", wrong.len(), wrong.iter().take(40).cloned().collect::<Vec<_>>().join("\n"));
    }
}
