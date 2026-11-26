//! Questions of the write and retry rules.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::Symbol;
use serde_json::json;
use std::rc::Rc;

impl Types {
    /// `type.aliasSymbol ?? type.getSymbol()` of `getTypeAtLocation` at the node with this extent.
    pub fn type_symbol_at(&mut self, start: u32, end: u32) -> Option<Rc<Symbol>> {
        let kind = self.type_at(start, end)?;
        if kind.alias_symbol.is_some() {
            let found: Result<Option<Symbol>, String> = self.session.ask("getAliasSymbolOfType", json!({ "objectId": kind.id }));
            return self.answered(found).map(Rc::new);
        }
        self.symbol(&kind)
    }
}
