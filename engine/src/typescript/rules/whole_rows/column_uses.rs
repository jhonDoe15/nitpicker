//! `columnUse` and `existenceUse`: an awaited query whose rows are read only for one column, or only to learn
//! whether a row exists.
use super::boolean_uses::{is_boolean_use, is_count_test};
use crate::typescript::rules::held_scopes::estree_calls::is_function;
use crate::typescript::rules::query_rows::assignments::mapped_field;
use crate::typescript::rules::query_rows::calls::{QueryScope, is_member_call, is_orm_call, is_query_result};
use crate::typescript::rules::query_rows::loaded::{is_projection, loaded_rows, single_read};
use crate::typescript::rules::query_rows::writes::Rows;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::rules::writes::syntax::unwrapped;
use regex::Regex;
use std::cell::RefCell;
use std::sync::LazyLock;

const COUNTS: [&str; 2] = ["count", "countBy"];
const SINGLES: [&str; 4] = ["findOne", "findOneBy", "findFirst", "findUnique"];
static LOCKING: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)lock|forUpdate|skipLocked|pessimistic").expect("pattern"));

pub struct ColumnUse<'v> {
    pub node: Node<'v>,
    pub field: Option<String>,
}

pub struct Uses<'c, 'a, 'v> {
    pub rows: Rows<'c, 'a, 'v>,
    pub scope: QueryScope,
    pub types: &'c RefCell<Types>,
}

impl<'v> Uses<'_, '_, 'v> {
    fn is_foreign(&self, call: Node) -> bool {
        self.types.borrow_mut().is_foreign_call(call.start(), call.end())
    }

    pub fn column_use(&self, awaited: Node<'v>) -> Option<ColumnUse<'v>> {
        let query = awaited.node("argument").filter(|query| query.is("CallExpression"))?;
        if !is_query_result(&self.scope, awaited) || self.is_foreign(query) {
            return None;
        }
        let rows = loaded_rows(self.rows.scopes, awaited)?;
        let [read] = rows.reads.as_slice() else { return None };
        if is_projection(query) {
            return None;
        }
        let mapped = mapped_field(*read).filter(|mapped| mapped.call.nodes("arguments").len() == 1)?;
        if self.rows.is_ids_write(mapped.call, query) {
            return None;
        }
        let model = self.types.borrow_mut().is_model_field(awaited.start(), awaited.end(), &mapped.field);
        model.then_some(ColumnUse { node: mapped.call, field: Some(mapped.field) })
    }

    fn is_locking(&self, call: Node) -> bool {
        call.nodes("arguments").into_iter().any(|argument| LOCKING.is_match(&self.rows.source[argument.start() as usize..argument.end() as usize]))
    }

    pub fn existence_use(&self, awaited: Node<'v>) -> Option<ColumnUse<'v>> {
        let call = awaited.node("argument").map(unwrapped).filter(|call| is_member_call(*call))?;
        if call.nodes("arguments").into_iter().any(|argument| is_function(unwrapped(argument))) {
            return None;
        }
        if is_projection(call) || self.is_locking(call) {
            return None;
        }
        let site = single_read(self.rows.scopes, awaited)?;
        let counted = is_orm_call(&self.scope, call, &COUNTS) && is_count_test(site);
        let found = is_orm_call(&self.scope, call, &SINGLES) && is_boolean_use(site);
        ((counted || found) && !self.is_foreign(call)).then_some(ColumnUse { node: call, field: None })
    }
}
