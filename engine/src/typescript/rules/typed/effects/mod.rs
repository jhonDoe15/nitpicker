//! Questions of the effects analysis: what a name resolves to through aliases and shorthand properties, the
//! declaration of a value's type, what kind of file a declaration is in, and whether a call's value is awaitable.
pub mod store;

use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::Symbol;
use crate::typescript::types::tables::type_flags;
use serde::Deserialize;
use serde_json::json;
use std::rc::Rc;

#[derive(Deserialize, Default, Clone, Copy)]
pub struct FileOrigin {
    #[serde(default, rename = "isDefaultLibrary")]
    pub default_library: bool,
    #[serde(default, rename = "isFromExternalLibrary")]
    pub external_library: bool,
}

impl Types {
    /// `getSymbolAtLocation`; an index signature access answers no symbol, as in TypeScript 6.
    pub fn symbol_at_handle(&mut self, handle: &str) -> Option<Rc<Symbol>> {
        let found = self.session.symbol_at(handle);
        self.answered(found.map(Some)).flatten().filter(|symbol| symbol.name != "__index")
    }

    /// `getAliasedSymbol` when the symbol is an alias.
    pub fn unaliased(&mut self, symbol: Option<Rc<Symbol>>) -> Option<Rc<Symbol>> {
        let found = self.session.resolved(symbol);
        self.answered(found.map(Some)).flatten()
    }

    /// `getShorthandAssignmentValueSymbol` of a shorthand property assignment.
    pub fn shorthand_value_symbol(&mut self, handle: &str) -> Option<Rc<Symbol>> {
        let found: Result<Option<Symbol>, String> = self.session.ask("getShorthandAssignmentValueSymbol", json!({ "location": handle }));
        self.answered(found).map(Rc::new)
    }

    /// `(type.aliasSymbol ?? type.getSymbol())?.declarations?.[0]` of the non-nullable type at the node.
    pub fn type_declaration(&mut self, handle: &str) -> Option<String> {
        let kind = self.type_at_handle(handle)?;
        let kind = self.non_nullable(&kind)?;
        let symbol = if kind.alias_symbol.is_some() {
            let found: Result<Option<Symbol>, String> = self.session.ask("getAliasSymbolOfType", json!({ "objectId": kind.id }));
            self.answered(found).map(Rc::new)
        } else {
            self.symbol(&kind)
        };
        symbol?.declarations.first().cloned()
    }

    /// Whether the file is a default library file and whether it was loaded as an external library.
    pub fn file_origin(&mut self, path: &str) -> FileOrigin {
        let key = format!("origin:{path}");
        if let Some(known) = self.kept.get(&key) {
            let external = self.kept.get(&format!("external:{path}")).copied().unwrap_or_default();
            return FileOrigin { default_library: *known, external_library: external };
        }
        let found: Result<Option<FileOrigin>, String> = self.session.ask("getSourceFileMetadata", json!({ "file": path }));
        let found = self.answered(found).unwrap_or_default();
        if self.refused.is_none() {
            self.kept.insert(key, found.default_library);
            self.kept.insert(format!("external:{path}"), found.external_library);
        }
        found
    }

    /// `isAsyncCall` without its callback test: the call's type is `any`, or some member of it has a `then`
    /// that can be called.
    pub fn is_awaitable_call(&mut self, call: &str) -> bool {
        let Some(kind) = self.type_at_handle(call) else { return false };
        if kind.flags & type_flags::ANY != 0 {
            return true;
        }
        let parts = if kind.flags & type_flags::UNION != 0 { self.parts(&kind).to_vec() } else { vec![kind] };
        for part in parts {
            let Some(apparent) = self.apparent(&part) else { continue };
            let Some(then) = self.property(&apparent, "then") else { continue };
            let found = self.session.server.type_of_symbol_at(&self.session.project, then.id, call);
            let Some(callable) = self.answered(found) else { continue };
            if self.signature_count(&callable, false) > 0 {
                return true;
            }
        }
        false
    }

    /// The declarations of a property of the type at the node: `getPropertyOfType(getTypeAtLocation(node), name)`.
    pub fn property_declarations(&mut self, handle: &str, name: &str) -> Vec<String> {
        let Some(kind) = self.type_at_handle(handle) else { return Vec::new() };
        self.property(&kind, name).map(|symbol| symbol.declarations.clone()).unwrap_or_default()
    }

    /// The files of the program, in the compiler's order.
    pub fn program_files(&self) -> Vec<String> {
        self.session.files.clone()
    }
}
