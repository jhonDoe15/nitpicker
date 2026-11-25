//! Compares the trees of `doc.rs` with the trees javac built for the same comments.
//! `tests/expected/doctrees.txt` is what `parity/errorprone/DocTreeDump.java` printed for `tests/fixtures/doctrees`.
//! `NP_DOC_TREES=<dump of any code base>` compares that dump instead; its paths must be absolute.
use super::doc::{Comment, DocComment, Kind, Tree, is_space, parse};
use std::path::Path;

#[derive(Debug, Clone)]
struct Row {
    depth: usize,
    kind: String,
    start: i64,
    end: i64,
    /// Where the text would end without the whitespace at its end: javac trims the first sentence.
    trimmed: i64,
    label: String,
    blank: bool,
}

fn quote(text: &str) -> String {
    let mut out = String::from("\"");
    for character in text.chars() {
        match character {
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            other => out.push(other),
        }
    }
    out.push('"');
    out
}

fn kind_name(tree: &Tree) -> String {
    let tag = |name: &str| {
        let mut out = String::new();
        for character in name.chars() {
            if character.is_uppercase() {
                out.push('_');
            }
            out.extend(character.to_uppercase());
        }
        if out == "LINKPLAIN" { "LINK_PLAIN".to_string() } else { out }
    };
    match tree.kind {
        Kind::Text => "TEXT".to_string(),
        Kind::Entity => "ENTITY".to_string(),
        Kind::Escape => "ESCAPE".to_string(),
        Kind::StartElement => "START_ELEMENT".to_string(),
        Kind::EndElement => "END_ELEMENT".to_string(),
        Kind::Attribute => "ATTRIBUTE".to_string(),
        Kind::Comment => "COMMENT".to_string(),
        Kind::DocType => "DOC_TYPE".to_string(),
        Kind::Identifier => "IDENTIFIER".to_string(),
        Kind::Reference => "REFERENCE".to_string(),
        Kind::UnknownBlock => "UNKNOWN_BLOCK_TAG".to_string(),
        Kind::UnknownInline => "UNKNOWN_INLINE_TAG".to_string(),
        Kind::Erroneous => "ERRONEOUS".to_string(),
        Kind::Block | Kind::Inline => tag(&tree.name),
    }
}

fn label(tree: &Tree) -> String {
    match tree.kind {
        Kind::Erroneous => format!("{} compiler.err.{}", quote(&tree.name), tree.code),
        Kind::Reference => quote(&tree.name),
        Kind::Text | Kind::Comment | Kind::DocType | Kind::Escape => String::new(),
        _ => tree.name.clone(),
    }
}

fn rows_of(tree: &Tree, depth: usize, comment: &Comment, units: &dyn Fn(usize) -> i64, out: &mut Vec<Row>) {
    let place = |pos: usize| comment.source_pos(pos).map_or(-1, units);
    let mut trimmed = tree.end.min(comment.text.len());
    while trimmed > tree.pos && is_space(comment.text[trimmed - 1]) {
        trimmed -= 1;
    }
    out.push(Row {
        depth,
        kind: kind_name(tree),
        start: place(tree.pos),
        end: place(tree.end),
        trimmed: place(if tree.end > comment.text.len() { tree.end } else { trimmed }),
        label: label(tree),
        blank: tree.kind == Kind::Text && trimmed == tree.pos,
    });
    for child in &tree.children {
        rows_of(child, depth + 1, comment, units, out);
    }
}

fn ours(comment: &Comment, doc: &DocComment, units: &dyn Fn(usize) -> i64) -> Vec<Row> {
    let start = doc.start.map_or(-1, units);
    let mut out = vec![Row { depth: 0, kind: "DOC_COMMENT".to_string(), start, end: -1, trimmed: -1, label: String::new(), blank: false }];
    for tree in doc.body.iter().chain(&doc.tags) {
        rows_of(tree, 1, comment, units, &mut out);
    }
    out
}

fn theirs(line: &str) -> Row {
    let mut parts = line.splitn(5, ' ');
    let depth = parts.next().and_then(|part| part.parse().ok()).expect("depth");
    let kind = parts.next().expect("kind").to_string();
    let start = parts.next().and_then(|part| part.parse().ok()).expect("start");
    let end = parts.next().and_then(|part| part.parse().ok()).expect("end");
    let rest = parts.next().unwrap_or("");
    let blank = kind == "TEXT" && rest.trim_matches('"').replace("\\n", "").replace("\\t", "").replace("\\r", "").trim().is_empty();
    let label = match kind.as_str() {
        "TEXT" | "COMMENT" | "DOC_TYPE" | "ESCAPE" | "DOC_COMMENT" => String::new(),
        "ERRONEOUS" | "REFERENCE" => rest.to_string(),
        _ => rest.split(' ').next().unwrap_or("").to_string(),
    };
    Row { depth, kind, start, end, trimmed: end, label, blank }
}

/// The sentence break javac applies to the main description splits and trims its text: there, blank text is left
/// out and text that follows text is joined.
fn joined(rows: Vec<Row>) -> Vec<Row> {
    let mut out: Vec<Row> = Vec::new();
    for row in rows {
        let top = row.depth == 1 && row.kind == "TEXT";
        if top && row.blank {
            continue;
        }
        match out.last_mut().filter(|last| top && last.depth == 1 && last.kind == "TEXT") {
            Some(last) => {
                last.end = row.end;
                last.trimmed = row.trimmed;
            }
            None => out.push(row),
        }
    }
    out
}

fn differ(mine: &Row, javac: &Row) -> bool {
    if mine.depth != javac.depth || mine.kind != javac.kind || mine.start != javac.start || mine.label != javac.label {
        return true;
    }
    match javac.kind.as_str() {
        "DOC_COMMENT" => false,
        _ if javac.end == -1 => false,
        "TEXT" if javac.depth == 1 => javac.end != mine.end && javac.end != mine.trimmed,
        _ => javac.end != mine.end,
    }
}

struct Source {
    text: String,
    /// The UTF-16 offset of each byte offset, when they differ.
    units: Option<Vec<i64>>,
}

impl Source {
    fn read(path: &Path) -> Option<Source> {
        let text = String::from_utf8(std::fs::read(path).ok()?).ok()?;
        let units = (!text.is_ascii()).then(|| {
            let mut table = vec![0i64; text.len() + 1];
            let mut count = 0i64;
            for (offset, character) in text.char_indices() {
                for inner in 0..character.len_utf8() {
                    table[offset + inner] = count;
                }
                count += character.len_utf16() as i64;
            }
            table[text.len()] = count;
            table
        });
        Some(Source { text, units })
    }
    fn unit(&self, byte: usize) -> i64 {
        self.units.as_ref().map_or(byte as i64, |table| table[byte.min(table.len() - 1)])
    }
    fn byte(&self, unit: i64) -> usize {
        match &self.units {
            None => (unit.max(0) as usize).min(self.text.len()),
            Some(table) => table.partition_point(|at| *at < unit).min(self.text.len()),
        }
    }
}

/// Compares one comment; none when the comment the dump is about cannot be found in the file.
fn compare(source: &Source, declaration: i64, expected: Vec<Row>) -> Option<Option<String>> {
    let before = source.byte(declaration);
    let first = expected.iter().map(|row| row.start).find(|start| *start >= 0);
    let mut from = source.text.get(..before)?.rfind("/**")?;
    if let Some(first) = first {
        from = source.text.get(..source.byte(first))?.rfind("/**")?;
    }
    let to = from + source.text[from..].find("*/")? + 2;
    if first.is_none() && !source.text[to..before].trim().is_empty() {
        return None;
    }
    let comment = Comment::of(&source.text[from..to], from)?;
    let doc = parse(&comment);
    let mine = joined(ours(&comment, &doc, &|byte| source.unit(byte)));
    let javac = joined(expected);
    let at = (0..mine.len().max(javac.len())).find(|at| match (mine.get(*at), javac.get(*at)) {
        (Some(mine), Some(javac)) => differ(mine, javac),
        _ => true,
    });
    Some(at.map(|at| format!("{}\n  javac {:?}\n  ours  {:?}", &source.text[from..to], javac.get(at), mine.get(at))))
}

#[test]
fn doc_comments_parse_as_javac_parses_them() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests");
    let outside = std::env::var("NP_DOC_TREES").ok();
    let dump = std::fs::read_to_string(outside.clone().map_or(root.join("expected/doctrees.txt"), Into::into)).expect("dump");
    let (mut compared, mut skipped, mut failures) = (0usize, 0usize, Vec::new());
    let mut source: Option<(String, Option<Source>)> = None;
    for block in dump.split("#C ").skip(1) {
        let mut lines = block.lines();
        let (declaration, path) = lines.next().and_then(|head| head.split_once(' ')).expect("head");
        if source.as_ref().is_none_or(|(known, _)| known != path) {
            let file = if outside.is_some() { Path::new(path).to_path_buf() } else { root.join("fixtures/doctrees").join(path) };
            source = Some((path.to_string(), Source::read(&file)));
        }
        let Some((_, Some(text))) = &source else {
            skipped += 1;
            continue;
        };
        match compare(text, declaration.parse().expect("position"), lines.map(theirs).collect()) {
            None => skipped += 1,
            Some(None) => compared += 1,
            Some(Some(failure)) => failures.push(format!("{path}: {failure}")),
        }
    }
    let shown: Vec<&String> = failures.iter().take(std::env::var("NP_DOC_SHOW").ok().and_then(|show| show.parse().ok()).unwrap_or(10)).collect();
    println!("{compared} same, {} differ, {skipped} not found", failures.len());
    assert!(failures.is_empty(), "{} of {} comments differ:\n{}", failures.len(), compared + failures.len(), shown.iter().map(|one| one.as_str()).collect::<Vec<_>>().join("\n"));
    assert!(compared > 0);
}
