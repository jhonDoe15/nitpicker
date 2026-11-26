//! Whether the type at a node is the compiler's own `UnionType`, `IntersectionType` or
//! `UnionOrIntersectionType`, the types whose `types` list has no promised order.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::parse_handle;
use crate::typescript::types::server::{Symbol, Type};
use serde_json::json;

const MEMBER_LIST_TYPES: [&str; 3] = ["UnionType", "IntersectionType", "UnionOrIntersectionType"];
const COMPILER_PACKAGE: &str = "/node_modules/typescript/";

impl Types {
    /// `getSymbol() ?? aliasSymbol` of a type.
    fn symbol_or_alias(&mut self, kind: &Type) -> Option<Symbol> {
        if let Some(symbol) = self.symbol(kind) {
            return Some((*symbol).clone());
        }
        self.alias_symbol(kind)
    }

    /// `getAliasSymbolOfType`: the alias a type was written as.
    pub fn alias_symbol(&mut self, kind: &Type) -> Option<Symbol> {
        kind.alias_symbol?;
        let found: Result<Option<Symbol>, String> = self.session.ask("getAliasSymbolOfType", json!({ "objectId": kind.id }));
        self.answered(found)
    }

    /// Whether the value with this extent, without null and undefined, has a member list type declared in the
    /// TypeScript package. `None` when the compiler gives no type there.
    pub fn is_member_list(&mut self, start: u32, end: u32) -> Option<bool> {
        let found = self.type_at(start, end)?;
        let kind = self.non_nullable(&found)?;
        let symbol = self.symbol_or_alias(&kind);
        Some(symbol.is_some_and(|symbol| {
            MEMBER_LIST_TYPES.contains(&symbol.name.as_str())
                && symbol.declarations.iter().any(|declaration| parse_handle(declaration).is_some_and(|(_, _, path)| path.contains(COMPILER_PACKAGE)))
        }))
    }
}
