//! Date questions for `no-local-time-zone`: default library `Date` members and the names of a value's types.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::{kind, type_flags};
use serde_json::json;

const NULLISH: u32 = type_flags::UNDEFINED | type_flags::NULL | type_flags::VOID;

impl Types {
    /// `isLibraryDateMember`: every declaration of the symbol at a property is a member written in an interface
    /// named `Date` of a default library file.
    pub fn is_library_date_member(&mut self, start: u32, end: u32) -> bool {
        let Some(handle) = self.handle_at(None, start, end) else {
            self.refuse("no node for a date member");
            return false;
        };
        let found = self.session.symbol_at(&handle);
        let Some(symbol) = self.answered(found) else { return false };
        if symbol.declarations.is_empty() {
            return false;
        }
        symbol.declarations.iter().all(|declaration| self.is_date_member(declaration))
    }

    fn is_date_member(&mut self, declaration: &str) -> bool {
        let Some((index, _, path)) = parse_handle(declaration) else { return false };
        let table = self.session.table(path);
        let Some(table) = self.answered(table.map(Some)) else { return false };
        let owner = table.parent(index).filter(|parent| table.kind(*parent) == kind::INTERFACE_DECLARATION);
        let named = owner.and_then(|owner| table.child(owner, "name")).and_then(|name| table.text(name).map(|text| text == "Date"));
        named == Some(true) && self.file_kind(declaration).default_library
    }

    /// `withoutReadonly`: the argument of a `Readonly<T>` alias, the type itself otherwise.
    fn without_readonly(&mut self, kind: &Type) -> Type {
        if kind.alias_symbol.is_none() {
            return kind.clone();
        }
        let alias = self.alias_name(kind);
        if alias.as_deref() != Some("Readonly") {
            return kind.clone();
        }
        let found: Result<Option<Vec<Type>>, String> = self.session.ask("getAliasTypeArgumentsOfType", json!({ "objectId": kind.id }));
        match self.answered(found).as_deref() {
            Some([only]) => only.clone(),
            _ => kind.clone(),
        }
    }

    /// `typeNames`: the symbol name of each member of the node's type that is not nullish.
    pub fn zone_type_names(&mut self, start: u32, end: u32) -> Vec<Option<String>> {
        let Some(found) = self.type_at(start, end) else {
            self.refuse("no type for a date value");
            return Vec::new();
        };
        let whole = self.without_readonly(&found);
        let parts = if whole.flags & type_flags::UNION != 0 { self.parts(&whole).to_vec() } else { vec![whole] };
        let mut names = Vec::new();
        for part in parts.iter().filter(|part| part.flags & NULLISH == 0) {
            let plain = self.without_readonly(part);
            names.push(self.symbol(&plain).map(|symbol| symbol.name.clone()));
        }
        names
    }
}
