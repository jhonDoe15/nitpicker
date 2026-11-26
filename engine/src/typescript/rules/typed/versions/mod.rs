//! What the optimistic-lock rule asks the compiler: the class behind an entity's type, the ORM family its file
//! imports, and whether the entity or a base class maps a version column.
mod classes;
mod mappings;
mod trees;

pub use mappings::Form;
