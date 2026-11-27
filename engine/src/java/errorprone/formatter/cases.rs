//! Differential cases: format strings and argument kinds with the message Error Prone's validation gives on the JDK,
//! written by `parity/errorprone/FormatterProbe.java` on that JDK. `FORMATTER_CASES` names more, as `<file>@<major version>`
//! joined by `:`.
use super::{Arg, validate};

fn arg(token: &str) -> Arg {
    let value = || token[1..].parse().unwrap_or(3);
    match token.chars().next().unwrap_or('F') {
        'n' => Arg::Null,
        'z' => Arg::Bool,
        'b' => Arg::Byte,
        's' => Arg::Short,
        'i' => Arg::Int(if token.len() > 1 { value() } else { 3 }),
        'l' => Arg::Long,
        'c' => Arg::Char,
        'f' => Arg::Float,
        'd' => Arg::Double,
        'S' => Arg::Str,
        'D' => Arg::BigDecimal,
        'I' => Arg::BigInteger,
        'T' => Arg::Date,
        'C' => Arg::Calendar,
        'N' => Arg::Instant,
        'Z' => Arg::Zoned,
        _ => Arg::Formattable,
    }
}

fn flush(units: &mut Vec<u16>, out: &mut String) {
    out.extend(char::decode_utf16(units.drain(..)).map(|decoded| decoded.unwrap_or('?')));
}

fn unescape(text: &str) -> String {
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

fn differences(cases: &str, jdk: u32) -> (usize, Vec<String>) {
    let mut wrong = Vec::new();
    let mut count = 0;
    for line in cases.lines().filter(|line| !line.is_empty()) {
        let parts: Vec<&str> = line.split('\t').collect();
        let args: Vec<Arg> = parts[1].split(',').filter(|token| !token.is_empty()).map(arg).collect();
        let expected = unescape(parts.get(2).copied().unwrap_or_default());
        if expected.starts_with("crash: ") {
            continue;
        }
        count += 1;
        let got = validate(&unescape(parts[0]), &args, jdk).unwrap_or_default();
        if got != expected {
            wrong.push(format!("{line}\n    engine: {got}"));
        }
    }
    (count, wrong)
}

#[test]
fn formatter_matches_the_jdk() {
    let root = env!("CARGO_MANIFEST_DIR");
    let mut files = vec![format!("{root}/tests/expected/formatter-cases-21.tsv@21"), format!("{root}/tests/expected/formatter-cases-25.tsv@25")];
    files.extend(std::env::var("FORMATTER_CASES").unwrap_or_default().split(':').filter(|path| !path.is_empty()).map(String::from));
    for entry in files {
        let (file, jdk) = entry.rsplit_once('@').expect("<file>@<jdk major version>");
        let (count, wrong) = differences(&std::fs::read_to_string(file).expect("case file"), jdk.parse().expect("jdk"));
        assert!(wrong.is_empty(), "{file}: {} of {count} differ\n{}", wrong.len(), wrong.iter().take(40).cloned().collect::<Vec<_>>().join("\n"));
    }
}

#[test]
fn general_format_of_powers_of_two_matches_the_jdk() {
    let expected = std::fs::read_to_string(format!("{}/tests/expected/formatter-powers-of-two.tsv", env!("CARGO_MANIFEST_DIR")))
        .expect("case file");
    for line in expected.lines() {
        let (power, text) = line.split_once('\t').expect("power and text");
        assert_eq!(super::float::general_two_digits(power.parse().expect("power")), text, "2^{power}");
    }
}
