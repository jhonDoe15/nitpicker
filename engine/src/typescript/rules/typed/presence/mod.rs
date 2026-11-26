//! What the presence rules ask: the value type of a type's string index signature and the type arguments of a
//! type reference.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::{object_flags, type_flags};
use serde::Deserialize;
use serde_json::json;

#[derive(Deserialize)]
struct IndexEntry {
    #[serde(rename = "keyType")]
    key_type: Type,
    #[serde(rename = "valueType")]
    value_type: Type,
}

impl Types {
    /// `getIndexInfoOfType(type, IndexKind.String)?.type`: the key type must be `string` itself.
    pub fn string_index_type(&mut self, kind: &Type) -> Option<Type> {
        let found: Option<Vec<IndexEntry>> = self.about("getIndexInfosOfType", kind.id, json!({ "type": kind.id }));
        found.unwrap_or_default().into_iter().find(|entry| entry.key_type.flags == type_flags::STRING).map(|entry| entry.value_type)
    }

    /// Whether the type is an instantiation of a generic type (`ObjectFlags.Reference`).
    pub fn is_reference(kind: &Type) -> bool {
        kind.object_flags & object_flags::REFERENCE != 0
    }

    pub fn type_arguments(&mut self, kind: &Type) -> Vec<Type> {
        let found: Option<Vec<Type>> = self.about("getTypeArguments", kind.id, json!({ "type": kind.id }));
        found.unwrap_or_default()
    }
}
