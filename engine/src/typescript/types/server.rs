//! The questions the engine asks the API server, one method each. Answers are plain data: ids of types
//! and symbols stay valid for the life of the snapshot.
use super::channel::Channel;
use super::nodes::NodeTable;
use serde::Deserialize;
use serde_json::{Value, json};
use std::path::Path;

#[derive(Deserialize, Clone, Debug)]
pub struct Symbol {
    pub id: u64,
    #[serde(deserialize_with = "plain_name")]
    pub name: String,
    #[serde(default)]
    pub flags: u32,
    #[serde(default)]
    pub declarations: Vec<String>,
    #[serde(default, rename = "valueDeclaration")]
    pub value_declaration: Option<String>,
}

/// The server sends names as the compiler stores them: a name that starts with two underscores has a third
/// one in front. Callers get the name as written in the source.
fn plain_name<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<String, D::Error> {
    let name = String::deserialize(deserializer)?;
    Ok(unescaped(name))
}

pub fn unescaped(mut name: String) -> String {
    if let Some(private) = name.strip_prefix("__#").and_then(|rest| rest.split_once('@')).map(|(_, private)| private).filter(|private| private.starts_with('#')) {
        return private.to_string();
    }
    if name.starts_with("___") {
        name.remove(0);
    }
    name
}

/// A name as the compiler stores it, for questions that take a name.
pub fn escaped(name: &str) -> String {
    if name.starts_with("__") { format!("_{name}") } else { name.to_string() }
}

#[derive(Deserialize, Clone, Debug)]
pub struct Type {
    pub id: u64,
    pub flags: u32,
    #[serde(default, rename = "objectFlags")]
    pub object_flags: u32,
    #[serde(default)]
    pub symbol: Option<u64>,
    #[serde(default, rename = "aliasSymbol")]
    pub alias_symbol: Option<u64>,
    #[serde(default)]
    pub value: Option<Value>,
    #[serde(default, rename = "intrinsicName")]
    pub intrinsic_name: Option<String>,
}

#[derive(Deserialize, Clone, Debug)]
pub struct Signature {
    pub id: u64,
    #[serde(default)]
    pub declaration: Option<String>,
}

pub struct Project {
    pub id: String,
    pub root_dir: Option<String>,
    pub options: Value,
}

pub struct Server {
    pub channel: Channel,
    snapshot: u64,
}

impl Server {
    pub fn start(executable: &Path, directory: &Path) -> Result<Server, String> {
        let mut channel = Channel::start(executable, directory).map_err(|error| format!("cannot start {}: {error}", executable.display()))?;
        channel.request("initialize", b"null")?;
        Ok(Server { channel, snapshot: 0 })
    }

    fn ask(&mut self, method: &str, parameters: Value) -> Result<Value, String> {
        let body = self.channel.request(method, parameters.to_string().as_bytes())?;
        if body.is_empty() {
            return Ok(Value::Null);
        }
        serde_json::from_slice(&body).map_err(|error| format!("{method}: {error}"))
    }

    fn read<T: for<'de> Deserialize<'de>>(&mut self, method: &str, parameters: Value) -> Result<T, String> {
        let body = self.channel.request(method, parameters.to_string().as_bytes())?;
        serde_json::from_slice(if body.is_empty() { b"null" } else { &body }).map_err(|error| format!("{method}: {error}"))
    }

    /// Loads the project of one tsconfig. The program is built here; types are computed when first asked.
    pub fn open(&mut self, tsconfig: &str) -> Result<Project, String> {
        let answer = self.ask("updateSnapshot", json!({ "openProjects": [tsconfig] }))?;
        self.snapshot = answer["snapshot"].as_u64().ok_or("no snapshot")?;
        let project = answer["projects"]
            .as_array()
            .and_then(|projects| projects.iter().find(|project| project["configFileName"] == tsconfig))
            .ok_or_else(|| format!("{tsconfig} is not among the opened projects"))?;
        Ok(Project {
            id: project["id"].as_str().unwrap_or_default().to_string(),
            root_dir: project["compilerOptions"]["rootDir"].as_str().map(String::from),
            options: project["compilerOptions"].clone(),
        })
    }

    pub fn source_file_names(&mut self, project: &Project) -> Result<Vec<String>, String> {
        self.read("getSourceFileNames", json!({ "snapshot": self.snapshot, "project": project.id }))
    }

    pub fn node_table(&mut self, project: &Project, file: &str) -> Result<NodeTable, String> {
        let parameters = json!({ "snapshot": self.snapshot, "project": project.id, "file": file });
        NodeTable::read(self.channel.request("getSourceFile", parameters.to_string().as_bytes())?).map_err(|error| format!("{file}: {error}"))
    }

    pub fn symbols_at(&mut self, project: &Project, locations: &[String]) -> Result<Vec<Option<Symbol>>, String> {
        if locations.is_empty() {
            return Ok(Vec::new());
        }
        self.read("getSymbolsAtLocations", json!({ "snapshot": self.snapshot, "project": project.id, "locations": locations }))
    }

    /// Symbols of the tokens that start at these offsets of one file: no node table needed.
    pub fn symbols_at_positions(&mut self, project: &Project, file: &str, positions: &[u32]) -> Result<Vec<Option<Symbol>>, String> {
        if positions.is_empty() {
            return Ok(Vec::new());
        }
        self.read("getSymbolsAtPositions", json!({ "snapshot": self.snapshot, "project": project.id, "file": file, "positions": positions }))
    }

    pub fn types_at(&mut self, project: &Project, locations: &[String]) -> Result<Vec<Option<Type>>, String> {
        if locations.is_empty() {
            return Ok(Vec::new());
        }
        self.read("getTypeAtLocations", json!({ "snapshot": self.snapshot, "project": project.id, "locations": locations }))
    }

    pub fn symbol_of_type(&mut self, project: &Project, kind: &Type) -> Result<Option<Symbol>, String> {
        if kind.symbol.is_none() {
            return Ok(None);
        }
        self.read("getSymbolOfType", json!({ "snapshot": self.snapshot, "project": project.id, "objectId": kind.id }))
    }

    pub fn properties_of(&mut self, project: &Project, kind: u64) -> Result<Vec<Symbol>, String> {
        let found: Option<Vec<Symbol>> = self.read("getPropertiesOfType", json!({ "snapshot": self.snapshot, "project": project.id, "type": kind }))?;
        Ok(found.unwrap_or_default())
    }

    pub fn property_of(&mut self, project: &Project, kind: u64, name: &str) -> Result<Option<Symbol>, String> {
        self.read("getPropertyOfType", json!({ "snapshot": self.snapshot, "project": project.id, "type": kind, "name": name }))
    }

    pub fn type_of_symbol_at(&mut self, project: &Project, symbol: u64, location: &str) -> Result<Option<Type>, String> {
        self.read("getTypeOfSymbolAtLocation", json!({ "snapshot": self.snapshot, "project": project.id, "symbol": symbol, "location": location }))
    }

    /// `construct` false asks for call signatures.
    pub fn signatures_of(&mut self, project: &Project, kind: u64, construct: bool) -> Result<Vec<Signature>, String> {
        let found: Option<Vec<Signature>> =
            self.read("getSignaturesOfType", json!({ "snapshot": self.snapshot, "project": project.id, "type": kind, "kind": u8::from(construct) }))?;
        Ok(found.unwrap_or_default())
    }

    pub fn type_text(&mut self, project: &Project, kind: u64) -> Result<String, String> {
        self.read("typeToString", json!({ "snapshot": self.snapshot, "project": project.id, "type": kind }))
    }

    /// Any other question, decoded: `parameters` without the snapshot and the project.
    pub fn answer<T: for<'de> Deserialize<'de>>(&mut self, project: &Project, method: &str, mut parameters: Value) -> Result<T, String> {
        parameters["snapshot"] = json!(self.snapshot);
        parameters["project"] = json!(project.id);
        self.read(method, parameters)
    }

    /// Many questions of one method in one exchange, answers in the order of the questions.
    pub fn answer_many<T: for<'de> Deserialize<'de>>(&mut self, project: &Project, method: &str, parameters: Vec<Value>) -> Result<Vec<T>, String> {
        let payloads: Vec<Vec<u8>> = parameters
            .into_iter()
            .map(|mut parameters| {
                parameters["snapshot"] = json!(self.snapshot);
                parameters["project"] = json!(project.id);
                parameters.to_string().into_bytes()
            })
            .collect();
        self.channel
            .request_many(method, &payloads)?
            .iter()
            .map(|body| serde_json::from_slice(if body.is_empty() { b"null" } else { body }).map_err(|error| format!("{method}: {error}")))
            .collect()
    }

    /// Any other method of the server, for questions that have no wrapper yet.
    pub fn raw(&mut self, project: &Project, method: &str, mut parameters: Value) -> Result<Value, String> {
        parameters["snapshot"] = json!(self.snapshot);
        parameters["project"] = json!(project.id);
        self.ask(method, parameters)
    }
}
