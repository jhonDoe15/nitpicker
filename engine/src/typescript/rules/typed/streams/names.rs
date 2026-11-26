//! The names a node's type goes by (`typeNames`) and its flags.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::type_flags;

impl Types {
    fn part_name(&mut self, part: &Type) -> String {
        let named = self.symbol(part).map(|symbol| symbol.name.clone());
        named.or_else(|| self.alias_name(part)).unwrap_or_default()
    }

    /// The symbol name, or else the alias name, of each member of the type at a node; `None` when the compiler
    /// gives no type there.
    pub fn type_names(&mut self, start: u32, end: u32) -> Option<Vec<String>> {
        let found = self.type_at(start, end)?;
        let parts = if found.flags & type_flags::UNION != 0 { self.parts(&found).to_vec() } else { vec![found] };
        Some(parts.iter().map(|part| self.part_name(part)).collect())
    }

    /// Whether the type at a node is `any` or `unknown`; `None` when the compiler gives no type there.
    pub fn is_any_or_unknown(&mut self, start: u32, end: u32) -> Option<bool> {
        let found = self.type_at(start, end)?;
        Some(found.flags & (type_flags::ANY_OR_UNKNOWN) != 0)
    }
}
