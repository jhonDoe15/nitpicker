mod engine;
mod java;
mod typescript;

use engine::Language;
use std::path::PathBuf;
use std::time::Instant;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if args.first().map(String::as_str) == Some("typescript-estree") {
        let text = std::fs::read_to_string(&args[1]).expect("file");
        typescript::with_parsed(&args[1], &text, |file| println!("{}", file.program.to_estree_json(true, true)));
        return;
    }
    if args.first().map(String::as_str) == Some("typescript-lint") {
        typescript_lint(&args[1..]);
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
    let value = |at: usize| match args.get(at) {
        Some(value) => value.clone(),
        None => fail(&format!("{} needs a value", args[at - 1])),
    };
    while index < args.len() {
        match args[index].as_str() {
            "--rules" => { index += 1; only = Some(value(index).split(',').map(String::from).collect()); }
            "--out" => { index += 1; out = Some(value(index)); }
            "--duplicates" => {
                index += 1;
                min_tokens = value(index).parse().unwrap_or_else(|_| fail("--duplicates needs a token count"));
            }
            "--files" => { index += 1; file_list = Some(value(index)); }
            "--dump" => dump = true,
            "--classpath" => {
                index += 1;
                value(index);
                let listed = std::fs::read_to_string(&args[index]).unwrap_or_else(|_| args[index].clone());
                options.classpath.extend(listed.split(['\n', ':']).filter(|entry| !entry.trim().is_empty()).map(|entry| PathBuf::from(entry.trim())));
            }
            other => roots.push(PathBuf::from(other)),
        }
        index += 1;
    }
    // Generated sources nest expressions thousands deep (one string built from thousands of pieces); the walks
    // over them recurse, so the workers get a large stack. Only the part that is used takes memory.
    // The whole run happens inside the pool, so a run of one file gets the large stack too.
    let pool = rayon::ThreadPoolBuilder::new().stack_size(512 << 20).build().unwrap_or_else(|problem| fail(&format!("no worker threads: {problem}")));
    let language = java::Java;
    if dump {
        let Some(path) = roots.first() else { fail("--dump needs a file") };
        let text = engine::source::read_text(path).unwrap_or_else(|| fail(&format!("cannot read {}", path.display())));
        let mut parser = tree_sitter::Parser::new();
        parser.set_language(&language.grammar()).expect("grammar");
        println!("{}", parser.parse(&text, None).expect("tree").root_node().to_sexp());
        return;
    }
    let started = Instant::now();
    let files = match file_list {
        Some(list) => std::fs::read_to_string(&list).unwrap_or_else(|_| fail(&format!("cannot read {list}"))).lines().map(PathBuf::from).collect(),
        None => {
            if let Some(missing) = roots.iter().find(|root| !root.exists()) {
                fail(&format!("{} does not exist", missing.display()));
            }
            engine::runner::collect_files(&roots, &language)
        }
    };
    let listed = started.elapsed();
    let result = pool.install(|| engine::runner::run(&files, &language, only.as_deref(), min_tokens, &options));
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

fn fail(problem: &str) -> ! {
    eprintln!("nitpicker-engine: {problem}");
    std::process::exit(2)
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
    let mut sink: Box<dyn std::io::Write> = match out {
        Some(path) => Box::new(std::io::BufWriter::new(std::fs::File::create(path).expect("create"))),
        None => Box::new(std::io::BufWriter::new(std::io::stdout().lock())),
    };
    typescript::structure::reuse::write_facts(&files, &mut sink).expect("write");
    drop(sink);
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

/// `typescript-lint --files <list> [--rules <a,b>] [--out <file>] [--testing-library-utils-module <suffix>]`: each line of
/// the list is the path to read, the path to report and `key=value` settings for that file, tabs between them. The
/// module suffix is `test-utils` unless given, and empty for none; `testing-library/utils-module=<suffix>` sets it for
/// one file and `testing-library/scope=off` leaves the file to no testing-library rule.
fn typescript_lint(args: &[String]) {
    let (mut list, mut out, mut only) = (None, None, None::<Vec<String>>);
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--files" => { index += 1; list = Some(&args[index]); }
            "--out" => { index += 1; out = Some(&args[index]); }
            "--rules" => { index += 1; only = Some(args[index].split(',').map(String::from).collect()); }
            "--testing-library-utils-module" => {
                index += 1;
                typescript::rules::testing_library::set_utils_module(Some(args[index].clone()).filter(|module| !module.is_empty()));
            }
            "--testing-library-upstream" => typescript::rules::testing_library::set_upstream_only(),
            other => panic!("unknown argument {other}"),
        }
        index += 1;
    }
    let started = Instant::now();
    let files: Vec<typescript::rules::Listed> = std::fs::read_to_string(list.expect("--files"))
        .expect("list")
        .lines()
        .filter(|line| !line.is_empty())
        .map(|line| {
            let mut columns = line.split('\t').map(String::from);
            let path = columns.next().unwrap_or_default();
            let display = columns.next().unwrap_or_else(|| path.clone());
            typescript::rules::Listed { path, display, settings: columns.collect() }
        })
        .collect();
    let rules = typescript::rules::selected(only.as_deref());
    let findings = typescript::rules::lint_files(&files, &rules);
    let rows: Vec<_> = findings.iter().map(|found| (&found.file, &found.rule, found.line, found.column, &found.message)).collect();
    let text = serde_json::to_string(&rows).expect("json");
    match out {
        Some(path) => std::fs::write(path, text).expect("write"),
        None => println!("{text}"),
    }
    eprintln!("{} files, {} rules, {} findings; {:.0} ms", files.len(), rules.len(), findings.len(), started.elapsed().as_secs_f64() * 1e3);
}
