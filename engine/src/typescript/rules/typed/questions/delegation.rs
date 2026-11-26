//! Questions of the delegation rules: the type or symbol of a node by kind, and what awaiting a type gives.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::{Signature, Symbol, Type};
use crate::typescript::types::tables::type_flags;
use serde_json::json;
use std::rc::Rc;

const THENABLE: u32 = type_flags::OBJECT | type_flags::INTERSECTION;
const DEPTH: usize = 10;

impl Types {
    /// `getTypeAtLocation` of the compiler's node of this kind and extent (byte offsets of the engine's tree).
    pub fn type_of_node(&mut self, kind: u32, start: u32, end: u32) -> Option<Type> {
        let handle = self.node_of_kind(kind, start, end)?;
        let found = self.session.types_at(&[handle]);
        self.answered(found).pop().flatten()
    }

    /// `getSymbolAtLocation` of the compiler's node of this kind and extent.
    pub fn symbol_of_node(&mut self, kind: u32, start: u32, end: u32) -> Option<Rc<Symbol>> {
        let handle = self.node_of_kind(kind, start, end)?;
        let found = self.session.symbol_at(&handle);
        self.answered(found)
    }

    fn node_of_kind(&mut self, kind: u32, start: u32, end: u32) -> Option<String> {
        let handle = self.handle_at(Some(kind), start, end);
        if handle.is_none() {
            self.refuse("no compiler node for an ESTree node");
        }
        handle
    }

    pub fn call_signatures(&mut self, kind: &Type) -> Vec<Signature> {
        let question = json!({ "type": kind.id, "kind": 0 });
        let found: Option<Vec<Signature>> = self.about("getSignaturesOfType:list", kind.id, question);
        found.unwrap_or_default()
    }

    fn first_parameter(&mut self, signature: &Signature) -> Option<Type> {
        self.about("getParameterType", signature.id, json!({ "signature": signature.id, "index": 0 }))
    }

    pub fn type_of_symbol(&mut self, symbol: &Symbol) -> Option<Type> {
        self.about("getTypeOfSymbol", symbol.id, json!({ "symbol": symbol.id }))
    }

    fn callback_arguments(&mut self, thenable: &Type) -> Vec<Type> {
        let Some(then) = self.property(thenable, "then") else { return Vec::new() };
        let Some(then) = self.type_of_symbol(&then) else { return Vec::new() };
        let mut callbacks = Vec::new();
        for signature in self.call_signatures(&then) {
            let Some(parameter) = self.first_parameter(&signature) else { continue };
            let parameter = self.non_nullable(&parameter).unwrap_or(parameter);
            callbacks.extend(self.parts(&parameter).iter().cloned());
        }
        if callbacks.len() > 1 {
            self.refuse("a then with several callback types");
            return Vec::new();
        }
        let mut values = Vec::new();
        for callback in callbacks {
            for signature in self.call_signatures(&callback) {
                values.extend(self.first_parameter(&signature));
            }
        }
        values
    }

    fn awaited_into(&mut self, kind: &Type, depth: usize, found: &mut Vec<Type>) {
        if kind.flags & type_flags::UNION != 0 && depth < DEPTH {
            for part in self.parts(kind).iter() {
                self.awaited_into(part, depth + 1, found);
            }
            return;
        }
        let thenable = kind.flags & THENABLE != 0 && depth < DEPTH;
        let values = if thenable { self.callback_arguments(kind) } else { Vec::new() };
        if values.is_empty() {
            found.push(kind.clone());
            return;
        }
        for value in &values {
            self.awaited_into(value, depth + 1, found);
        }
    }

    /// The members of `getAwaitedType` of a type, or of the type itself where it is not a promise.
    pub fn awaited_parts(&mut self, kind: &Type) -> Vec<Type> {
        let mut found = Vec::new();
        self.awaited_into(kind, 0, &mut found);
        found
    }
}
