//! Checks that need the compiler's types: the engine walks its own tree and asks the API server in batches.
//! All checks of a run share one session, so the project is loaded once.
pub mod design;
pub mod plan;
pub mod public_contracts;
pub mod replay;
pub mod sources;
pub mod unused_api;

use crate::typescript::types::session::Session;
use serde_json::{Value, json};
use sources::Sources;
use std::path::Path;
use std::time::Instant;

pub const CHECKS: &[&str] = &["public-contracts", "unused-api", "design"];

#[derive(Default)]
pub struct Options {
    /// Ask about every member read, not only those named like something a check looks for.
    pub all_reads: bool,
    /// What the caller knows that a check needs, as a JSON file per check name.
    pub inputs: std::collections::HashMap<String, String>,
}

fn run_check(name: &str, session: &mut Session, sources: &Sources, options: &Options) -> Result<Value, String> {
    match name {
        "public-contracts" => {
            let (findings, counts) = public_contracts::check(session, sources, options.all_reads)?;
            Ok(json!({ "findings": findings, "counts": counts }))
        }
        "unused-api" => {
            let path = options.inputs.get(name).ok_or("the unused-api check needs --input unused-api=<file>")?;
            let text = std::fs::read_to_string(path).map_err(|error| format!("cannot read {path}: {error}"))?;
            let input: unused_api::Input = serde_json::from_str(&text).map_err(|error| format!("cannot read {path}: {error}"))?;
            let registry = unused_api::check(session, &input)?;
            serde_json::to_value(&registry).map_err(|error| error.to_string())
        }
        "design" => {
            let path = options.inputs.get(name).ok_or("the design check needs --input design=<file>")?;
            let text = std::fs::read_to_string(path).map_err(|error| format!("cannot read {path}: {error}"))?;
            let input: design::Input = serde_json::from_str(&text).map_err(|error| format!("cannot read {path}: {error}"))?;
            design::check(session, &input)
        }
        other => Err(format!("unknown check {other}")),
    }
}

/// One line per node of every production file, as the engine reads the compiler's tree: for comparing the
/// reader with the compiler package's own.
pub fn dump_trees(compiler: &Path, tsconfig: &str) -> Result<String, String> {
    use crate::typescript::types::nodes::NODE_LIST;
    use crate::typescript::types::tables::shape::child_properties;
    use std::fmt::Write;
    let mut session = Session::open(compiler, tsconfig)?;
    let sources = Sources::of(&session);
    let mut out = String::new();
    for path in &sources.files {
        let table = session.table(path)?;
        writeln!(out, "# {path}").unwrap();
        for index in 1..table.count() {
            let kind = table.kind(index);
            let documentation = std::iter::successors(Some(index), |node| table.parent(*node)).any(|node| table.kind(node) == crate::typescript::types::tables::kind::JS_DOC);
            if kind == NODE_LIST || documentation {
                continue;
            }
            write!(out, "{index} {kind} {} {} {}", table.pos(index), table.end(index), table.start(index)).unwrap();
            if let Some(text) = table.text(index).filter(|_| index != 1) {
                write!(out, " {}", serde_json::to_string(&*text).expect("json")).unwrap();
            }
            for name in child_properties(kind) {
                if let Some(child) = table.child(index, name) {
                    write!(out, " {name}={child}").unwrap();
                } else if table.has_list(index, name) {
                    let listed: Vec<String> = table.listed(index, name).iter().map(u32::to_string).collect();
                    write!(out, " {name}=[{}]", listed.join(",")).unwrap();
                }
            }
            let children: Vec<String> = table.children(index).map(|child| child.to_string()).collect();
            writeln!(out, " | {} | {}", children.join(","), table.parent(index).unwrap_or(0)).unwrap();
        }
        session.release_table(path);
    }
    Ok(out)
}

/// Runs the named checks against one session. An error means the compiler's types are not available here.
pub fn run(compiler: &Path, tsconfig: &str, checks: &[String], options: &Options) -> Result<Value, String> {
    let mut session = Session::open(compiler, tsconfig)?;
    let sources = Sources::of(&session);
    let mut results = serde_json::Map::new();
    for name in checks {
        let started = Instant::now();
        let before = session.counts();
        let mut result = run_check(name, &mut session, &sources, options)?;
        let after = session.counts();
        result["ms"] = json!(started.elapsed().as_millis());
        result["waiting_on_compiler_ms"] = json!(after.waiting_on_compiler_ms - before.waiting_on_compiler_ms);
        result["requests"] = json!(after.requests - before.requests);
        results.insert(name.clone(), result);
    }
    Ok(json!({
        "compiler": session.version,
        "project": tsconfig,
        "sourceRoot": session.root,
        "session": session.counts(),
        "checks": results,
    }))
}
