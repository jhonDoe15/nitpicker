//! What the union rules ask: whether a value is the list of members of a compiler union or intersection, the
//! literal members of a union, and where the union a value was declared as is written.
mod literals;
mod member_lists;

pub use literals::Literal;
