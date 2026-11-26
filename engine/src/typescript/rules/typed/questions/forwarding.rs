//! The compiler's answers about signatures that the forwarding rules compare: the type of a declaration, its
//! signature and return type, assignability, parameters and the symbol a name stands for.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::{Signature, Symbol, Type};
use serde_json::json;
use std::rc::Rc;

impl Types {
    /// `getTypeAtLocation` of a node the compiler named.
    pub fn type_of(&mut self, handle: &str) -> Option<Type> {
        let found = self.session.types_at(&[handle.to_string()]);
        self.answered(found).pop().flatten()
    }

    /// `getTypeFromTypeNode`.
    pub fn type_from_node(&mut self, handle: &str) -> Option<Type> {
        let found: Result<Option<Type>, String> = self.session.ask("getTypeFromTypeNode", json!({ "location": handle }));
        self.answered(found)
    }

    pub fn signature_of(&mut self, handle: &str) -> Option<Signature> {
        let found: Result<Option<Signature>, String> = self.session.ask("getSignatureFromDeclaration", json!({ "location": handle }));
        self.answered(found)
    }

    pub fn return_type(&mut self, signature: &Signature) -> Option<Type> {
        let found: Result<Option<Type>, String> = self.session.ask("getReturnTypeOfSignature", json!({ "signature": signature.id }));
        self.answered(found)
    }

    /// The return type of the signature a declaration has.
    pub fn declared_return_type(&mut self, handle: &str) -> Option<Type> {
        let signature = self.signature_of(handle)?;
        self.return_type(&signature)
    }

    pub fn type_text(&mut self, kind: &Type) -> String {
        let found: Result<String, String> = self.session.ask("typeToString", json!({ "type": kind.id }));
        self.answered(found)
    }

    pub fn is_assignable(&mut self, source: &Type, target: &Type) -> bool {
        let found: Result<bool, String> = self.session.ask("isTypeAssignableTo", json!({ "source": source.id, "target": target.id }));
        self.answered(found)
    }

    pub fn has_predicate(&mut self, signature: &Signature) -> bool {
        let found: Result<Option<serde_json::Value>, String> = self.session.ask("getTypePredicateOfSignature", json!({ "signature": signature.id }));
        self.answered(found).is_some()
    }

    pub fn signature_parameters(&mut self, signature: &Signature) -> Vec<Symbol> {
        let found: Result<Option<Vec<Symbol>>, String> = self.session.ask("getParametersOfSignature", json!({ "objectId": signature.id }));
        self.answered(found).unwrap_or_default()
    }

    /// `getSymbolAtLocation` of a node the compiler named, an alias followed to what it stands for when asked.
    pub fn symbol_named(&mut self, handle: &str, through_alias: bool) -> Option<Rc<Symbol>> {
        let found = self.session.symbol_at(handle);
        let found = self.answered(found)?;
        if !through_alias {
            return Some(found);
        }
        let resolved = self.session.resolved(Some(found));
        self.answered(resolved)
    }
}
