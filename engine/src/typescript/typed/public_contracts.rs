//! Methods of exported interfaces that classes implement and no caller reaches through the interface or the
//! class from outside it. The engine walks its own trees; symbols, types and signatures come from the compiler.
use super::plan::{self, FilePlan, Place};
use crate::typescript::EXTENSIONS;
use crate::typescript::types::nodes::{NodeTable, parse_handle};
use crate::typescript::types::server::{Project, Server, Symbol};
use rayon::prelude::*;
use regex::Regex;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::time::Instant;

#[derive(Serialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct Finding {
    pub file: String,
    pub contract: String,
    pub method: String,
}

#[derive(Serialize, Default)]
pub struct Counts {
    pub program_files: usize,
    pub production_files: usize,
    pub contracts: usize,
    pub methods: usize,
    pub reads: usize,
    pub reads_asked: usize,
    pub picks: usize,
    pub picks_asked: usize,
    pub places_not_found: usize,
    pub requests: u64,
    pub bytes_sent: u64,
    pub bytes_received: u64,
    pub open_ms: u128,
    pub diagnostics: usize,
    pub diagnostics_ms: u128,
    pub parse_ms: u128,
    pub contracts_ms: u128,
    pub uses_ms: u128,
    pub waiting_on_compiler_ms: u128,
}

struct Method {
    name: String,
    declarations: HashSet<String>,
    implementations: HashSet<(usize, u32)>,
    used: bool,
}

struct Contract {
    name: String,
    file: String,
    methods: Vec<usize>,
}

struct Run<'a> {
    server: Server,
    project: Project,
    root: String,
    tests: Regex,
    tables: HashMap<String, NodeTable>,
    counts: Counts,
    only_named: bool,
    by_position: bool,
    sources: &'a [String],
}

fn is_declaration_file(path: &str) -> bool {
    path.ends_with(".d.ts") || path.ends_with(".d.mts") || path.ends_with(".d.cts")
}

impl Run<'_> {
    fn relative<'p>(&self, path: &'p str) -> Option<&'p str> {
        path.strip_prefix(self.root.as_str())?.strip_prefix('/')
    }
    fn is_production(&self, path: &str) -> bool {
        !is_declaration_file(path) && self.relative(path).is_some_and(|relative| !self.tests.is_match(relative))
    }
    fn table(&mut self, path: &str) -> Result<&NodeTable, String> {
        if !self.tables.contains_key(path) {
            let table = self.server.node_table(&self.project, path)?;
            self.tables.insert(path.to_string(), table);
        }
        Ok(&self.tables[path])
    }
    fn handle(&mut self, path: &str, plan: &FilePlan, place: Place) -> Result<Option<String>, String> {
        let place = Place { kind: place.kind, start: plan.units(place.start), end: plan.units(place.end) };
        let table = self.table(path)?;
        let found = match place.kind {
            Some(kind) => table.find(kind, place.start, place.end),
            None => table.find_outer(place.start, place.end),
        };
        let handle = found.map(|index| format!("{index}.{}.{path}", table.kind(index)));
        if handle.is_none() {
            if std::env::var_os("NITPICKER_ENGINE_TRACE").is_some() {
                let near: Vec<String> = (0..table.count()).filter(|index| table.end(*index) == place.end || table.end(*index) + 1 == place.end).map(|index| format!("{}:{}-{}", table.kind(index), table.pos(index), table.end(index))).collect();
                eprintln!("no compiler node for {path} {:?} {}-{}; ending there: {}", place.kind, place.start, place.end, near.join(" "));
            }
            self.counts.places_not_found += 1;
        }
        Ok(handle)
    }
    /// The exported interface declaration in a production file among the declarations of a symbol.
    fn contract_declaration(&mut self, symbol: &Symbol) -> Result<Option<String>, String> {
        let Some(declaration) = symbol.declarations.iter().find(|handle| parse_handle(handle).is_some_and(|(_, kind, _)| kind == plan::INTERFACE_DECLARATION)) else {
            return Ok(None);
        };
        let (index, _, path) = parse_handle(declaration).expect("handle");
        if !self.is_production(path) {
            return Ok(None);
        }
        let table = self.table(path)?;
        Ok(table.children(index).any(|child| table.kind(child) == plan::EXPORT_KEYWORD).then(|| declaration.clone()))
    }
}

pub fn run(compiler: &Path, tsconfig: &str, only_named: bool, by_position: bool, diagnostics_first: bool) -> Result<(Vec<Finding>, Counts), String> {
    let directory = Path::new(tsconfig).parent().expect("directory").to_str().expect("path").to_string();
    let started = Instant::now();
    let mut server = Server::start(compiler, Path::new(&directory))?;
    let project = server.open(tsconfig)?;
    let names = server.source_file_names(&project)?;
    let root = project.root_dir.clone().unwrap_or(directory);
    let mut run = Run {
        server,
        project,
        root: root.trim_end_matches('/').to_string(),
        tests: Regex::new(r"(?:^|/)(?:__tests__|tests|fixtures)/|\.(?:test|spec)\.[cm]?tsx?$").expect("pattern"),
        tables: HashMap::new(),
        counts: Counts::default(),
        only_named,
        by_position,
        sources: &[],
    };
    run.counts.open_ms = started.elapsed().as_millis();
    if diagnostics_first {
        let checking = Instant::now();
        let found = run.server.raw(&run.project, "getSemanticDiagnostics", serde_json::json!({}))?;
        run.counts.diagnostics = found.as_array().map_or(0, Vec::len);
        run.counts.diagnostics_ms = checking.elapsed().as_millis();
    }
    run.counts.program_files = names.len();
    let sources: Vec<String> = names.into_iter().filter(|name| run.is_production(name)).collect();
    run.counts.production_files = sources.len();
    run.sources = &sources;

    let parsing = Instant::now();
    let plans: Vec<FilePlan> = sources
        .par_iter()
        .map(|path| {
            let known = path.rsplit('.').next().is_some_and(|extension| EXTENSIONS.contains(&extension));
            match std::fs::read_to_string(path) {
                Ok(text) if known => plan::plan_of(path, &text),
                _ => FilePlan::empty(),
            }
        })
        .collect();
    run.counts.parse_ms = parsing.elapsed().as_millis();

    let collecting = Instant::now();
    let mut methods: Vec<Method> = Vec::new();
    let mut contracts: Vec<Contract> = Vec::new();
    let mut contract_of: HashMap<String, usize> = HashMap::new();
    for (file, plan) in plans.iter().enumerate() {
        let path = &sources[file];
        for class in &plan.classes {
            if class.implements.is_empty() {
                continue;
            }
            let mut heritage = Vec::new();
            for place in &class.implements {
                heritage.extend(run.handle(path, plan, *place)?);
            }
            let mut entries = Vec::new();
            for kind in run.server.types_at(&run.project, &heritage)?.into_iter().flatten() {
                let Some(symbol) = run.server.symbol_of_type(&run.project, &kind)? else { continue };
                if let Some(declaration) = run.contract_declaration(&symbol)? {
                    entries.push((kind, symbol, declaration));
                }
            }
            if entries.is_empty() {
                continue;
            }
            let Some(class_handle) = run.handle(path, plan, class.place)? else { continue };
            let implementation = run.server.types_at(&run.project, &[class_handle])?.into_iter().next().flatten();
            for (kind, symbol, declaration) in entries {
                let contract = match contract_of.get(&declaration) {
                    Some(contract) => *contract,
                    None => {
                        let mut own = Vec::new();
                        for member in run.server.properties_of(&run.project, kind.id)? {
                            let Some(member_type) = run.server.type_of_symbol_at(&run.project, member.id, &declaration)? else { continue };
                            if !run.server.signatures_of(&run.project, member_type.id, false)?.is_empty() {
                                own.push(methods.len());
                                methods.push(Method { name: member.name, declarations: member.declarations.into_iter().collect(), implementations: HashSet::new(), used: false });
                            }
                        }
                        let (_, _, declared_in) = parse_handle(&declaration).expect("handle");
                        contracts.push(Contract { name: symbol.name.clone(), file: declared_in.to_string(), methods: own });
                        contract_of.insert(declaration.clone(), contracts.len() - 1);
                        contracts.len() - 1
                    }
                };
                for method in contracts[contract].methods.clone() {
                    methods[method].implementations.insert((file, class.place.start));
                    if let Some(implementation) = &implementation {
                        if let Some(property) = run.server.property_of(&run.project, implementation.id, &methods[method].name)? {
                            methods[method].declarations.extend(property.declarations);
                        }
                    }
                }
            }
        }
    }
    run.counts.contracts = contracts.len();
    run.counts.methods = methods.len();
    run.counts.contracts_ms = collecting.elapsed().as_millis();
    if contracts.is_empty() {
        finish(&mut run);
        return Ok((Vec::new(), run.counts));
    }

    let using = Instant::now();
    let mut index: HashMap<String, Vec<usize>> = HashMap::new();
    for (method, entry) in methods.iter().enumerate() {
        for declaration in &entry.declarations {
            index.entry(declaration.clone()).or_default().push(method);
        }
    }
    let named: HashSet<&str> = methods.iter().map(|method| method.name.as_str()).collect();
    let named: HashSet<String> = named.into_iter().map(String::from).collect();
    let mut mark = |symbol: &Symbol, class: Option<(usize, u32)>, methods: &mut Vec<Method>| {
        for declaration in &symbol.declarations {
            for method in index.get(declaration).into_iter().flatten() {
                if class.is_none_or(|class| !methods[*method].implementations.contains(&class)) {
                    methods[*method].used = true;
                }
            }
        }
    };
    let mut properties: HashMap<(u64, String), Option<Symbol>> = HashMap::new();
    for (file, plan) in plans.iter().enumerate() {
        let path = &sources[file];
        run.counts.reads += plan.reads.len();
        run.counts.picks += plan.picks.len();
        let mut handles = Vec::new();
        let mut classes = Vec::new();
        let mut positions = Vec::new();
        let mut position_classes = Vec::new();
        for read in &plan.reads {
            if run.only_named && read.name.as_deref().is_some_and(|name| !named.contains(name)) {
                continue;
            }
            let class = read.class.map(|(start, _)| (file, start));
            if run.by_position && read.place.kind.is_some() {
                positions.push(plan.units(read.place.start));
                position_classes.push(class);
            } else if let Some(handle) = run.handle(path, plan, read.place)? {
                handles.push(handle);
                classes.push(class);
            }
        }
        run.counts.reads_asked += handles.len() + positions.len();
        for (symbol, class) in run.server.symbols_at(&run.project, &handles)?.iter().zip(&classes) {
            if let Some(symbol) = symbol {
                mark(symbol, *class, &mut methods);
            }
        }
        for (symbol, class) in run.server.symbols_at_positions(&run.project, path, &positions)?.iter().zip(&position_classes) {
            if let Some(symbol) = symbol {
                mark(symbol, *class, &mut methods);
            }
        }
        let mut handles = Vec::new();
        let mut asked = Vec::new();
        for (from, name, class) in &plan.picks {
            if run.only_named && !named.contains(name.as_str()) {
                continue;
            }
            if let Some(handle) = run.handle(path, plan, *from)? {
                handles.push(handle);
                asked.push((name, class.map(|(start, _)| (file, start))));
            }
        }
        run.counts.picks_asked += handles.len();
        for (kind, (name, class)) in run.server.types_at(&run.project, &handles)?.into_iter().zip(asked) {
            let Some(kind) = kind else { continue };
            let key = (kind.id, name.clone());
            if !properties.contains_key(&key) {
                let property = run.server.property_of(&run.project, kind.id, name)?;
                properties.insert(key.clone(), property);
            }
            if let Some(symbol) = &properties[&key] {
                mark(symbol, class, &mut methods);
            }
        }
    }
    run.counts.uses_ms = using.elapsed().as_millis();

    let mut findings: Vec<Finding> = contracts
        .iter()
        .flat_map(|contract| {
            let file = run.relative(&contract.file).unwrap_or(&contract.file).to_string();
            contract.methods.iter().filter(|method| !methods[**method].used).map(move |method| (file.clone(), contract.name.clone(), *method))
        })
        .map(|(file, contract, method)| Finding { file, contract, method: methods[method].name.clone() })
        .collect();
    findings.sort();
    finish(&mut run);
    Ok((findings, run.counts))
}

fn finish(run: &mut Run) {
    run.counts.requests = run.server.channel.requests;
    run.counts.bytes_sent = run.server.channel.sent;
    run.counts.bytes_received = run.server.channel.received;
    run.counts.waiting_on_compiler_ms = run.server.channel.waited.as_millis();
}
