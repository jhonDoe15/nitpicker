//! The modules each file names, as dependency-cruiser extracts them before it resolves them: what the TypeScript
//! parser finds, and which of those survive the transpile to JavaScript, which marks the rest pre-compilation only.
mod directives;
mod extract;
mod kept;

use rayon::prelude::*;
use serde_json::{Value, json};
use std::io::Write;
use std::time::Instant;

/// `typescript-import-extract --files <list> [--out <file>]`: one JSON line per listed file, with `dependencies`
/// in the order the TypeScript extraction of dependency-cruiser lists them and `kept` the `[module, dynamic,
/// moduleSystem]` that the extraction from the transpiled JavaScript finds, or with `unread` and the reason the
/// caller has to extract the file itself.
pub fn run(args: &[String]) {
    let started = Instant::now();
    let (files, out) = crate::listed_files(args);
    let lines: Vec<String> = files.par_iter().map(|(path, display)| line(path, display).to_string()).collect();
    let mut sink: Box<dyn Write> = match out {
        Some(path) => Box::new(std::io::BufWriter::new(std::fs::File::create(path).expect("create"))),
        None => Box::new(std::io::BufWriter::new(std::io::stdout().lock())),
    };
    for text in &lines {
        writeln!(sink, "{text}").expect("write");
    }
    drop(sink);
    eprintln!("{} files; {:.0} ms", files.len(), started.elapsed().as_secs_f64() * 1e3);
}

fn line(path: &str, display: &str) -> Value {
    match file_entry(path) {
        Ok((dependencies, kept)) => json!({ "file": display, "dependencies": dependencies, "kept": kept }),
        Err(reason) => json!({ "file": display, "unread": reason }),
    }
}

/// Whether the transpile step of dependency-cruiser rewrites the file: TypeScript sources go through the compiler,
/// JavaScript sources are read as they are.
fn is_transpiled(path: &str) -> bool {
    let lower = path.to_ascii_lowercase();
    [".ts", ".tsx", ".mts", ".cts"].iter().any(|ending| lower.ends_with(ending))
}

fn file_entry(path: &str) -> Result<(Vec<Value>, Vec<Value>), String> {
    let text = std::fs::read_to_string(path).map_err(|error| error.to_string())?;
    super::with_parsed(path, &text, |parsed| {
        if parsed.panicked || !parsed.errors.is_empty() {
            return Err(parsed.errors.first().cloned().unwrap_or_else(|| "unparsed".to_string()));
        }
        let dependencies = extract::dependencies(parsed)?;
        let kept = if is_transpiled(path) { kept::transpiled(parsed)? } else { kept::read_as_is(parsed)? };
        Ok((dependencies, kept))
    })
}
