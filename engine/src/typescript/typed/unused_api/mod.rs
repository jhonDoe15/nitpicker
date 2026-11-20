//! Options and props that no real caller passes. The Node side decides which files belong to the project and
//! what role each has; the engine walks the compiler's trees and asks the compiler for symbols and types. The
//! result is the registry of targets with their members and the references found, as plain data; the Node
//! side turns it into findings.
mod paths;
mod references;
mod resolve;
mod syntax;
mod targets;

use crate::typescript::typed::sources::is_declaration_file;
use crate::typescript::types::nodes::{NodeTable, parse_handle};
use crate::typescript::types::session::Session;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use syntax::Passes;

#[derive(Deserialize)]
pub struct FileInput {
    pub path: String,
    pub role: String,
    #[serde(default, rename = "packageDir")]
    pub package_dir: Option<String>,
    #[serde(rename = "insideProject")]
    pub inside_project: bool,
    pub ownable: bool,
}

/// What the Node side knows about the project: whether components count, and each root file's role.
#[derive(Deserialize)]
pub struct Input {
    pub react: bool,
    pub files: HashMap<String, FileInput>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Reference {
    pub kind: &'static str,
    pub passes: Option<Passes>,
    pub role: String,
    #[serde(rename = "packageDir")]
    pub package_dir: Option<String>,
}

#[derive(Serialize)]
pub struct Member {
    pub name: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
    pub line: u32,
    #[serde(skip)]
    pub declaration: String,
}

#[derive(Serialize)]
pub struct Target {
    pub name: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
    pub kind: &'static str,
    pub index: usize,
    pub members: Vec<Member>,
    pub refs: Vec<Reference>,
}

#[derive(Serialize, Default)]
pub struct Registry {
    pub targets: Vec<Target>,
    pub cloned: Vec<Reference>,
    #[serde(skip)]
    by_declaration: HashMap<String, usize>,
    #[serde(skip)]
    names: HashSet<String>,
}

pub struct Analysis<'a> {
    pub session: &'a mut Session,
    pub input: &'a Input,
    /// Root files of the program that are not declarations, in program order.
    pub files: Vec<String>,
    /// The files among them whose declarations are checked.
    pub owned: HashSet<String>,
    pub registry: Registry,
}

impl Analysis<'_> {
    pub fn table(&mut self, path: &str) -> Result<Rc<NodeTable>, String> {
        self.session.table(path)
    }
}

/// The node a declaration handle names, with the tree it is in.
pub fn declared(analysis: &mut Analysis, handle: &str) -> Result<(Rc<NodeTable>, u32), String> {
    let (index, _, path) = parse_handle(handle).ok_or_else(|| format!("unexpected node handle {handle}"))?;
    Ok((analysis.table(path)?, index))
}

fn is_generated(table: &NodeTable) -> bool {
    static MARKER: std::sync::LazyLock<Regex> =
        std::sync::LazyLock::new(|| Regex::new(r"(?i)@generated|auto-?generated|generated (?:by|from|file)|do not (?:edit|modify)").expect("pattern"));
    let source = table.source();
    MARKER.is_match(source.slice(0, source.units().min(1000)))
}

pub fn check(session: &mut Session, input: &Input) -> Result<Registry, String> {
    let files: Vec<String> = session.files.iter().filter(|name| input.files.contains_key(*name) && !is_declaration_file(name)).cloned().collect();
    let mut analysis = Analysis { session, input, files, owned: HashSet::new(), registry: Registry::default() };
    for name in analysis.files.clone() {
        if input.files[&name].ownable && !is_generated(&*analysis.table(&name)?) {
            analysis.owned.insert(name);
        }
    }
    targets::collect(&mut analysis)?;
    targets::register_wrapper_aliases(&mut analysis)?;
    references::collect(&mut analysis)?;
    Ok(analysis.registry)
}
