//! What a typed rule asks the compiler, for the file being linted: the type of a node, the parts of a union,
//! a property, the owner of a declaration. Answers are kept for the run; the first error of the server ends it.
use super::offsets::Utf16;
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::server::{Signature, Symbol, Type, escaped};
use crate::typescript::types::session::Session;
use crate::typescript::types::tables::{kind, type_flags};
use serde::Deserialize;
use serde::de::DeserializeOwned;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

pub struct Types {
    pub(crate) session: Session,
    program: HashSet<String>,
    file: String,
    offsets: Utf16,
    apparent: HashMap<u64, Option<Rc<Type>>>,
    parts: HashMap<u64, Rc<Vec<Type>>>,
    owners: HashMap<String, Option<String>>,
    answers: HashMap<(&'static str, u64), serde_json::Value>,
    files: HashMap<String, FileKind>,
    located: HashMap<(u32, u32), Option<Type>>,
    /// Verdicts a rule keeps for the run, by a key of its own; type ids stay valid for the whole session.
    pub kept: HashMap<String, bool>,
    /// State a rule keeps for the whole run, one value per type (see `effects::store`).
    pub(crate) stores: HashMap<std::any::TypeId, Box<dyn std::any::Any>>,
    /// The first question of this file the server could not answer: the file goes back to the plugin rules.
    pub refused: Option<String>,
}

#[derive(Deserialize, Default, Clone, Copy)]
pub struct FileKind {
    #[serde(default, rename = "isDefaultLibrary")]
    pub default_library: bool,
}

#[derive(Deserialize)]
struct IndexInfo {
    #[serde(default, rename = "isReadonly")]
    readonly: bool,
}

pub fn compiler_path(path: &str) -> String {
    let absolute = std::path::absolute(path).map(|absolute| absolute.to_string_lossy().into_owned()).unwrap_or_else(|_| path.to_string());
    absolute.replace('\\', "/")
}

impl Types {
    pub fn open(compiler: &std::path::Path, tsconfig: &str) -> Result<Types, String> {
        let session = Session::open(compiler, tsconfig)?;
        let program = session.files.iter().cloned().collect();
        Ok(Types { session, program, file: String::new(), offsets: Utf16::of(""), apparent: HashMap::new(), parts: HashMap::new(), owners: HashMap::new(), answers: HashMap::new(), files: HashMap::new(), located: HashMap::new(), kept: HashMap::new(), stores: HashMap::new(), refused: None })
    }

    /// Whether the program has this file, and if so, makes it the file that later questions are about.
    pub fn enter(&mut self, path: &str, text: &str) -> bool {
        let file = compiler_path(path);
        if !self.program.contains(&file) {
            return false;
        }
        if !self.file.is_empty() && self.file != file {
            self.session.release_table(&self.file.clone());
        }
        self.file = file;
        self.located.clear();
        self.offsets = Utf16::of(text);
        self.refused = None;
        true
    }

    pub(crate) fn answered<T: Default>(&mut self, answer: Result<T, String>) -> T {
        answer.unwrap_or_else(|error| {
            if std::env::var_os("NITPICKER_ENGINE_TRACE").is_some() {
                eprintln!("{}: {}", self.file, error.lines().next().unwrap_or_default());
            }
            self.refused.get_or_insert(error);
            T::default()
        })
    }

    /// `getTypeAtLocation` of the compiler's node with this extent (byte offsets of the engine's tree).
    pub fn type_at(&mut self, start: u32, end: u32) -> Option<Type> {
        if let Some(known) = self.located.get(&(start, end)) {
            return known.clone();
        }
        let found = self.type_of_extent(start, end);
        if self.refused.is_none() {
            self.located.insert((start, end), found.clone());
        }
        found
    }

    fn type_of_extent(&mut self, start: u32, end: u32) -> Option<Type> {
        let file = self.file.clone();
        let (start, end) = (self.offsets.at(start), self.offsets.at(end));
        let handle = self.session.handle(&file, None, start, end);
        let handle = self.answered(handle)?;
        let found = self.session.types_at(&[handle]);
        self.answered(found).pop().flatten()
    }

    pub fn apparent(&mut self, kind: &Type) -> Option<Rc<Type>> {
        if let Some(known) = self.apparent.get(&kind.id) {
            return known.clone();
        }
        let found: Result<Option<Type>, String> = self.session.ask("getApparentType", json!({ "type": kind.id }));
        let found = self.answered(found).map(Rc::new);
        if self.refused.is_none() {
            self.apparent.insert(kind.id, found.clone());
        }
        found
    }

    /// The members of a union or an intersection, or the type itself.
    pub fn parts(&mut self, kind: &Type) -> Rc<Vec<Type>> {
        if kind.flags & type_flags::UNION_OR_INTERSECTION == 0 {
            return Rc::new(vec![kind.clone()]);
        }
        if let Some(known) = self.parts.get(&kind.id) {
            return Rc::clone(known);
        }
        let found: Result<Option<Vec<Type>>, String> = self.session.ask("getTypesOfType", json!({ "objectId": kind.id }));
        let found = Rc::new(self.answered(found).unwrap_or_default());
        if self.refused.is_none() {
            self.parts.insert(kind.id, Rc::clone(&found));
        }
        found
    }

    pub fn property(&mut self, kind: &Type, name: &str) -> Option<Rc<Symbol>> {
        let found = self.session.property_of(kind.id, name);
        self.answered(found)
    }

    /// A question about one type, asked once for the run.
    pub(crate) fn about<T: DeserializeOwned + Default>(&mut self, method: &'static str, kind: u64, parameters: serde_json::Value) -> T {
        if let Some(known) = self.answers.get(&(method, kind)) {
            return serde_json::from_value(known.clone()).unwrap_or_default();
        }
        let asked = method.split(':').next().unwrap_or(method);
        let found: Result<serde_json::Value, String> = self.session.ask(asked, parameters);
        let found = self.answered(found);
        if self.refused.is_none() {
            self.answers.insert((method, kind), found.clone());
        }
        serde_json::from_value(found).unwrap_or_default()
    }

    pub fn non_nullable(&mut self, kind: &Type) -> Option<Type> {
        self.about("getNonNullableType", kind.id, json!({ "type": kind.id }))
    }

    pub fn base_constraint(&mut self, kind: &Type) -> Option<Type> {
        self.about("getBaseConstraintOfType", kind.id, json!({ "type": kind.id }))
    }

    /// The generic type a type reference instantiates, when the type is one.
    pub fn target(&mut self, kind: &Type) -> Option<Type> {
        kind.target?;
        self.about("getTargetOfType", kind.id, json!({ "objectId": kind.id }))
    }

    pub fn base_types(&mut self, kind: &Type) -> Vec<Type> {
        let found: Option<Vec<Type>> = self.about("getBaseTypes", kind.id, json!({ "type": kind.id }));
        found.unwrap_or_default()
    }

    /// Whether the type has an index signature that is not read-only.
    pub fn has_mutable_index(&mut self, kind: &Type) -> bool {
        let found: Option<Vec<IndexInfo>> = self.about("getIndexInfosOfType", kind.id, json!({ "type": kind.id }));
        found.unwrap_or_default().iter().any(|info| !info.readonly)
    }

    pub fn signature_count(&mut self, kind: &Type, construct: bool) -> usize {
        let method = if construct { "getSignaturesOfType:construct" } else { "getSignaturesOfType" };
        let found: Option<Vec<serde_json::Value>> = self.about(method, kind.id, json!({ "type": kind.id, "kind": u8::from(construct) }));
        found.map_or(0, |signatures| signatures.len())
    }

    pub fn symbol(&mut self, kind: &Type) -> Option<Rc<Symbol>> {
        let found = self.session.symbol_of_type(kind);
        self.answered(found)
    }

    pub fn properties(&mut self, kind: &Type) -> Vec<Symbol> {
        let found: Option<Vec<Symbol>> = self.about("getPropertiesOfType", kind.id, json!({ "type": kind.id }));
        found.unwrap_or_default()
    }

    pub fn named_property(&mut self, kind: &Type, name: &str) -> Option<Rc<Symbol>> {
        self.property(kind, &escaped(name))
    }

    /// Whether the file of a declaration is a default library file.
    pub fn file_kind(&mut self, declaration: &str) -> FileKind {
        let Some((_, _, path)) = parse_handle(declaration) else { return FileKind::default() };
        if let Some(known) = self.files.get(path) {
            return *known;
        }
        let found: Result<Option<FileKind>, String> = self.session.ask("getSourceFileMetadata", json!({ "file": path }));
        let found = self.answered(found).unwrap_or_default();
        if self.refused.is_none() {
            self.files.insert(path.to_string(), found);
        }
        found
    }

    /// The file questions are about, as the compiler names it.
    pub fn file(&self) -> &str {
        &self.file
    }

    /// Leaves the file to the ESLint-plugin rule when a question has no trustworthy answer.
    pub fn refuse(&mut self, reason: &str) {
        self.refused.get_or_insert_with(|| reason.to_string());
    }

    /// The compiler's name for the node of this kind and extent (byte offsets of the engine's tree).
    pub fn handle_at(&mut self, kind: Option<u32>, start: u32, end: u32) -> Option<String> {
        let file = self.file.clone();
        let (start, end) = (self.offsets.at(start), self.offsets.at(end));
        let handle = self.session.handle(&file, kind, start, end);
        self.answered(handle)
    }

    /// The declaration of the signature `getResolvedSignature` picks for a call or `new` expression.
    pub fn resolved_declaration(&mut self, call: u32, start: u32, end: u32) -> Option<String> {
        let handle = self.handle_at(Some(call), start, end)?;
        let found: Result<Option<Signature>, String> = self.session.ask("getResolvedSignature", json!({ "location": handle }));
        self.answered(found)?.declaration
    }

    /// The names of a signature declaration's leading plain parameters, `this` left out, up to the first rest
    /// or destructured one; `None` for a documentation comment's signature or one outside the project's sources.
    pub fn leading_parameters(&mut self, declaration: &str) -> Option<Vec<String>> {
        let (index, _, path) = parse_handle(declaration)?;
        if is_declaration_file(path) || path.contains("/node_modules/") || self.file_kind(declaration).default_library {
            return None;
        }
        let table = self.session.table(path);
        let table = self.answered(table.map(Some))?;
        if table.kind(index) == kind::JS_DOC_SIGNATURE || table.is_reparsed(index) {
            return None;
        }
        let mut names = Vec::new();
        for parameter in table.listed(index, "parameters") {
            let name = table.child(parameter, "name").filter(|name| table.kind(*name) == kind::IDENTIFIER);
            let Some(name) = name.filter(|_| table.child(parameter, "dotDotDotToken").is_none()) else { break };
            let text = table.text(name).unwrap_or_default();
            if text != "this" {
                names.push(text.into_owned());
            }
        }
        Some(names)
    }

    /// `declaration.parent.name.text`: the name of what declares the declaration, when it has a plain one.
    pub fn owner_name(&mut self, declaration: &str) -> Option<String> {
        if let Some(known) = self.owners.get(declaration) {
            return known.clone();
        }
        let (index, _, path) = parse_handle(declaration)?;
        let table = self.session.table(path);
        let table = self.answered(table.map(Some))?;
        let found = table.parent(index).and_then(|parent| table.child(parent, "name")).and_then(|name| table.text(name).map(|text| text.into_owned()));
        self.owners.insert(declaration.to_string(), found.clone());
        found
    }
}

/// `isDeclarationFileName`: `.d.mts`, `.d.cts`, or a `.ts` name with `.d.` in it.
pub fn is_declaration_file(path: &str) -> bool {
    let name = path.rsplit('/').next().unwrap_or(path);
    name.ends_with(".d.mts") || name.ends_with(".d.cts") || (name.ends_with(".ts") && name.contains(".d."))
}

pub fn is_string_literal(kind: &Type) -> bool {
    kind.flags & type_flags::STRING_LITERAL != 0
}
