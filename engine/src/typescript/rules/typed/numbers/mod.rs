//! What the number and list rules ask: the members of the type at a node, and whether a node holds a list.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::type_flags;

impl Types {
    /// The members of the union at a node, or the type alone (`partsOf`); `None` without a type there.
    pub fn union_members_at(&mut self, start: u32, end: u32) -> Option<Vec<Type>> {
        let found = self.type_at(start, end)?;
        if found.flags & type_flags::UNION == 0 {
            return Some(vec![found]);
        }
        Some(self.parts(&found).to_vec())
    }

    /// Whether the non-nullable type at a node is an array type; `None` without a type there.
    pub fn is_list_at(&mut self, start: u32, end: u32) -> Option<bool> {
        let found = self.type_at(start, end)?;
        let kind = self.non_nullable(&found)?;
        Some(self.is_array_type(&kind))
    }
}
