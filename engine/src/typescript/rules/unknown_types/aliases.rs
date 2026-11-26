//! Type aliases that hide an `unknown`: a local alias is read from this file's tree, any other from the compiler's.
use super::positions::is_unknown_member;
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::kind;
use std::cell::RefCell;
use std::collections::HashSet;

pub struct Aliases<'c, 'a, 's> {
    pub scopes: &'c Scopes<'a, 's>,
    pub types: &'c RefCell<Types>,
}

impl<'s> Aliases<'_, '_, 's> {
    fn aliased_type(&self, reference: Node<'s>) -> Option<Node<'s>> {
        let name = reference.node("typeName").filter(|name| name.is("Identifier"))?;
        let symbol = self.scopes.variable_by_name(&name.name()?, name.start())?;
        let definition = self.scopes.defs(symbol).into_iter().find(|definition| definition.kind == DefKind::Type)?;
        let declaration = definition.node.is("TSTypeAliasDeclaration").then_some(definition.node)?;
        if declaration.node("typeParameters").is_some() {
            return None;
        }
        declaration.node("typeAnnotation")
    }

    fn imported_has_unknown(&self, reference: Node<'s>) -> bool {
        let Some(name) = reference.node("typeName") else { return false };
        let name_kind = match name.kind() {
            "Identifier" => kind::IDENTIFIER,
            "TSQualifiedName" => kind::QUALIFIED_NAME,
            _ => return false,
        };
        self.types.borrow_mut().alias_has_unknown(name_kind, name.start(), name.end())
    }

    pub fn references_unknown(&self, reference: Node<'s>) -> bool {
        match self.aliased_type(reference) {
            Some(local) => self.contains_unknown(local),
            None => self.imported_has_unknown(reference),
        }
    }

    fn contains_unknown(&self, root: Node<'s>) -> bool {
        let mut pending = vec![root];
        let mut seen: HashSet<u32> = HashSet::new();
        while let Some(current) = pending.pop() {
            if !seen.insert(current.index) {
                continue;
            }
            if is_unknown_member(current) {
                return true;
            }
            let reference = current.is("TSTypeReference").then_some(current);
            let local = reference.and_then(|reference| self.aliased_type(reference));
            if let (Some(reference), None) = (reference, local)
                && self.imported_has_unknown(reference)
            {
                return true;
            }
            pending.extend(current.children().into_iter().filter(|child| !child.is("TSTypeParameterDeclaration")));
            pending.extend(local);
        }
        false
    }
}
