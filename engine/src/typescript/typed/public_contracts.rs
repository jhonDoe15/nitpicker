//! Methods of exported interfaces that classes implement and no caller reaches through the interface or the
//! class from outside it. The engine walks its own trees; symbols, types and signatures come from the compiler.
use super::plan::{self, FilePlan, Place};
use super::sources::{self, Sources};
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::server::Symbol;
use crate::typescript::types::session::Session;
use crate::typescript::types::tables::kind::{EXPORT_KEYWORD, INTERFACE_DECLARATION};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Component, PathBuf};
use std::time::Instant;

#[derive(Deserialize, Default)]
pub struct Input {
    #[serde(default, rename = "ownRoot")]
    pub own_root: Option<String>,
}

#[derive(Serialize, PartialEq, Eq, PartialOrd, Ord)]
pub struct Finding {
    pub file: String,
    pub contract: String,
    pub method: String,
}

#[derive(Serialize, Default)]
pub struct Counts {
    pub production_files: usize,
    pub contracts: usize,
    pub methods: usize,
    pub reads: usize,
    pub reads_asked: usize,
    pub picks: usize,
    pub picks_asked: usize,
    pub parse_ms: u128,
    pub contracts_ms: u128,
    pub uses_ms: u128,
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

#[derive(Default)]
struct Found {
    methods: Vec<Method>,
    contracts: Vec<Contract>,
}

fn normalize_root(root: &str) -> Result<String, String> {
    let absolute = std::path::absolute(root).map_err(|error| format!("{root}: {error}"))?;
    let mut normalized = PathBuf::new();
    for component in absolute.components() {
        match component {
            Component::ParentDir => { normalized.pop(); }
            Component::CurDir => {}
            other => normalized.push(other),
        }
    }
    let text = normalized.to_str().ok_or("the own root path is not UTF-8")?.replace('\\', "/");
    let trimmed = text.trim_end_matches('/');
    Ok(if trimmed.is_empty() { "/".to_string() } else { trimmed.to_string() })
}

fn handle(session: &mut Session, path: &str, plan: &FilePlan, place: Place) -> Result<Option<String>, String> {
    session.handle(path, place.kind, plan.units(place.start), plan.units(place.end))
}

/// The exported interface declaration in a production file under `own_root` among the declarations of a symbol.
fn contract_declaration(session: &mut Session, sources: &Sources, own_root: &str, symbol: &Symbol) -> Result<Option<String>, String> {
    let interface = |handle: &&String| parse_handle(handle).is_some_and(|(_, kind, _)| kind == INTERFACE_DECLARATION);
    let Some(declaration) = symbol.declarations.iter().find(interface) else {
        return Ok(None);
    };
    let (index, _, path) = parse_handle(declaration).expect("handle");
    if !sources.is_production_under(own_root, path) {
        return Ok(None);
    }
    let table = session.table(path)?;
    Ok(table.children(index).any(|child| table.kind(child) == EXPORT_KEYWORD).then(|| declaration.clone()))
}

fn collect(session: &mut Session, sources: &Sources, own_root: &str, plans: &[FilePlan]) -> Result<Found, String> {
    let mut found = Found::default();
    let mut contract_of: HashMap<String, usize> = HashMap::new();
    for (file, plan) in plans.iter().enumerate() {
        let path = &sources.files[file];
        if !sources.is_production_under(own_root, path) {
            continue;
        }
        for class in plan.classes.iter().filter(|class| !class.implements.is_empty()) {
            let mut heritage = Vec::new();
            for place in &class.implements {
                heritage.extend(handle(session, path, plan, *place)?);
            }
            let mut entries = Vec::new();
            for kind in session.types_at(&heritage)?.into_iter().flatten() {
                let Some(symbol) = session.symbol_of_type(&kind)? else { continue };
                if let Some(declaration) = contract_declaration(session, sources, own_root, &symbol)? {
                    entries.push((kind, symbol, declaration));
                }
            }
            if entries.is_empty() {
                continue;
            }
            let Some(class_handle) = handle(session, path, plan, class.place)? else { continue };
            let implementation = session.types_at(&[class_handle])?.into_iter().next().flatten();
            for (kind, symbol, declaration) in entries {
                let contract = match contract_of.get(&declaration) {
                    Some(contract) => *contract,
                    None => {
                        let mut own = Vec::new();
                        for member in session.server.properties_of(&session.project, kind.id)? {
                            let Some(member_type) = session.server.type_of_symbol_at(&session.project, member.id, &declaration)? else { continue };
                            if !session.server.signatures_of(&session.project, member_type.id, false)?.is_empty() {
                                own.push(found.methods.len());
                                found.methods.push(Method {
                                    name: member.name,
                                    declarations: member.declarations.into_iter().collect(),
                                    implementations: HashSet::new(),
                                    used: false,
                                });
                            }
                        }
                        let (_, _, declared_in) = parse_handle(&declaration).expect("handle");
                        found.contracts.push(Contract { name: symbol.name.clone(), file: declared_in.to_string(), methods: own });
                        contract_of.insert(declaration.clone(), found.contracts.len() - 1);
                        found.contracts.len() - 1
                    }
                };
                for method in found.contracts[contract].methods.clone() {
                    found.methods[method].implementations.insert((file, class.place.start));
                    if let Some(implementation) = &implementation {
                        if let Some(property) = session.property_of(implementation.id, &found.methods[method].name)? {
                            found.methods[method].declarations.extend(property.declarations.iter().cloned());
                        }
                    }
                }
            }
        }
    }
    Ok(found)
}

struct Uses<'a> {
    index: HashMap<&'a str, Vec<usize>>,
    used: Vec<bool>,
    implementations: Vec<&'a HashSet<(usize, u32)>>,
}

impl Uses<'_> {
    /// A read of this symbol uses every method it declares, unless the read sits in a class that implements it.
    fn mark(&mut self, symbol: &Symbol, class: Option<(usize, u32)>) {
        for declaration in &symbol.declarations {
            for method in self.index.get(declaration.as_str()).into_iter().flatten() {
                if class.is_none_or(|class| !self.implementations[*method].contains(&class)) {
                    self.used[*method] = true;
                }
            }
        }
    }
}

/// `all_reads` asks the compiler about every member read. Without it only reads whose written name is the
/// name of a contract method are asked, which finds the same uses: a read reaches a method only by its name.
pub fn check(session: &mut Session, sources: &Sources, input: &Input, all_reads: bool) -> Result<(Vec<Finding>, Counts), String> {
    let own_root = match input.own_root.as_deref() {
        Some(root) => normalize_root(root)?,
        None => session.root.clone(),
    };
    let mut counts = Counts { production_files: sources.files.len(), ..Counts::default() };
    let parsing = Instant::now();
    let plans: Vec<FilePlan> = sources.files.par_iter().map(|path| sources::text_of(path).map_or_else(FilePlan::empty, |text| plan::plan_of(path, &text))).collect();
    counts.parse_ms = parsing.elapsed().as_millis();

    let collecting = Instant::now();
    let Found { methods, contracts } = collect(session, sources, &own_root, &plans)?;
    counts.contracts = contracts.len();
    counts.methods = methods.len();
    counts.contracts_ms = collecting.elapsed().as_millis();
    if contracts.is_empty() {
        return Ok((Vec::new(), counts));
    }

    let using = Instant::now();
    let mut uses = Uses { index: HashMap::new(), used: vec![false; methods.len()], implementations: methods.iter().map(|method| &method.implementations).collect() };
    for (method, entry) in methods.iter().enumerate() {
        for declaration in &entry.declarations {
            uses.index.entry(declaration.as_str()).or_default().push(method);
        }
    }
    let named: HashSet<&str> = methods.iter().map(|method| method.name.as_str()).collect();
    for (file, plan) in plans.iter().enumerate() {
        let path = &sources.files[file];
        counts.reads += plan.reads.len();
        counts.picks += plan.picks.len();
        let mut handles = Vec::new();
        let mut classes = Vec::new();
        for read in &plan.reads {
            if !all_reads && read.name.as_deref().is_some_and(|name| !named.contains(name)) {
                continue;
            }
            if let Some(handle) = handle(session, path, plan, read.place)? {
                handles.push(handle);
                classes.push(read.class.map(|(start, _)| (file, start)));
            }
        }
        counts.reads_asked += handles.len();
        for (symbol, class) in session.symbols_at(&handles)?.iter().zip(&classes) {
            if let Some(symbol) = symbol {
                uses.mark(symbol, *class);
            }
        }
        let mut handles = Vec::new();
        let mut asked = Vec::new();
        for (from, name, class) in &plan.picks {
            if !all_reads && !named.contains(name.as_str()) {
                continue;
            }
            if let Some(handle) = handle(session, path, plan, *from)? {
                handles.push(handle);
                asked.push((name, class.map(|(start, _)| (file, start))));
            }
        }
        counts.picks_asked += handles.len();
        for (kind, (name, class)) in session.types_at(&handles)?.into_iter().zip(asked) {
            let Some(kind) = kind else { continue };
            if let Some(symbol) = session.property_of(kind.id, name)? {
                uses.mark(&symbol, class);
            }
        }
        session.release_table(path);
    }
    counts.uses_ms = using.elapsed().as_millis();

    let used = uses.used;
    let mut findings: Vec<Finding> = contracts
        .iter()
        .flat_map(|contract| {
            let file = session.relative(&contract.file).unwrap_or(&contract.file).to_string();
            let unused = contract.methods.iter().filter(|method| !used[**method]);
            unused.map(|method| Finding { file: file.clone(), contract: contract.name.clone(), method: methods[*method].name.clone() }).collect::<Vec<_>>()
        })
        .collect();
    findings.sort();
    Ok((findings, counts))
}
