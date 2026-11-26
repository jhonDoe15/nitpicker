//! What a typed rule asks the compiler, for the file being linted: the type of a node, the parts of a union,
//! a property, the owner of a declaration. Answers are kept for the run; the first error of the server ends it.
use super::offsets::Utf16;
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::server::{Symbol, Type};
use crate::typescript::types::session::Session;
use crate::typescript::types::tables::type_flags;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

pub struct Types {
    session: Session,
    program: HashSet<String>,
    file: String,
    offsets: Utf16,
    apparent: HashMap<u64, Option<Rc<Type>>>,
    parts: HashMap<u64, Rc<Vec<Type>>>,
    owners: HashMap<String, Option<String>>,
    /// The first question of this file the server could not answer: the file goes back to the plugin rules.
    pub refused: Option<String>,
}

pub fn compiler_path(path: &str) -> String {
    let absolute = std::path::absolute(path).map(|absolute| absolute.to_string_lossy().into_owned()).unwrap_or_else(|_| path.to_string());
    absolute.replace('\\', "/")
}


impl Types {
    pub fn open(compiler: &std::path::Path, tsconfig: &str) -> Result<Types, String> {
        let session = Session::open(compiler, tsconfig)?;
        let program = session.files.iter().cloned().collect();
        Ok(Types { session, program, file: String::new(), offsets: Utf16::of(""), apparent: HashMap::new(), parts: HashMap::new(), owners: HashMap::new(), refused: None })
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
        self.offsets = Utf16::of(text);
        self.refused = None;
        true
    }

    fn answered<T: Default>(&mut self, answer: Result<T, String>) -> T {
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

pub fn is_string_literal(kind: &Type) -> bool {
    kind.flags & type_flags::STRING_LITERAL != 0
}
