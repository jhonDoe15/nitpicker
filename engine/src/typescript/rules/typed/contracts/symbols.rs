//! What the contract rules ask about symbols and types: the declared type of a symbol, the arguments of an alias,
//! the exports of a module, the parameters of a signature and the symbol of the file being linted.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::ROOT;
use crate::typescript::types::server::{Signature, Symbol, Type};
use crate::typescript::types::tables::kind;
use serde_json::json;
use std::rc::Rc;

impl Types {
    /// `getDeclaredTypeOfSymbol`.
    pub fn declared_type_of(&mut self, symbol: &Symbol) -> Option<Type> {
        self.about("getDeclaredTypeOfSymbol", symbol.id, json!({ "symbol": symbol.id }))
    }

    /// `aliasTypeArguments` of a type: the arguments of the type alias it was written as.
    pub fn alias_arguments(&mut self, kind: &Type) -> Vec<Type> {
        if kind.alias_symbol.is_none() {
            return Vec::new();
        }
        let found: Option<Vec<Type>> = self.about("getAliasTypeArgumentsOfType", kind.id, json!({ "objectId": kind.id }));
        found.unwrap_or_default()
    }

    /// `isArrayLikeType`.
    pub fn is_array_like(&mut self, kind: &Type) -> bool {
        self.about("isArrayLikeType", kind.id, json!({ "type": kind.id }))
    }

    /// The parameters of a signature, kept for the run.
    pub fn parameters_of(&mut self, signature: &Signature) -> Vec<Symbol> {
        let found: Option<Vec<Symbol>> = self.about("getParametersOfSignature", signature.id, json!({ "objectId": signature.id }));
        found.unwrap_or_default()
    }

    /// The types of a signature's parameters, then its return type.
    pub fn signature_types(&mut self, signature: &Signature) -> Vec<Type> {
        let mut found: Vec<Type> = Vec::new();
        for parameter in self.parameters_of(signature) {
            found.extend(self.type_of_symbol(&parameter));
        }
        found.extend(self.return_type(signature));
        found
    }

    /// `getExportsOfModule`.
    pub fn module_exports(&mut self, module: &Symbol) -> Vec<Rc<Symbol>> {
        let found = self.session.exports_of(module);
        self.answered(found.map(Some)).map(|found| found.to_vec()).unwrap_or_default()
    }

    /// The symbol itself, or what it stands for when it is an alias.
    pub fn resolved_symbol(&mut self, symbol: Rc<Symbol>) -> Option<Rc<Symbol>> {
        let found = self.session.resolved(Some(symbol));
        self.answered(found.map(Some)).flatten()
    }

    /// `getSymbolAtLocation` of the source file being linted: the symbol of its module, when it is one.
    pub fn file_symbol(&mut self) -> Option<Rc<Symbol>> {
        let path = self.file().to_string();
        let table = self.table_of(&path)?;
        let found = self.session.symbol_at(&table.handle(ROOT, &path));
        self.answered(found)
    }

    /// `getSymbolAtLocation` of the string literal that names the module of an `export *` (byte offsets).
    pub fn module_of_specifier(&mut self, start: u32, end: u32) -> Option<Rc<Symbol>> {
        let handle = self.handle_at(Some(kind::STRING_LITERAL), start, end)?;
        let found = self.session.symbol_at(&handle);
        self.answered(found)
    }
}
