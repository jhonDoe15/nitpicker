mod engine;
mod java;

use engine::Language;
use std::path::PathBuf;
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let mut roots = Vec::new();
    let mut only: Option<Vec<String>> = None;
    let mut out: Option<String> = None;
    let mut min_tokens = 0usize;
    let mut dump = false;
    let mut file_list: Option<String> = None;
    let mut options = engine::Options::default();
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--rules" => {
                index += 1;
                only = Some(args[index].split(',').map(String::from).collect());
            }
            "--out" => {
                index += 1;
                out = Some(args[index].clone());
            }
            "--duplicates" => {
                index += 1;
                min_tokens = args[index].parse().expect("token count");
            }
            "--files" => {
                index += 1;
                file_list = Some(args[index].clone());
            }
            "--dump" => dump = true,
            "--classpath" => {
                index += 1;
                let listed =
                    std::fs::read_to_string(&args[index]).unwrap_or_else(|_| args[index].clone());
                options.classpath.extend(
                    listed
                        .split(['\n', ':'])
                        .filter(|entry| !entry.trim().is_empty())
                        .map(|entry| PathBuf::from(entry.trim())),
                );
            }
            other => roots.push(PathBuf::from(other)),
        }
        index += 1;
    }
    let language = java::Java;
    if dump {
        let text = std::fs::read_to_string(&roots[0]).expect("file");
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&language.grammar()).expect("grammar");
        println!(
            "{}",
            parser
                .parse(&text, None)
                .expect("tree")
                .root_node()
                .to_sexp()
        );
        return;
    }
    let started = Instant::now();
    let files = match file_list {
        Some(list) => std::fs::read_to_string(list)
            .expect("list")
            .lines()
            .map(PathBuf::from)
            .collect(),
        None => engine::runner::collect_files(&roots, &language),
    };
    let listed = started.elapsed();
    let result = engine::runner::run(&files, &language, only.as_deref(), min_tokens, &options);
    let analyzed = started.elapsed();
    let report = serde_json::json!({
        "language": language.id(),
        "files": result.files,
        "lines": result.lines,
        "filesWithSyntaxErrors": result.parse_errors,
        "findings": result.findings,
        "functions": result.functions,
        "duplicates": result.duplicates,
    });
    let text = serde_json::to_string(&report).expect("json");
    match out {
        Some(path) => std::fs::write(path, text).expect("write"),
        None => println!("{text}"),
    }
    eprintln!(
        "{} files, {} lines, {} findings, {} functions, {} duplicates; list {:.0} ms, analyze {:.0} ms, total {:.0} ms",
        result.files,
        result.lines,
        result.findings.len(),
        result.functions.len(),
        result.duplicates.len(),
        listed.as_secs_f64() * 1e3,
        (analyzed - listed).as_secs_f64() * 1e3,
        started.elapsed().as_secs_f64() * 1e3
    );
}
