//! What the spread rules ask: whether a type is an array or a tuple, the member types of a node's type, the type
//! of a property as seen at a spread, and the name of the alias a type was declared under.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::{Symbol, Type};
use crate::typescript::types::tables::type_flags;
use serde_json::json;

impl Types {
    pub fn is_array_type(&mut self, kind: &Type) -> bool {
        self.about("isArrayType", kind.id, json!({ "type": kind.id }))
    }

    pub fn is_tuple_type(&mut self, kind: &Type) -> bool {
        self.about("isTupleType", kind.id, json!({ "type": kind.id }))
    }

    /// The members of the non-nullable type at a node: the parts of a union, or the type alone; `None` when
    /// the compiler gives no type there.
    pub fn non_nullable_members(&mut self, start: u32, end: u32) -> Option<Vec<Type>> {
        let found = self.type_at(start, end)?;
        let kind = self.non_nullable(&found)?;
        if kind.flags & type_flags::UNION == 0 {
            return Some(vec![kind]);
        }
        Some(self.parts(&kind).to_vec())
    }

    /// `getTypeOfSymbolAtLocation` for the node with this extent (byte offsets of the engine's tree).
    pub fn symbol_type_at(&mut self, symbol: &Symbol, start: u32, end: u32) -> Option<Type> {
        let location = self.handle_at(None, start, end)?;
        let found: Result<Option<Type>, String> = self.session.ask("getTypeOfSymbolAtLocation", json!({ "symbol": symbol.id, "location": location }));
        self.answered(found)
    }

    /// The name of the type alias a type was written as (`aliasSymbol.getName()`).
    pub fn alias_name(&mut self, kind: &Type) -> Option<String> {
        kind.alias_symbol?;
        let found: Result<Option<Symbol>, String> = self.session.ask("getAliasSymbolOfType", json!({ "objectId": kind.id }));
        self.answered(found).map(|symbol| symbol.name)
    }
}
