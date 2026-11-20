mod engine;
mod java;
mod typescript;

use engine::Language;
use std::path::PathBuf;
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("typescript-reuse") {
        typescript_reuse(&args[1..]);
        return;
    }
    if args.first().map(String::as_str) == Some("typescript-public-contracts") {
        typescript_public_contracts(&args[1..]);
        return;
    }
    if args.first().map(String::as_str) == Some("typescript-type-replay") {
        typescript_type_replay(&args[1..]);
        return;
    }
    if args.first().map(String::as_str) == Some("typescript-structure") {
        typescript_structure(&args[1..]);
        return;
    }
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
            "--rules" => { index += 1; only = Some(args[index].split(',').map(String::from).collect()); }
            "--out" => { index += 1; out = Some(args[index].clone()); }
            "--duplicates" => { index += 1; min_tokens = args[index].parse().expect("token count"); }
            "--files" => { index += 1; file_list = Some(args[index].clone()); }
            "--dump" => dump = true,
            "--classpath" => {
                index += 1;
                let listed = std::fs::read_to_string(&args[index]).unwrap_or_else(|_| args[index].clone());
                options.classpath.extend(listed.split(['\n', ':']).filter(|entry| !entry.trim().is_empty()).map(|entry| PathBuf::from(entry.trim())));
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
        println!("{}", parser.parse(&text, None).expect("tree").root_node().to_sexp());
        return;
    }
    let started = Instant::now();
    let files = match file_list {
        Some(list) => std::fs::read_to_string(list).expect("list").lines().map(PathBuf::from).collect(),
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
        result.files, result.lines, result.findings.len(), result.functions.len(), result.duplicates.len(),
        listed.as_secs_f64() * 1e3, (analyzed - listed).as_secs_f64() * 1e3, started.elapsed().as_secs_f64() * 1e3
    );
}

/// Reads `--files <list> [--out <file>]`: each line of the list is the path to read, a tab, the path to report.
fn listed_files(args: &[String]) -> (Vec<(String, String)>, Option<String>) {
    let mut list: Option<&String> = None;
    let mut out: Option<String> = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--files" => { index += 1; list = Some(&args[index]); }
            "--out" => { index += 1; out = Some(args[index].clone()); }
            other => panic!("unknown argument {other}"),
        }
        index += 1;
    }
    let files = std::fs::read_to_string(list.expect("--files"))
        .expect("list")
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| match line.split_once('\t') {
            Some((path, display)) => (path.to_string(), display.to_string()),
            None => (line.to_string(), line.to_string()),
        })
        .collect();
    (files, out)
}

/// `typescript-reuse --files <list> [--out <file>]`: one JSON line per file with its definitions, imports and exports.
fn typescript_reuse(args: &[String]) {
    let started = Instant::now();
    let (files, out) = listed_files(args);
    let text = typescript::structure::reuse::facts_lines(&files);
    match out {
        Some(path) => std::fs::write(path, text).expect("write"),
        None => print!("{text}"),
    }
    eprintln!("{} files; {:.0} ms", files.len(), started.elapsed().as_secs_f64() * 1e3);
}

/// `typescript-structure --files <list> [--out <file>]`: function and class metrics of the listed files.
fn typescript_structure(args: &[String]) {
    let started = Instant::now();
    let (files, out) = listed_files(args);
    let analysis = typescript::structure::analyze_files(&files);
    let text = serde_json::to_string(&analysis).expect("json");
    match out {
        Some(path) => std::fs::write(path, text).expect("write"),
        None => println!("{text}"),
    }
    eprintln!(
        "{} files, {} lines, {} functions, {} classes, {} unparsed; {:.0} ms",
        analysis.summary.files, analysis.summary.lines, analysis.summary.functions, analysis.summary.classes,
        analysis.unparsed.len(), started.elapsed().as_secs_f64() * 1e3
    );
}

/// `typescript-public-contracts --compiler <tsc of TypeScript 7> --project <tsconfig.json> [--only-named] [--by-position] [--diagnostics-first] [--out <file>]`:
/// unused methods of implemented, exported interfaces, with the types asked from the compiler's API server.
fn typescript_public_contracts(args: &[String]) {
    let started = Instant::now();
    let mut compiler = None;
    let mut project = None;
    let mut out = None;
    let mut only_named = false;
    let mut by_position = false;
    let mut diagnostics_first = false;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--compiler" => { index += 1; compiler = Some(PathBuf::from(&args[index])); }
            "--project" => { index += 1; project = Some(args[index].clone()); }
            "--out" => { index += 1; out = Some(args[index].clone()); }
            "--only-named" => only_named = true,
            "--by-position" => by_position = true,
            "--diagnostics-first" => diagnostics_first = true,
            other => panic!("unknown argument {other}"),
        }
        index += 1;
    }
    let (findings, counts) = typescript::typed::public_contracts::run(&compiler.expect("--compiler"), &project.expect("--project"), only_named, by_position, diagnostics_first).unwrap_or_else(|error| {
        eprintln!("{error}");
        std::process::exit(2);
    });
    let text = serde_json::to_string_pretty(&serde_json::json!({ "findings": findings })).expect("json");
    match out {
        Some(path) => std::fs::write(path, text).expect("write"),
        None => println!("{text}"),
    }
    eprintln!("{} findings; {:.0} ms; {}", findings.len(), started.elapsed().as_secs_f64() * 1e3, serde_json::to_string(&counts).expect("json"));
}

/// `typescript-type-replay --compiler <tsc> --project <tsconfig.json> --questions <jsonl> --kinds <json> [--out <jsonl>]`:
/// asks the compiler the recorded questions and counts the answers that match the recorded ones.
fn typescript_type_replay(args: &[String]) {
    let mut named = std::collections::HashMap::new();
    for pair in args.chunks(2) {
        named.insert(pair[0].as_str(), pair[1].clone());
    }
    let tallies = typescript::typed::replay::run(std::path::Path::new(&named["--compiler"]), &named["--project"], &named["--questions"], &named["--kinds"], named.get("--out").map(String::as_str)).unwrap_or_else(|error| {
        eprintln!("{error}");
        std::process::exit(2);
    });
    println!("{}", serde_json::to_string_pretty(&tallies).expect("json"));
}
