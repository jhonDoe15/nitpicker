use super::finding::Finding;
use super::source::SourceFile;
use super::{FileFacts, FunctionMetric, Language, Options};
use rayon::prelude::*;
use std::cell::RefCell;
use std::collections::HashMap;
use std::path::PathBuf;

pub struct RunResult {
    pub files: usize,
    pub lines: usize,
    pub findings: Vec<Finding>,
    pub functions: Vec<FunctionMetric>,
    pub duplicates: Vec<Duplicate>,
    pub parse_errors: usize,
    /// The files the grammar could not read in full; their findings may be incomplete.
    pub broken_files: Vec<String>,
}

#[derive(serde::Serialize)]
pub struct Duplicate {
    pub tokens: usize,
    pub first: (String, u32),
    pub second: (String, u32),
}

thread_local! {
    static PARSERS: RefCell<HashMap<&'static str, tree_sitter::Parser>> = RefCell::new(HashMap::new());
}

pub fn collect_files(roots: &[PathBuf], language: &dyn Language) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = roots
        .iter()
        .flat_map(|root| walkdir::WalkDir::new(root).into_iter().filter_map(Result::ok))
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| entry.into_path())
        .filter(|path| {
            path.extension()
                .and_then(|e| e.to_str())
                .is_some_and(|e| language.extensions().contains(&e))
        })
        .collect();
    files.sort();
    files
}

fn parse_text(text: &str, language: &dyn Language) -> Option<tree_sitter::Tree> {
    PARSERS.with(|parsers| {
        let mut parsers = parsers.borrow_mut();
        let parser = parsers.entry(language.id()).or_insert_with(|| {
            let mut parser = tree_sitter::Parser::new();
            parser.set_language(&language.grammar()).expect("grammar");
            parser
        });
        match language.grammar_text(text) {
            Some(masked) => parser.parse(&masked, None),
            None => parser.parse(text, None),
        }
    })
}

fn parse(path: &PathBuf, language: &dyn Language) -> Option<SourceFile> {
    let text = super::source::read_text(path)?;
    let tree = parse_text(&text, language)?;
    Some(SourceFile { path: path.to_string_lossy().into_owned(), text, tree })
}

pub fn run(files: &[PathBuf], language: &dyn Language, only: Option<&[String]>, min_tokens: usize, options: &Options) -> RunResult {
    let rules: Vec<_> = language
        .rules()
        .into_iter()
        .filter(|rule| only.map_or(!rule.id().starts_with('_'), |ids| ids.iter().any(|id| id == rule.id())))
        .collect();
    let started = std::time::Instant::now();
    let needed = rules.iter().any(|rule| rule.needs_project());
    // The project is built from outlines, which are dropped before the rules run: a file's full tree lives only while its rules run.
    let outlines: Vec<SourceFile> = if needed {
        files
            .par_iter()
            .filter_map(|path| {
                let file = parse(path, language)?;
                match language.outline(&file) {
                    Some(text) => {
                        let tree = parse_text(&text, language)?;
                        Some(SourceFile { path: file.path, text, tree })
                    }
                    None => Some(file),
                }
            })
            .collect()
    } else {
        Vec::new()
    };
    let parse_ms = started.elapsed().as_secs_f64() * 1e3;
    let project = language.project(&outlines, options, needed);
    drop(outlines);
    let project_ms = started.elapsed().as_secs_f64() * 1e3 - parse_ms;
    let per_file: Vec<(Vec<Finding>, FileFacts, usize, bool, String)> = files
        .par_iter()
        .filter_map(|path| {
            let file = parse(path, language)?;
            let mut findings = Vec::new();
            for rule in &rules {
                rule.check_in(&file, project.as_ref(), &mut findings);
            }
            let mut facts = language.facts(&file);
            if min_tokens == 0 {
                facts.tokens = Vec::new();
            }
            let lines = file.text.lines().count();
            let broken = file.tree.root_node().has_error();
            Some((findings, facts, lines, broken, file.path))
        })
        .collect();
    eprintln!(
        "parse {parse_ms:.0} ms, project {project_ms:.0} ms, rules {:.0} ms",
        started.elapsed().as_secs_f64() * 1e3 - parse_ms - project_ms
    );
    let mut result = RunResult {
        files: per_file.len(),
        lines: 0,
        findings: Vec::new(),
        functions: Vec::new(),
        duplicates: Vec::new(),
        parse_errors: 0,
        broken_files: Vec::new(),
    };
    let mut token_files = Vec::new();
    for (findings, facts, lines, broken, path) in per_file {
        result.findings.extend(findings);
        result.functions.extend(facts.functions);
        result.lines += lines;
        result.parse_errors += usize::from(broken);
        if broken {
            result.broken_files.push(path.clone());
        }
        token_files.push((path, facts.tokens));
    }
    for rule in &rules {
        rule.finish(project.as_ref(), &mut result.findings);
    }
    result.findings.sort();
    if min_tokens > 0 {
        result.duplicates = duplicates(&token_files, min_tokens);
    }
    result
}

/// Token-window duplicate detection (Rabin-Karp over token kinds), the CPD approach.
fn duplicates(files: &[(String, Vec<super::source::Token>)], window: usize) -> Vec<Duplicate> {
    const BASE: u64 = 1_000_003;
    let power = (0..window - 1).fold(1u64, |acc, _| acc.wrapping_mul(BASE));
    let hashed: Vec<Vec<(u64, u32)>> = files
        .par_iter()
        .map(|(_, tokens)| {
            if tokens.len() < window {
                return Vec::new();
            }
            let mut out = Vec::with_capacity(tokens.len() - window + 1);
            let mut hash = 0u64;
            for token in &tokens[..window] {
                hash = hash.wrapping_mul(BASE).wrapping_add(u64::from(token.kind) + 1);
            }
            out.push((hash, 0u32));
            for start in 1..=tokens.len() - window {
                let gone = u64::from(tokens[start - 1].kind) + 1;
                let come = u64::from(tokens[start + window - 1].kind) + 1;
                hash = hash.wrapping_sub(gone.wrapping_mul(power)).wrapping_mul(BASE).wrapping_add(come);
                out.push((hash, start as u32));
            }
            out
        })
        .collect();
    let mut seen: HashMap<u64, (u32, u32)> = HashMap::new();
    let mut found = Vec::new();
    let mut covered: HashMap<(u32, u32), u32> = HashMap::new();
    for (index, hashes) in hashed.iter().enumerate() {
        for &(hash, start) in hashes {
            match seen.get(&hash) {
                None => {
                    seen.insert(hash, (index as u32, start));
                }
                Some(&(other, other_start)) => {
                    if other == index as u32 && start < other_start + window as u32 {
                        continue;
                    }
                    let key = (other, index as u32);
                    let until = covered.get(&key).copied().unwrap_or(0);
                    if start < until {
                        covered.insert(key, start + window as u32);
                        continue;
                    }
                    let (a, b) = (&files[other as usize].1, &files[index].1);
                    let same = (0..window)
                        .all(|i| a[other_start as usize + i].kind == b[start as usize + i].kind);
                    if !same {
                        continue;
                    }
                    covered.insert(key, start + window as u32);
                    found.push(Duplicate {
                        tokens: window,
                        first: (files[other as usize].0.clone(), a[other_start as usize].line),
                        second: (files[index].0.clone(), b[start as usize].line),
                    });
                }
            }
        }
    }
    found
}
