//! The messages of the Error Prone checks, with Error Prone's "Did you mean" sentence, are the ones Error Prone writes.
use std::collections::BTreeMap;
use std::path::Path;
use std::process::Command;

type Row = (String, String, u64, u64, String);

fn counted(rows: impl IntoIterator<Item = Row>) -> BTreeMap<Row, usize> {
    let mut counts = BTreeMap::new();
    for row in rows {
        *counts.entry(row).or_default() += 1;
    }
    counts
}

/// The first line of the message and Error Prone's "Did you mean" sentence, the parts a Java run shows.
fn shown(message: &str) -> String {
    let first = message.lines().next().unwrap_or_default();
    unordered_fields(message.find("\n  Did you mean ").map_or(first.to_string(), |at| format!("{first}{}", &message[at..])))
}

/// The JDK prints the fields of a `java.time.format.Parsed` from a `HashMap` keyed by `ChronoField`, whose order changes between JVM runs.
fn unordered_fields(message: String) -> String {
    let marker = "TemporalAccessor: {";
    let Some(start) = message.find(marker).map(|at| at + marker.len()) else { return message };
    let Some(length) = message[start..].find('}') else { return message };
    let mut fields: Vec<&str> = message[start..start + length].split(", ").collect();
    fields.sort_unstable();
    format!("{}{}{}", &message[..start], fields.join(", "), &message[start + length..])
}

#[test]
fn error_prone_messages_and_suggestions_match_error_prone() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let source = root.join("fixtures").join("errorprone");
    let out = std::env::temp_dir().join(format!("nitpicker-engine-errorprone-messages-{}.json", std::process::id()));
    let status = Command::new(env!("CARGO_BIN_EXE_nitpicker-engine"))
        .arg(&source)
        .args(["--rules", "_ErrorProne", "--out"])
        .arg(&out)
        .status()
        .expect("engine runs");
    assert!(status.success());
    let report: serde_json::Value = serde_json::from_str(&std::fs::read_to_string(&out).expect("report")).expect("json");
    let _ = std::fs::remove_file(&out);
    let prefix = format!("{}/", source.display());
    let found = counted(report["findings"].as_array().expect("findings").iter().filter(|finding| finding["rule"] != "NullAway" && finding["rule"] != "_HandBack").map(|finding| {
        let file = finding["file"].as_str().expect("file");
        (
            file.strip_prefix(&prefix).unwrap_or(file).to_string(),
            finding["rule"].as_str().expect("rule").to_string(),
            finding["line"].as_u64().expect("line"),
            finding["column"].as_u64().expect("column"),
            shown(finding["message"].as_str().expect("message")),
        )
    }));
    let listed = std::fs::read_to_string(root.join("expected").join("errorprone-messages.json")).expect("expected");
    let rows = serde_json::from_str::<Vec<Row>>(&listed).expect("rows");
    let expected = counted(rows.into_iter().map(|(file, rule, line, column, message)| (file, rule, line, column, unordered_fields(message))));
    let missed: Vec<&Row> = expected.iter().filter(|(row, count)| found.get(*row).unwrap_or(&0) < count).map(|(row, _)| row).collect();
    let extra: Vec<&Row> = found.iter().filter(|(row, count)| expected.get(*row).unwrap_or(&0) < count).map(|(row, _)| row).collect();
    assert!(missed.is_empty() && extra.is_empty(), "missed {missed:#?}, extra {extra:#?}");
}
