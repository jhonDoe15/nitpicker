//! What `no-unknown-in-domain` asks the compiler: whether the type alias a type name stands for, in any file,
//! mentions `unknown`, following the aliases it names in turn.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::{NodeTable, parse_handle};
use crate::typescript::types::tables::kind;
use std::collections::HashSet;
use std::rc::Rc;

const CAUGHT_ERROR_NAMES: [&str; 2] = ["cause", "error"];

fn is_caught_error_property(table: &NodeTable, node: u32) -> bool {
    let Some(parent) = table.parent(node).filter(|parent| table.kind(*parent) == kind::PROPERTY_SIGNATURE) else { return false };
    table.child(parent, "type") == Some(node) && table.child(parent, "name").is_some_and(|name| CAUGHT_ERROR_NAMES.contains(&table.node_text(name)))
}

impl Types {
    /// The first declaration of what the type name node names that is a type alias without type parameters, as a
    /// handle (the symbol at the node, through an alias).
    fn plain_alias_of(&mut self, name: &str) -> Option<String> {
        let found = self.session.symbol_at(name);
        let symbol = self.answered(found.map(Some)).flatten();
        let resolved = self.session.resolved(symbol);
        let symbol = self.answered(resolved.map(Some)).flatten()?;
        for declaration in &symbol.declarations {
            let Some((index, declared, path)) = parse_handle(declaration) else { continue };
            if declared != kind::TYPE_ALIAS_DECLARATION {
                continue;
            }
            let table = self.table_of(path)?;
            if !table.has_list(index, "typeParameters") {
                return Some(declaration.clone());
            }
        }
        None
    }

    /// `aliasDeclaration(checker, checker.getSymbolAtLocation(name))?.type`, as a handle.
    fn alias_type(&mut self, name: &str) -> Option<String> {
        let declaration = self.plain_alias_of(name)?;
        let (index, _, path) = parse_handle(&declaration)?;
        let table = self.table_of(path)?;
        let aliased = table.child(index, "type")?;
        Some(table.handle(aliased, path))
    }

    /// `importedAliasHasUnknown` for a type name of the file being linted, by its kind and extent there.
    pub fn alias_has_unknown(&mut self, name_kind: u32, start: u32, end: u32) -> bool {
        let Some(name) = self.handle_at(Some(name_kind), start, end) else { return false };
        let Some(root) = self.alias_type(&name) else { return false };
        let key = format!("unknown-alias:{root}");
        if let Some(known) = self.kept.get(&key) {
            return *known;
        }
        let found = self.mentions_unknown(&root);
        if self.refused.is_none() {
            self.kept.insert(key, found);
        }
        found
    }

    fn mentions_unknown(&mut self, root: &str) -> bool {
        let mut seen: HashSet<String> = HashSet::new();
        let mut pending = vec![root.to_string()];
        while let Some(current) = pending.pop() {
            if !seen.insert(current.clone()) {
                continue;
            }
            let Some((index, _, path)) = parse_handle(&current) else { continue };
            let Some(table): Option<Rc<NodeTable>> = self.table_of(path) else { continue };
            if table.kind(index) == kind::UNKNOWN_KEYWORD && !is_caught_error_property(&table, index) {
                return true;
            }
            for child in table.children(index).filter(|child| table.kind(*child) != kind::TYPE_PARAMETER) {
                pending.push(table.handle(child, path));
            }
            if table.kind(index) == kind::TYPE_REFERENCE
                && let Some(name) = table.child(index, "typeName")
                && let Some(aliased) = self.alias_type(&table.handle(name, path))
            {
                pending.push(aliased);
            }
            if self.refused.is_some() {
                return false;
            }
        }
        false
    }
}
