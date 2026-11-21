//! Asks the compiler's API server questions recorded from the JavaScript compiler API, and compares the
//! answers. This measures whether checks can keep their findings when the types come from the native
//! compiler, and what a question costs.
use crate::typescript::types::nodes::{NodeTable, parse_handle};
use crate::typescript::types::server::Server;
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap};
use std::path::Path;
use std::time::Instant;

struct Question {
    method: String,
    file: String,
    start: u32,
    end: u32,
    kind: String,
    answer: Value,
}

#[derive(Default, serde::Serialize)]
pub struct Tally {
    pub asked: usize,
    pub same: usize,
    pub different: usize,
    pub no_node: usize,
    pub milliseconds: u128,
}

const NO_TRUNCATION: u32 = 1;

pub fn run(compiler: &Path, tsconfig: &str, questions: &str, kinds: &str, differences: Option<&str>) -> Result<BTreeMap<String, Tally>, String> {
    let kinds: HashMap<String, u32> = serde_json::from_str(&std::fs::read_to_string(kinds).map_err(|error| error.to_string())?).map_err(|error| error.to_string())?;
    let mut by_method: BTreeMap<String, Vec<Question>> = BTreeMap::new();
    for line in std::fs::read_to_string(questions).map_err(|error| error.to_string())?.lines() {
        let row: Vec<Value> = serde_json::from_str(line).map_err(|error| error.to_string())?;
        let question = Question {
            method: row[0].as_str().unwrap_or_default().to_string(),
            file: row[1].as_str().unwrap_or_default().to_string(),
            start: row[2].as_u64().unwrap_or(0) as u32,
            end: row[3].as_u64().unwrap_or(0) as u32,
            kind: row[4].as_str().unwrap_or_default().to_string(),
            answer: row[5].clone(),
        };
        by_method.entry(question.method.clone()).or_default().push(question);
    }
    let directory = Path::new(tsconfig).parent().expect("directory");
    let started = Instant::now();
    let mut server = Server::start(compiler, directory)?;
    let project = server.open(tsconfig)?;
    eprintln!("project open: {} ms", started.elapsed().as_millis());
    let mut tables: HashMap<String, NodeTable> = HashMap::new();
    let mut texts: HashMap<u64, String> = HashMap::new();
    let mut tallies = BTreeMap::new();
    let mut report = String::new();
    for (method, questions) in &by_method {
        let method_started = Instant::now();
        let mut tally = Tally::default();
        let mut handles = Vec::new();
        let mut asked = Vec::new();
        for question in questions {
            if !tables.contains_key(&question.file) {
                tables.insert(question.file.clone(), server.node_table(&project, &question.file)?);
            }
            let table = &tables[&question.file];
            let found = kinds.get(&question.kind).and_then(|kind| table.find(*kind, question.start, question.end)).or_else(|| table.find_outer(question.start, question.end));
            match found {
                Some(index) => {
                    handles.push(format!("{index}.{}.{}", table.kind(index), question.file));
                    asked.push(question);
                }
                None => tally.no_node += 1,
            }
        }
        tally.asked = asked.len();
        let mut answers: Vec<Value> = Vec::with_capacity(asked.len());
        match method.as_str() {
            "getTypeAtLocation" | "getSymbolAtLocation" => {
                let batch = if method == "getTypeAtLocation" { "getTypeAtLocations" } else { "getSymbolsAtLocations" };
                for chunk in handles.chunks(2000) {
                    let found = server.raw(&project, batch, json!({ "locations": chunk }))?;
                    answers.extend(found.as_array().cloned().unwrap_or_default());
                }
            }
            other => {
                for handle in &handles {
                    answers.push(server.raw(&project, other, json!({ "location": handle }))?);
                }
            }
        }
        for (question, answer) in asked.iter().zip(&answers) {
            let ours = match method.as_str() {
                "getTypeAtLocation" | "getContextualType" | "getTypeFromTypeNode" => match answer["id"].as_u64() {
                    Some(id) => {
                        if !texts.contains_key(&id) {
                            let text = server.raw(&project, "typeToString", json!({ "type": id, "flags": NO_TRUNCATION }))?;
                            texts.insert(id, text.as_str().unwrap_or_default().to_string());
                        }
                        json!(texts[&id])
                    }
                    None => Value::Null,
                },
                "getResolvedSignature" => match answer["declaration"].as_str() {
                    Some(declaration) => json!(place_of(declaration, &mut tables, &mut server, &project)?),
                    None => Value::Null,
                },
                _ => match answer["name"].as_str() {
                    Some(name) => {
                        let mut places = Vec::new();
                        for declaration in answer["declarations"].as_array().into_iter().flatten() {
                            places.push(place_of(declaration.as_str().unwrap_or_default(), &mut tables, &mut server, &project)?);
                        }
                        json!([name, places])
                    }
                    None => Value::Null,
                },
            };
            let theirs = match method.as_str() {
                "getTypeAtLocation" | "getContextualType" | "getTypeFromTypeNode" => question.answer.get(0).cloned().unwrap_or(Value::Null),
                "getResolvedSignature" => question.answer.get(1).map(end_only).unwrap_or(Value::Null),
                _ => match question.answer.as_array() {
                    Some(parts) => json!([parts[0], parts[1].as_array().into_iter().flatten().map(end_only).collect::<Vec<_>>()]),
                    None => Value::Null,
                },
            };
            if ours == theirs {
                tally.same += 1;
            } else {
                tally.different += 1;
                report.push_str(&json!([method, question.file, question.start, question.end, question.kind, theirs, ours]).to_string());
                report.push('\n');
            }
        }
        tally.milliseconds = method_started.elapsed().as_millis();
        tallies.insert(method.clone(), tally);
    }
    if let Some(path) = differences {
        std::fs::write(path, report).map_err(|error| error.to_string())?;
    }
    eprintln!("{} requests, {} ms waiting on the compiler, {} MB received", server.channel.requests, server.channel.waited.as_millis(), server.channel.received >> 20);
    Ok(tallies)
}

/// `file:start-end` without the start: the two compilers agree on where a node ends.
fn end_only(place: &Value) -> Value {
    match place.as_str() {
        Some(text) => {
            let (file, extent) = text.rsplit_once(':').unwrap_or((text, ""));
            json!(library_free(&format!("{file}:{}", extent.split_once('-').map_or(extent, |(_, end)| end))))
        }
        None => Value::Null,
    }
}

fn place_of(handle: &str, tables: &mut HashMap<String, NodeTable>, server: &mut Server, project: &crate::typescript::types::server::Project) -> Result<String, String> {
    let Some((index, _, path)) = parse_handle(handle) else { return Ok(handle.to_string()) };
    if !tables.contains_key(path) {
        tables.insert(path.to_string(), server.node_table(project, path)?);
    }
    Ok(library_free(&format!("{path}:{}", tables[path].end(index))))
}

/// The two compilers ship their own copies of the standard library files, at different paths and with
/// small differences in offsets: such a declaration is named by its file name alone.
fn library_free(place: &str) -> String {
    let (file, _) = place.rsplit_once(':').unwrap_or((place, ""));
    let name = file.rsplit('/').next().unwrap_or(file);
    if name.starts_with("lib.") && name.ends_with(".d.ts") && (file.contains("/typescript/lib/") || file.contains("/typescript-linux-x64/lib/")) { name.to_string() } else { place.to_string() }
}
