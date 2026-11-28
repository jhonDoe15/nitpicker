//! Questions of the RxJS lookup rule.
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::type_flags;

const ITERABLES: [&str; 6] = ["Set", "Map", "ReadonlySet", "ReadonlyMap", "Iterable", "IterableIterator"];

impl Types {
    /// `typedCollection` of `rxjs-calls.mts`: `None` when the node's type is `any` or `unknown`, otherwise whether
    /// a member of the type (of the union, or the type itself) is array-like or named as an iterable collection.
    pub fn reactive_collection(&mut self, start: u32, end: u32) -> Option<bool> {
        let Some(kind) = self.type_at(start, end) else {
            self.refuse("the compiler has no type for an RxJS source");
            return None;
        };
        if kind.flags & type_flags::ANY_OR_UNKNOWN != 0 {
            return None;
        }
        let parts = if kind.flags & type_flags::UNION != 0 { self.parts(&kind).to_vec() } else { vec![kind] };
        Some(parts.iter().any(|part| self.is_array_like(part) || self.symbol(part).is_some_and(|symbol| ITERABLES.contains(&symbol.name.as_str()))))
    }
}
