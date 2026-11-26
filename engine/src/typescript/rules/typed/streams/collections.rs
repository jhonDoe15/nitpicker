//! Whether the non-nullable type at a node is made of arrays, or holds a collection.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::type_flags;
use regex::Regex;
use std::sync::LazyLock;

static COLLECTION_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(?:Readonly|Weak)?(?:Map|Set)$|Array$").expect("pattern"));

impl Types {
    /// `hasArrayType`: every member is an array or a tuple; `None` when the compiler gives no type there.
    pub fn holds_only_arrays(&mut self, start: u32, end: u32) -> Option<bool> {
        let members = self.non_nullable_members(start, end)?;
        Some(members.iter().all(|member| self.is_array_type(member) || self.is_tuple_type(member)))
    }

    /// `hasCollectionType`: some member is `any`, an array, a tuple, a map or a set; `None` when the compiler
    /// gives no type there.
    pub fn holds_collection(&mut self, start: u32, end: u32) -> Option<bool> {
        let members = self.non_nullable_members(start, end)?;
        Some(members.iter().any(|member| {
            member.flags & type_flags::ANY != 0
                || self.is_array_type(member)
                || self.is_tuple_type(member)
                || self.symbol(member).is_some_and(|symbol| COLLECTION_NAME.is_match(&symbol.name))
        }))
    }
}
