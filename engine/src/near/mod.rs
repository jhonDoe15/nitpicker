mod canonical;
mod keys;
mod search;
mod text;
mod tree;

use rayon::prelude::*;
use serde::Deserialize;
use std::io::Write;

#[derive(Deserialize)]
struct Header {
    lists: Vec<Vec<Vec<usize>>>,
}

fn arguments(args: &[String]) -> (String, String) {
    let mut input = None;
    let mut out = None;
    let mut index = 0;
    while index < args.len() {
        match args[index].as_str() {
            "--in" => input = args.get(index + 1).cloned(),
            "--out" => out = args.get(index + 1).cloned(),
            other => panic!("unknown argument {other}"),
        }
        index += 2;
    }
    (input.expect("--in"), out.expect("--out"))
}

fn write_prepared(sink: &mut impl Write, prepared: &search::Prepared) -> std::io::Result<()> {
    if !prepared.large() {
        return writeln!(sink, "{{\"size\":{}}}", prepared.size);
    }
    let key = serde_json::to_string(&prepared.plain_key).expect("json");
    let (size, rewritten, tree) = (prepared.size, prepared.rewritten, &prepared.tree);
    writeln!(sink, "{{\"size\":{size},\"rewritten\":{rewritten},\"plainKey\":{key},\"tree\":{tree}}}")
}

pub fn near_duplicate_search(args: &[String]) {
    let (input, out) = arguments(args);
    let text = std::fs::read_to_string(&input).expect("read the near-duplicate input");
    let mut lines = text.lines();
    let header: Header = serde_json::from_str(lines.next().expect("header")).expect("near-duplicate header");
    let trees: Vec<&str> = lines.collect();
    let pool = rayon::ThreadPoolBuilder::new().stack_size(512 << 20).build().expect("threads");
    let prepared: Result<Vec<search::Prepared>, serde_json::Error> =
        pool.install(|| trees.par_iter().map(|line| search::parse_tree(line).map(search::prepare)).collect());
    let mut prepared = prepared.unwrap_or_else(|problem| {
        eprintln!("near-duplicate input: {problem}");
        std::process::exit(1);
    });
    let units = search::searchables(&mut prepared);
    let mut sink = std::io::BufWriter::new(std::fs::File::create(out).expect("create"));
    for unit in &prepared {
        write_prepared(&mut sink, unit).expect("write");
    }
    for choices in &header.lists {
        let (members, pairs) = search::list_pairs(choices, &units);
        let pairs: Vec<[usize; 2]> = pairs.into_iter().map(|(first, second)| [first, second]).collect();
        writeln!(sink, "{}", serde_json::json!({ "members": members, "pairs": pairs })).expect("write");
    }
    sink.flush().expect("write");
}
