//! The facts the design rules judge: the project's types with their fields, and its callables with what they
//! call, read and decide on. nitpicker names the files that count and what it knows about the project; the
//! engine walks the compiler's trees and asks the compiler for symbols and types; nitpicker marks what is
//! published and turns the facts into findings.
mod calls;
mod decisions;
mod sites;
mod syntax;
mod targets;
mod text;
mod types;
mod uses;

use crate::typescript::types::nodes::{NodeTable, ROOT, parse_handle};
use crate::typescript::types::server::{Symbol, Type};
use crate::typescript::types::session::Session;
use crate::typescript::types::tables::symbol_flags;
use serde::Deserialize;
use serde_json::{Value, json};
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

#[derive(Deserialize)]
pub struct FileInput {
    /// The path findings name the file by.
    pub path: String,
    /// Whether a default export of this file is called by a framework.
    #[serde(default, rename = "frameworkDefault")]
    pub framework_default: bool,
}

#[derive(Deserialize)]
pub struct Input {
    /// The files whose declarations are judged, by absolute name, in the order facts are reported in.
    pub files: Vec<(String, FileInput)>,
    /// Whether any import specifier may name a project module (`baseUrl` is set).
    #[serde(rename = "anySpecifier")]
    pub any_specifier: bool,
    /// The prefixes of `paths` patterns.
    #[serde(rename = "pathPrefixes")]
    pub path_prefixes: Vec<String>,
    /// Whether the project publishes anything, so export names are worth collecting.
    pub published: bool,
}

/// A node of some file of the program.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct At {
    pub file: u32,
    pub node: u32,
}

pub struct TypeEntry {
    pub id: String,
    pub file: String,
    pub name: String,
    pub node: At,
    pub node_kind: u32,
    pub kind: &'static str,
    pub exported: bool,
    pub anchor: Option<At>,
    pub cases: Option<Vec<String>>,
    pub implemented: bool,
    pub field_names: HashSet<String>,
}

pub struct Site {
    pub id: String,
    pub name: String,
    pub kind: &'static str,
    pub owner: Option<String>,
    pub node: At,
    pub declaration: At,
    pub path: String,
    pub exported: bool,
    pub anchor: Option<At>,
    pub line: u32,
    pub callback: bool,
    pub member: Option<u32>,
    pub class_entry: Option<usize>,
    pub is_static: bool,
    pub bodyless: bool,
}

#[derive(Default)]
pub struct Registry {
    pub owned: HashSet<u32>,
    pub entries: Vec<TypeEntry>,
    pub type_ids: HashMap<String, usize>,
    pub type_by_node: HashMap<At, usize>,
    pub exported_by_file: HashMap<u32, Rc<HashSet<At>>>,
    pub sites: Vec<Site>,
    pub site_counts: HashMap<String, u32>,
    pub site_names: HashSet<String>,
    pub site_by_node: HashMap<At, usize>,
    pub constructor_by_class: HashMap<At, Option<usize>>,
    pub imports_by_file: HashMap<u32, Rc<HashSet<String>>>,
    pub class_names: HashSet<String>,
    pub enum_names: HashSet<String>,
    pub field_names: HashSet<String>,
    pub enum_cases: HashSet<String>,
    pub constant_names: HashSet<String>,
    pub held_by_constant: HashMap<At, Rc<Vec<usize>>>,
}

pub struct Cx<'a> {
    pub session: &'a mut Session,
    pub input: &'a Input,
    paths: Vec<String>,
    ids: HashMap<String, u32>,
    tables: Vec<Rc<NodeTable>>,
    types_at: HashMap<At, Option<Rc<Type>>>,
    pub registry: Registry,
}

pub type Found<T> = Result<T, String>;

impl Cx<'_> {
    pub fn file(&mut self, path: &str) -> Found<u32> {
        if let Some(id) = self.ids.get(path) {
            return Ok(*id);
        }
        let table = self.session.table(path)?;
        let id = self.paths.len() as u32;
        self.paths.push(path.to_string());
        self.ids.insert(path.to_string(), id);
        self.tables.push(table);
        Ok(id)
    }
    pub fn table(&self, file: u32) -> Rc<NodeTable> {
        Rc::clone(&self.tables[file as usize])
    }
    pub fn path(&self, file: u32) -> &str {
        &self.paths[file as usize]
    }
    pub fn handle(&self, at: At) -> String {
        self.tables[at.file as usize].handle(at.node, &self.paths[at.file as usize])
    }
    pub fn at(&mut self, handle: &str) -> Found<At> {
        let (node, _, path) = parse_handle(handle).ok_or_else(|| format!("unexpected node handle {handle}"))?;
        Ok(At { file: self.file(path)?, node })
    }
    pub fn kind(&self, at: At) -> u32 {
        self.tables[at.file as usize].kind(at.node)
    }
    pub fn symbol(&mut self, at: At) -> Found<Option<Rc<Symbol>>> {
        let handle = self.handle(at);
        self.session.symbol_at(&handle)
    }
    /// The symbol, or what it stands for when it is an alias.
    pub fn follow(&mut self, symbol: Option<Rc<Symbol>>) -> Found<Option<Rc<Symbol>>> {
        match symbol {
            Some(symbol) if symbol.flags & symbol_flags::ALIAS != 0 => self.session.aliased(&symbol),
            other => Ok(other),
        }
    }
    pub fn declarations(&mut self, symbol: Option<&Symbol>) -> Found<Vec<At>> {
        let Some(symbol) = symbol else { return Ok(Vec::new()) };
        symbol.declarations.iter().map(|handle| self.at(handle)).collect()
    }
    pub fn value_declaration(&mut self, symbol: Option<&Symbol>) -> Found<Option<At>> {
        match symbol.and_then(|symbol| symbol.value_declaration.as_deref()) {
            Some(handle) => self.at(handle).map(Some),
            None => Ok(None),
        }
    }
    pub fn type_at(&mut self, at: At) -> Found<Option<Rc<Type>>> {
        if let Some(known) = self.types_at.get(&at) {
            return Ok(known.clone());
        }
        let found: Option<Type> = self.session.ask("getTypeAtLocation", json!({ "location": self.handle(at) }))?;
        let found = found.map(Rc::new);
        self.types_at.insert(at, found.clone());
        Ok(found)
    }
    pub fn type_of_node(&mut self, at: At) -> Found<Option<Type>> {
        self.session.ask("getTypeFromTypeNode", json!({ "location": self.handle(at) }))
    }
    pub fn properties(&mut self, kind: &Type) -> Found<Vec<Symbol>> {
        Ok(self.session.ask::<Option<Vec<Symbol>>>("getPropertiesOfType", json!({ "type": kind.id }))?.unwrap_or_default())
    }
    pub fn has_property(&mut self, kind: &Type, name: &str) -> Found<bool> {
        Ok(self.session.property_of(kind.id, name)?.is_some())
    }
    pub fn type_text(&mut self, kind: &Type, flags: Option<u32>) -> Found<String> {
        self.session.ask("typeToString", json!({ "type": kind.id, "flags": flags }))
    }
}

/// The declarations a file exports, and those its exports stand for.
fn exported_nodes(cx: &mut Cx, file: u32) -> Found<(HashSet<At>, Vec<(At, String)>)> {
    let module = cx.symbol(At { file, node: ROOT })?;
    let exports = match &module {
        Some(module) => cx.session.exports_of(module)?,
        None => Rc::new(Vec::new()),
    };
    let mut nodes = HashSet::new();
    let mut names = Vec::new();
    for symbol in exports.iter() {
        let target = cx.follow(Some(Rc::clone(symbol)))?;
        for declaration in cx.declarations(target.as_deref())? {
            nodes.insert(declaration);
            if declaration.file == file {
                names.push((declaration, symbol.name.clone()));
            }
        }
        nodes.extend(cx.declarations(Some(symbol))?);
    }
    Ok((nodes, names))
}

fn export_names(names: &HashMap<u32, Vec<(At, String)>>, declaration: At) -> Vec<&String> {
    names.get(&declaration.file).into_iter().flatten().filter(|(node, _)| *node == declaration).map(|(_, name)| name).collect()
}

pub fn check(session: &mut Session, input: &Input) -> Found<Value> {
    let mut cx = Cx { session, input, paths: Vec::new(), ids: HashMap::new(), tables: Vec::new(), types_at: HashMap::new(), registry: Registry::default() };
    let mut files = Vec::new();
    let mut names = HashMap::new();
    for (name, _) in &input.files {
        let file = cx.file(name)?;
        if [".js", ".jsx", ".mjs", ".cjs"].iter().any(|extension| name.ends_with(extension)) && cx.table(file).has_reparsed() {
            return Err(format!("{name} declares types in documentation comments, which the two compilers read differently"));
        }
        let (exported, exported_names) = exported_nodes(&mut cx, file)?;
        cx.registry.owned.insert(file);
        cx.registry.exported_by_file.insert(file, Rc::new(exported));
        names.insert(file, exported_names);
        files.push(file);
    }
    for file in &files {
        let table = cx.table(*file);
        cx.registry.constant_names.extend(calls::constant_names_of(&table));
    }
    types::collect(&mut cx, &files)?;
    types::index(&mut cx);
    sites::collect_named(&mut cx, &files)?;
    sites::collect_callbacks(&mut cx, &files)?;
    let mut type_facts = Vec::new();
    for index in 0..cx.registry.entries.len() {
        let mut fact = types::fact(&mut cx, index)?;
        let entry = &cx.registry.entries[index];
        if entry.kind == "module" {
            let references = calls::module_references(&mut cx, index)?;
            if !references.is_empty() {
                fact["references"] = json!(references);
            }
        }
        let entry = &cx.registry.entries[index];
        if input.published && entry.kind == "module" {
            fact["moduleFile"] = json!(cx.path(entry.node.file));
        } else if input.published && entry.exported {
            let declaration = entry.anchor.unwrap_or(entry.node);
            fact["exportedAs"] = json!({ "file": cx.path(declaration.file), "names": export_names(&names, declaration) });
        }
        type_facts.push(fact);
    }
    for (index, fact) in type_facts.iter().enumerate() {
        let fields: HashSet<String> = fact["fields"].as_array().into_iter().flatten().filter_map(|field| field["name"].as_str().map(String::from)).collect();
        if cx.registry.entries[index].kind != "module" {
            cx.registry.field_names.extend(fields.iter().cloned());
        }
        cx.registry.entries[index].field_names = fields;
    }
    let mut callables = Vec::new();
    for index in 0..cx.registry.sites.len() {
        let mut fact = calls::callable_fact(&mut cx, index)?;
        let site = &cx.registry.sites[index];
        if input.published && site.member.is_none() && !site.callback && site.exported {
            let declaration = site.anchor.unwrap_or(site.declaration);
            fact["exportedAs"] = json!({ "file": cx.path(declaration.file), "names": export_names(&names, declaration) });
        }
        callables.push(fact);
    }
    Ok(json!({ "types": type_facts, "callables": callables }))
}
