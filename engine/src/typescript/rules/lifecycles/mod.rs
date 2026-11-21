//! Rules about what a long-lived scope keeps and what its close function does with it.
mod close_scopes;
mod collections;
pub mod no_add_only_collection;
mod pending_values;
pub mod settle_pending_on_close;
