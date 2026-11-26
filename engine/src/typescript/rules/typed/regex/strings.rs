//! What the string-as-pattern rules ask: whether a node's type is made of strings, is a `RegExp`, or can be a
//! string only known at run time.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::type_flags;

const RUNTIME_STRING: u32 = type_flags::STRING | type_flags::TEMPLATE_LITERAL;

impl Types {
    /// The members of a union, or the type alone.
    pub(super) fn union_members(&mut self, kind: &Type) -> Vec<Type> {
        if kind.flags & type_flags::UNION == 0 {
            return vec![kind.clone()];
        }
        self.parts(kind).to_vec()
    }

    pub fn members_at(&mut self, start: u32, end: u32) -> Option<Vec<Type>> {
        let kind = self.type_at(start, end)?;
        Some(self.union_members(&kind))
    }

    /// Whether the type at a node is a string type, or a union of string types.
    pub fn is_string_at(&mut self, start: u32, end: u32) -> Option<bool> {
        let members = self.members_at(start, end)?;
        Some(!members.is_empty() && members.iter().all(|member| member.flags & type_flags::STRING_LIKE != 0))
    }

    /// Whether the type at a node is named `RegExp`.
    pub fn is_regexp_at(&mut self, start: u32, end: u32) -> Option<bool> {
        let kind = self.type_at(start, end)?;
        Some(self.symbol(&kind).is_some_and(|symbol| symbol.name == "RegExp"))
    }

    /// Whether the type at a node, or its base constraint, has a `string` or template literal member.
    pub fn is_runtime_string_at(&mut self, start: u32, end: u32) -> Option<bool> {
        let kind = self.type_at(start, end)?;
        let kind = self.base_constraint(&kind).unwrap_or(kind);
        Some(self.union_members(&kind).iter().any(|member| member.flags & RUNTIME_STRING != 0))
    }
}
