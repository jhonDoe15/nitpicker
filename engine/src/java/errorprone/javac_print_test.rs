//! Compares `printed` with what `parity/errorprone/PrettyDump.java` printed for every call argument of
//! `tests/fixtures/javacprint`, stored in `tests/expected/javac-print.jsonl`. `NP_JAVAC_PRINT=<dump of any code base>`
//! compares that dump instead; its paths must be absolute.
use super::printed;
use crate::engine::source::SourceFile;
use std::path::Path;

fn parse(path: &Path) -> Option<SourceFile> {
    let text = String::from_utf8(std::fs::read(path).ok()?).ok()?;
    let mut parser = tree_sitter::Parser::new();
    parser.set_language(&tree_sitter_java::LANGUAGE.into()).ok()?;
    let tree = parser.parse(&text, None)?;
    Some(SourceFile { path: path.display().to_string(), text, tree })
}

/// The byte offset of each UTF-16 offset.
fn bytes_of_units(text: &str) -> Vec<usize> {
    let mut table = Vec::with_capacity(text.len() + 1);
    for (offset, character) in text.char_indices() {
        for _ in 0..character.len_utf16() {
            table.push(offset);
        }
    }
    table.push(text.len());
    table
}

#[test]
fn expressions_print_as_javac_prints_them() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let outside = std::env::var("NP_JAVAC_PRINT").ok();
    let dump = std::fs::read_to_string(outside.clone().map_or(root.join("expected/javac-print.jsonl"), Into::into)).expect("dump");
    let (mut compared, mut failures) = (0usize, Vec::new());
    let mut current: Option<(String, Option<(SourceFile, Vec<usize>)>)> = None;
    for line in dump.lines() {
        let row: serde_json::Value = serde_json::from_str(line).expect("row");
        let path = row["file"].as_str().expect("file");
        if current.as_ref().is_none_or(|(known, _)| known != path) {
            let file = if outside.is_some() { Path::new(path).to_path_buf() } else { root.join("fixtures/javacprint").join(path) };
            current = Some((path.to_string(), parse(&file).map(|source| {
                let table = bytes_of_units(&source.text);
                (source, table)
            })));
        }
        let Some((_, Some((source, table)))) = &current else { continue };
        let (start, end) = (table[row["start"].as_u64().expect("start") as usize], table[row["end"].as_u64().expect("end") as usize]);
        let Some(mut node) = source.tree.root_node().descendant_for_byte_range(start, end) else { continue };
        while let Some(up) = node.parent().filter(|up| up.start_byte() == start && up.end_byte() == end && up.kind() != "argument_list") {
            node = up;
        }
        if node.start_byte() != start || node.end_byte() != end {
            continue;
        }
        compared += 1;
        let expected = row["text"].as_str().expect("text");
        let found = printed(source, node);
        let first = |text: &str| text.lines().next().unwrap_or_default().to_string();
        if first(&found) != first(expected) {
            failures.push(format!("{path}:{start}\n  javac:  {}\n  engine: {}", first(expected), first(&found)));
        }
    }
    eprintln!("compared {compared}, differ {}", failures.len());
    let shown: Vec<&String> = failures.iter().take(40).collect();
    assert!(failures.is_empty(), "{} of {compared} differ:\n{}", failures.len(), shown.iter().map(|failure| failure.as_str()).collect::<Vec<_>>().join("\n"));
    assert!(compared > 0);
}
