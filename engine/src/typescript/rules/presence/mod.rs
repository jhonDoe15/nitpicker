//! Rules about telling a missing key from a stored empty value: `in` checks on types that allow `undefined`, and
//! `Map` or record lookups tested by their value.
pub(super) mod conditions;
mod in_guards;
mod map_lookups;
pub mod no_in_presence_check;
pub mod no_lookup_as_presence;

use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::type_flags;
use std::cell::RefCell;

pub(super) struct Facts<'c, 'a, 's> {
    pub scopes: &'c Scopes<'a, 's>,
    pub types: &'c RefCell<Types>,
    pub text: &'c str,
}

impl Facts<'_, '_, '_> {
    pub fn plain_text(&self, node: Node) -> String {
        conditions::plain_text(self.text, node)
    }
}

pub(super) const UNDEFINED: u32 = type_flags::UNDEFINED | type_flags::VOID;

pub(super) fn members(types: &mut Types, kind: &Type) -> Vec<Type> {
    if kind.flags & type_flags::UNION == 0 { vec![kind.clone()] } else { types.parts(kind).to_vec() }
}
