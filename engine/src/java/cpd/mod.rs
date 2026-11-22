//! `cpd --report <cpd.xml> [--tokens <n>] <source dir>...`: nitpicker's CPD step (`CpdReport.java`: PMD CPD,
//! 100 tokens, identifiers and literals anonymized) without a JVM, writing the `cpd.xml` PMD writes, without the
//! code fragments and the time stamp. Exit status 3 (with the reason on stderr) means "leave this one to CPD":
//! a file PMD would skip or report as a lexical error, a symbolic link, a file that is not UTF-8.
mod letters;
mod lexer;
mod matches;
mod numbers;
mod text;
mod tokens;

use rayon::prelude::*;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

const LEAVE_TO_CPD: i32 = 3;

fn leave(reason: &str) -> ! {
    eprintln!("nitpicker-engine cpd: {reason}");
    std::process::exit(LEAVE_TO_CPD)
}

fn java_files(roots: &[PathBuf]) -> Vec<String> {
    let mut files = Vec::new();
    for root in roots {
        for entry in walkdir::WalkDir::new(root).follow_links(false) {
            let entry = entry.unwrap_or_else(|problem| leave(&format!("cannot walk {}: {problem}", root.display())));
            if entry.path_is_symlink() {
                leave(&format!("symbolic link {}", entry.path().display()));
            }
            if entry.file_type().is_file() && entry.path().to_string_lossy().ends_with(".java") {
                files.push(entry.path().to_string_lossy().into_owned());
            }
        }
    }
    files.sort_by(|a, b| a.encode_utf16().cmp(b.encode_utf16()));
    files.dedup();
    let mut real = std::collections::HashSet::new();
    for file in &files {
        let path = std::fs::canonicalize(file).unwrap_or_else(|problem| leave(&format!("cannot resolve {file}: {problem}")));
        if !real.insert(path) {
            leave(&format!("{file} is reached through two source directories"));
        }
    }
    files
}

fn file_tokens(file: &str, source: &str, detector: tokens::Detector) -> (tokens::FileTokens, tokens::Detector) {
    tokens::file_tokens(source, detector).unwrap_or_else(|| leave(&format!("PMD would not tokenize {file}")))
}

/// Every file from a fresh constructor detector in parallel, then in order: a file after one that left a type
/// open is tokenized again from that state, as PMD's one detector for the whole run sees it.
fn tokenize(files: &[String]) -> Vec<tokens::FileTokens> {
    let fresh: Vec<(String, tokens::FileTokens, tokens::Detector)> = files
        .par_iter()
        .map(|file| {
            let bytes = std::fs::read(Path::new(file)).unwrap_or_else(|problem| leave(&format!("cannot read {file}: {problem}")));
            let source = String::from_utf8(bytes).unwrap_or_else(|_| leave(&format!("{file} is not UTF-8")));
            let (tokens, end) = file_tokens(file, &source, tokens::Detector::default());
            (source, tokens, end)
        })
        .collect();
    let mut state = tokens::Detector::default();
    let mut out = Vec::with_capacity(files.len());
    for (file, (source, tokens, end)) in files.iter().zip(fresh) {
        if state.is_fresh() {
            state = state.then(&end);
            out.push(tokens);
        } else {
            let (tokens, end) = file_tokens(file, &source, state);
            state = end;
            out.push(tokens);
        }
    }
    out
}

fn escaped(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;")
}

pub fn run(args: &[String]) {
    let mut report: Option<String> = None;
    let mut window = 100usize;
    let mut roots = Vec::new();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--report" => { index += 1; report = args.get(index).cloned(); }
            "--tokens" => { index += 1; window = args.get(index).and_then(|n| n.parse().ok()).unwrap_or_else(|| leave("--tokens needs a number")); }
            other => roots.push(PathBuf::from(other)),
        }
        index += 1;
    }
    let report = report.unwrap_or_else(|| leave("--report is missing"));
    let started = std::time::Instant::now();
    let files = java_files(&roots);
    let tokenized = tokenize(&files);
    if let Ok(dump) = std::env::var("NP_CPD_TOKENS") {
        dump_tokens(&dump, &files, &tokenized);
    }
    let mut ids: HashMap<String, i32> = HashMap::new();
    let mut code = matches::Code { ids: Vec::new() };
    let mut places: Vec<(u32, (u32, u32), (u32, u32))> = Vec::new();
    for (file, tokens) in tokenized.iter().enumerate() {
        let mut global: Vec<i32> = vec![0; tokens.names.len()];
        let assigned: Vec<i32> = tokens
            .requests
            .iter()
            .map(|&name| {
                if global[name as usize] == 0 {
                    let next = ids.len() as i32 + 1;
                    global[name as usize] = *ids.entry(tokens.names[name as usize].clone()).or_insert(next);
                }
                global[name as usize]
            })
            .collect();
        for entry in &tokens.entries {
            code.ids.push(assigned[entry.image as usize]);
            places.push((file as u32, entry.begin, entry.end));
        }
        let end = tokens.entries.last().map_or((1, 1), |entry| entry.end);
        code.ids.push(0);
        places.push((file as u32, end, end));
    }
    let found = matches::find(&code, window);
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?>\n");
    xml.push_str("<pmd-cpd xmlns=\"https://pmd-code.org/schema/cpd-report\" pmdVersion=\"7.16.0\" version=\"1.0.0\">\n");
    for (file, tokens) in files.iter().zip(&tokenized) {
        xml.push_str(&format!("   <file path=\"{}\" totalNumberOfTokens=\"{}\"/>\n", escaped(file), tokens.entries.len()));
    }
    for found in &found {
        let first = *found.marks.first().expect("a match has marks") as usize;
        let last = first + found.tokens as usize - 1;
        let lines = places[last].2 .0 - places[first].1 .0 + 1;
        xml.push_str(&format!("   <duplication lines=\"{lines}\" tokens=\"{}\">\n", found.tokens));
        for &mark in &found.marks {
            let (start, end) = (mark as usize, mark as usize + found.tokens as usize - 1);
            let (file, (line, column), _) = places[start];
            let (_, _, (end_line, end_column)) = places[end];
            xml.push_str(&format!(
                "      <file begintoken=\"{start}\" column=\"{column}\" endcolumn=\"{end_column}\" endline=\"{end_line}\" endtoken=\"{end}\" line=\"{line}\" path=\"{}\"/>\n",
                escaped(&files[file as usize])
            ));
        }
        xml.push_str("   </duplication>\n");
    }
    xml.push_str("</pmd-cpd>\n");
    std::fs::write(&report, xml).unwrap_or_else(|problem| leave(&format!("cannot write {report}: {problem}")));
    eprintln!("{} files, {} tokens, {} duplications; {:.0} ms", files.len(), code.ids.len(), found.len(), started.elapsed().as_secs_f64() * 1e3);
}

/// `NP_CPD_TOKENS=<file>`: every token as `image, line, column, end line, end column`, a block per file.
fn dump_tokens(path: &str, files: &[String], tokenized: &[tokens::FileTokens]) {
    let mut out = String::new();
    for (file, tokens) in files.iter().zip(tokenized) {
        out.push_str(&format!("FILE\t{file}\n"));
        for entry in &tokens.entries {
            let (line, column) = entry.begin;
            let (end_line, end_column) = entry.end;
            out.push_str(&format!("{}\t{line}\t{column}\t{end_line}\t{end_column}\n", tokens.image(entry)));
        }
        let (line, column) = tokens.entries.last().map_or((1, 1), |entry| entry.end);
        out.push_str(&format!("EOF\t{line}\t{column}\t{line}\t{column}\n"));
    }
    std::fs::write(path, out).unwrap_or_else(|problem| leave(&format!("cannot write {path}: {problem}")));
}
