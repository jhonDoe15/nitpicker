//! The class declaration a type stands for, and the base class a class extends.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::{NodeTable, parse_handle};
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::{kind, type_flags};
use serde::Deserialize;
use serde_json::json;
use std::rc::Rc;

#[derive(Deserialize)]
struct IndexEntry {
    #[serde(rename = "keyType")]
    key_type: Type,
    #[serde(rename = "valueType")]
    value_type: Type,
}

impl Types {
    pub(super) fn entity_tree(&mut self, handle: &str) -> Option<(Rc<NodeTable>, u32, String)> {
        let (index, _, path) = parse_handle(handle)?;
        let table = self.session.table(path);
        let table = self.answered(table.map(Some))?;
        Some((table, index, path.to_string()))
    }

    /// `getIndexTypeOfType(type, IndexKind.Number)`: the key type must be `number` itself.
    fn entity_number_index(&mut self, kind: &Type) -> Option<Type> {
        let found: Option<Vec<IndexEntry>> = self.about("getIndexInfosOfType", kind.id, json!({ "type": kind.id }));
        found.unwrap_or_default().into_iter().find(|entry| entry.key_type.flags == type_flags::NUMBER).map(|entry| entry.value_type)
    }

    fn entity_class_of(&mut self, kind: &Type) -> Option<String> {
        let symbol = self.symbol(kind)?;
        symbol.declarations.iter().find(|declaration| parse_handle(declaration).is_some_and(|(_, found, _)| found == kind::CLASS_DECLARATION)).cloned()
    }

    /// The class declaration of the type at an extent, looking through `null`, `undefined` and an array's items.
    pub(super) fn entity_class_at(&mut self, start: u32, end: u32) -> Option<String> {
        let Some(found) = self.type_at(start, end) else {
            self.refuse("no type for a loaded entity");
            return None;
        };
        let plain = self.non_nullable(&found).unwrap_or(found);
        let element = self.entity_number_index(&plain).unwrap_or(plain);
        self.entity_class_of(&element)
    }

    /// The class the first `extends` clause names, by the type the compiler gives that clause.
    pub(super) fn entity_base(&mut self, class: &str) -> Option<String> {
        let (table, index, path) = self.entity_tree(class)?;
        let clause = table.listed(index, "heritageClauses").into_iter().find(|clause| !table.node_text(*clause).starts_with("implements"))?;
        let base = *table.listed(clause, "types").first()?;
        let found = self.session.types_at(&[table.handle(base, &path)]);
        let found = self.answered(found).pop().flatten()?;
        self.entity_class_of(&found)
    }
}
