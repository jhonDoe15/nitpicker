//! Rules about writes that are retried or published beside a database write, and the helpers they share:
//! imported bindings, retry wrappers and retry loops.
pub mod imports;
pub mod no_retry_without_idempotency;
pub mod retry_loops;
pub mod retry_scopes;
pub mod syntax;
