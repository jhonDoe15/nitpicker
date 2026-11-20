//! Named children by field id: the parser library finds a field name by comparing strings on every call.
use std::cell::RefCell;
use std::collections::HashMap;
use tree_sitter::Node;

thread_local! {
    static IDS: RefCell<HashMap<(usize, usize), u16>> = RefCell::new(HashMap::new());
}

pub trait Fields<'t> {
    /// The child in a named field of a Java node; the name is resolved to its id once per thread.
    fn field(&self, name: &'static str) -> Option<Node<'t>>;
}

impl<'t> Fields<'t> for Node<'t> {
    fn field(&self, name: &'static str) -> Option<Node<'t>> {
        let key = (name.as_ptr() as usize, name.len());
        let id = IDS.with(|ids| {
            *ids.borrow_mut().entry(key).or_insert_with(|| self.language().field_id_for_name(name).map_or(0, std::num::NonZeroU16::get))
        });
        if id == 0 { None } else { self.child_by_field_id(id) }
    }
}
