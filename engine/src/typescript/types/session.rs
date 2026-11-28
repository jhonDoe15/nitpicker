//! One server and one loaded project for a whole engine run. Every typed check asks through the same session,
//! so the program is loaded once, each type is computed once, and answers that several checks need are kept.
use super::compiler;
use super::nodes::NodeTable;
use super::server::{Project, Server, Symbol, Type};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::rc::Rc;
use std::time::Instant;

const KEPT_METHODS: [&str; 5] = ["getNonNullableType", "typeToString", "getTypeFromTypeNode", "getAliasSymbolOfType", "getApparentType"];

#[derive(Serialize, Default, Clone)]
pub struct SessionCounts {
    pub program_files: usize,
    pub open_ms: u128,
    pub node_tables: usize,
    pub places_not_found: usize,
    pub requests: u64,
    pub bytes_sent: u64,
    pub bytes_received: u64,
    pub waiting_on_compiler_ms: u128,
}

pub struct Session {
    pub server: Server,
    pub project: Project,
    /// The compiler version, one of `compiler::SUPPORTED`.
    pub version: String,
    /// Folder of the tsconfig.
    pub directory: String,
    /// `rootDir` of the project, or the folder of the tsconfig.
    pub root: String,
    /// Every file of the program, as the compiler names it.
    pub files: Vec<String>,
    tables: HashMap<String, Rc<NodeTable>>,
    type_symbols: HashMap<u64, Option<Rc<Symbol>>>,
    properties: HashMap<(u64, String), Option<Rc<Symbol>>>,
    located: HashMap<String, Option<Rc<Symbol>>>,
    aliased: HashMap<u64, Option<Rc<Symbol>>>,
    exports: HashMap<u64, Rc<Vec<Rc<Symbol>>>>,
    answers: HashMap<(String, String), serde_json::Value>,
    pub counts: SessionCounts,
}

impl Session {
    /// Starts the server and loads the project. Any error here means "no types from this compiler": the
    /// caller reports it and the check runs elsewhere.
    pub fn open(executable: &Path, tsconfig: &str) -> Result<Session, String> {
        let started = Instant::now();
        let version = compiler::supported_version(executable)?;
        let absolute = std::path::absolute(tsconfig).map_err(|error| format!("{tsconfig}: {error}"))?;
        let tsconfig = absolute.to_str().ok_or("the tsconfig path is not UTF-8")?.replace('\\', "/");
        let directory = Path::new(&tsconfig).parent().and_then(Path::to_str).ok_or("the tsconfig has no folder")?.to_string();
        if !Path::new(&tsconfig).is_file() {
            return Err(format!("{tsconfig} does not exist"));
        }
        let mut server = Server::start(executable, Path::new(&directory))?;
        let project = server.open(&tsconfig)?;
        let problems = server.raw(&project, "getConfigFileParsingDiagnostics", serde_json::json!({}))?;
        if let Some(first) = problems.as_array().and_then(|problems| problems.first()) {
            return Err(format!("{tsconfig} has configuration errors: {}", first["text"].as_str().unwrap_or("unknown")));
        }
        // A compiler option this compiler no longer has (a `baseUrl`, an old module resolution) is reported here
        // and otherwise ignored, so the program would differ from the one the option's author gets.
        let rejected = server.raw(&project, "getProgramDiagnostics", serde_json::json!({}))?;
        let is_option_error = |problem: &&serde_json::Value| problem["code"].as_u64().is_some_and(|code| (5000..6000).contains(&code));
        if let Some(first) = rejected.as_array().and_then(|problems| problems.iter().find(is_option_error)) {
            return Err(format!("{tsconfig} uses compiler options this compiler rejects: {}", first["text"].as_str().unwrap_or("unknown")));
        }
        let files = server.source_file_names(&project)?;
        let root = project.root_dir.clone().unwrap_or_else(|| directory.clone()).trim_end_matches('/').to_string();
        let counts = SessionCounts { program_files: files.len(), open_ms: started.elapsed().as_millis(), ..SessionCounts::default() };
        Ok(Session { server, project, version, directory, root, files, tables: HashMap::new(), type_symbols: HashMap::new(), properties: HashMap::new(), located: HashMap::new(), aliased: HashMap::new(), exports: HashMap::new(), answers: HashMap::new(), counts })
    }

    /// A path of the program relative to the source root, when it is inside it.
    pub fn relative<'p>(&self, path: &'p str) -> Option<&'p str> {
        path.strip_prefix(self.root.as_str())?.strip_prefix('/')
    }

    /// The compiler's node table of a file, fetched once.
    pub fn table(&mut self, path: &str) -> Result<Rc<NodeTable>, String> {
        if let Some(table) = self.tables.get(path) {
            return Ok(Rc::clone(table));
        }
        let table = Rc::new(self.server.node_table(&self.project, path)?);
        self.tables.insert(path.to_string(), Rc::clone(&table));
        self.counts.node_tables += 1;
        Ok(table)
    }

    /// Whether the node table of a file is kept.
    pub fn has_table(&self, path: &str) -> bool {
        self.tables.contains_key(path)
    }

    /// Forgets the node table of a file, for checks that visit each file once.
    pub fn release_table(&mut self, path: &str) {
        self.tables.remove(path);
    }

    /// The compiler's name for a node of the engine's tree: its kind there (or `None` for "the expression
    /// with this extent") and its extent in UTF-16 units.
    pub fn handle(&mut self, path: &str, kind: Option<u32>, start: u32, end: u32) -> Result<Option<String>, String> {
        let table = self.table(path)?;
        let found = match kind {
            Some(kind) => table.find(kind, start, end),
            None => table.find_outer(start, end),
        };
        if found.is_none() {
            if std::env::var_os("NITPICKER_ENGINE_TRACE").is_some() {
                eprintln!("no compiler node for {path} {kind:?} {start}-{end}");
            }
            self.counts.places_not_found += 1;
        }
        Ok(found.map(|index| format!("{index}.{}.{path}", table.kind(index))))
    }

    pub fn symbols_at(&mut self, handles: &[String]) -> Result<Vec<Option<Symbol>>, String> {
        self.server.symbols_at(&self.project, handles)
    }

    pub fn types_at(&mut self, handles: &[String]) -> Result<Vec<Option<Type>>, String> {
        self.server.types_at(&self.project, handles)
    }

    pub fn symbol_of_type(&mut self, kind: &Type) -> Result<Option<Rc<Symbol>>, String> {
        if let Some(known) = self.type_symbols.get(&kind.id) {
            return Ok(known.clone());
        }
        let symbol = self.server.symbol_of_type(&self.project, kind)?.map(Rc::new);
        self.type_symbols.insert(kind.id, symbol.clone());
        Ok(symbol)
    }

    pub fn property_of(&mut self, kind: u64, name: &str) -> Result<Option<Rc<Symbol>>, String> {
        let key = (kind, name.to_string());
        if let Some(known) = self.properties.get(&key) {
            return Ok(known.clone());
        }
        let property = self.server.property_of(&self.project, kind, name)?.map(Rc::new);
        self.properties.insert(key, property.clone());
        Ok(property)
    }

    /// Any question of the server, decoded. Questions whose answer depends only on the snapshot are asked
    /// once per run.
    pub fn ask<T: for<'de> serde::Deserialize<'de>>(&mut self, method: &str, parameters: serde_json::Value) -> Result<T, String> {
        if !KEPT_METHODS.contains(&method) {
            return self.server.answer(&self.project, method, parameters);
        }
        let key = (method.to_string(), parameters.to_string());
        let answer = match self.answers.get(&key) {
            Some(known) => known.clone(),
            None => {
                let answer: serde_json::Value = self.server.answer(&self.project, method, parameters)?;
                self.answers.insert(key, answer.clone());
                answer
            }
        };
        serde_json::from_value(answer).map_err(|error| format!("{method}: {error}"))
    }

    /// `getSymbolAtLocation` of one node, kept for the run.
    pub fn symbol_at(&mut self, handle: &str) -> Result<Option<Rc<Symbol>>, String> {
        if let Some(known) = self.located.get(handle) {
            return Ok(known.clone());
        }
        let symbol: Option<Symbol> = self.ask("getSymbolAtLocation", serde_json::json!({ "location": handle }))?;
        let symbol = symbol.map(Rc::new);
        self.located.insert(handle.to_string(), symbol.clone());
        Ok(symbol)
    }

    /// Fills the kept answers of `symbol_at` for many nodes with one request.
    pub fn symbols_ahead(&mut self, handles: &[String]) -> Result<(), String> {
        let missing: Vec<String> = handles.iter().filter(|handle| !self.located.contains_key(*handle)).cloned().collect();
        let found = self.symbols_at(&missing)?;
        for (handle, symbol) in missing.into_iter().zip(found) {
            self.located.insert(handle, symbol.map(Rc::new));
        }
        Ok(())
    }

    /// Many questions of one method, asked without waiting for each answer.
    pub fn ask_many<T: for<'de> serde::Deserialize<'de>>(&mut self, method: &str, parameters: Vec<serde_json::Value>) -> Result<Vec<T>, String> {
        if parameters.is_empty() {
            return Ok(Vec::new());
        }
        self.server.answer_many(&self.project, method, parameters)
    }

    /// Fills the kept answers of `aliased` for the aliases among these symbols.
    pub fn aliased_ahead<'s>(&mut self, symbols: impl IntoIterator<Item = &'s Symbol>) -> Result<(), String> {
        let mut missing: Vec<u64> = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for symbol in symbols {
            if symbol.flags & super::tables::symbol_flags::ALIAS != 0 && !self.aliased.contains_key(&symbol.id) && seen.insert(symbol.id) {
                missing.push(symbol.id);
            }
        }
        let questions = missing.iter().map(|id| serde_json::json!({ "symbol": id })).collect();
        let found: Vec<Option<Symbol>> = self.ask_many("getAliasedSymbol", questions)?;
        for (id, target) in missing.into_iter().zip(found) {
            self.aliased.insert(id, target.map(Rc::new));
        }
        Ok(())
    }

    /// The kept answer of `symbol_at`, when it was asked.
    pub fn known_symbol_at(&self, handle: &str) -> Option<Option<Rc<Symbol>>> {
        self.located.get(handle).cloned()
    }

    /// What an alias stands for; `None` when it resolves to nothing.
    pub fn aliased(&mut self, symbol: &Symbol) -> Result<Option<Rc<Symbol>>, String> {
        if let Some(known) = self.aliased.get(&symbol.id) {
            return Ok(known.clone());
        }
        let target: Option<Symbol> = self.ask("getAliasedSymbol", serde_json::json!({ "symbol": symbol.id }))?;
        let target = target.map(Rc::new);
        self.aliased.insert(symbol.id, target.clone());
        Ok(target)
    }

    /// The symbol itself, or what it stands for when it is an alias.
    pub fn resolved(&mut self, symbol: Option<Rc<Symbol>>) -> Result<Option<Rc<Symbol>>, String> {
        match symbol {
            Some(symbol) if symbol.flags & super::tables::symbol_flags::ALIAS != 0 => self.aliased(&symbol),
            other => Ok(other),
        }
    }

    pub fn exports_of(&mut self, module: &Symbol) -> Result<Rc<Vec<Rc<Symbol>>>, String> {
        if let Some(known) = self.exports.get(&module.id) {
            return Ok(Rc::clone(known));
        }
        let exports: Option<Vec<Symbol>> = self.ask("getExportsOfModule", serde_json::json!({ "symbol": module.id }))?;
        let exports = Rc::new(exports.unwrap_or_default().into_iter().map(Rc::new).collect::<Vec<_>>());
        self.exports.insert(module.id, Rc::clone(&exports));
        Ok(exports)
    }

    pub fn counts(&self) -> SessionCounts {
        let mut counts = self.counts.clone();
        counts.requests = self.server.channel.requests;
        counts.bytes_sent = self.server.channel.sent;
        counts.bytes_received = self.server.channel.received;
        counts.waiting_on_compiler_ms = self.server.channel.waited.as_millis();
        counts
    }
}
