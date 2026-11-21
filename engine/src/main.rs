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
