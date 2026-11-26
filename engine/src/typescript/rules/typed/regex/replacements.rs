//! What the replacement rule asks: whether a replacement can be called, and whether its type is plain text
//! that holds no `$`.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::type_flags;

const PLAIN: u32 = type_flags::NUMBER_LIKE | type_flags::BOOLEAN_LIKE | type_flags::BIG_INT_LIKE;

fn is_plain(kind: &Type) -> bool {
    if kind.flags & PLAIN != 0 {
        return true;
    }
    let text = kind.value.as_ref().and_then(serde_json::Value::as_str);
    kind.flags & type_flags::STRING_LITERAL != 0 && text.is_some_and(|text| !text.contains('$'))
}

impl Types {
    /// Whether some member of the type at a node has a call signature.
    pub fn is_callable_at(&mut self, start: u32, end: u32) -> Option<bool> {
        let members = self.members_at(start, end)?;
        Some(members.iter().any(|member| self.signature_count(member, false) > 0))
    }

    /// Whether every member of the type at a node is a number, a boolean, a bigint or a string without `$`.
    pub fn is_plain_at(&mut self, start: u32, end: u32) -> Option<bool> {
        let members = self.members_at(start, end)?;
        Some(members.iter().all(is_plain))
    }
}
