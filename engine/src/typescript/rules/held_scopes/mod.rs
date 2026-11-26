//! Rules about remote calls made while a transaction is open or a lock is held.
mod estree_calls;
mod fill_once;
mod owners;
pub mod remote_in_scope;
mod scopes;
