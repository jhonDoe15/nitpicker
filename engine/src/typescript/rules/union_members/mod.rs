//! Rules about the members of unions: picking one by its place in the compiler's list, and classifying a union
//! by listing only some of its members.
mod exhaustive_union_predicate;
mod member_picks;
mod no_union_order_dependence;
mod union_forms;
mod unique_members;

pub use exhaustive_union_predicate::check as exhaustive_union_check;
pub use no_union_order_dependence::check as no_union_order_check;
