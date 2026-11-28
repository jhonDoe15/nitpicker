//! Rules about retries that repeat the same stale write: a retry after an optimistic-lock conflict.
pub mod module_scope;
pub mod no_stale_retry_after_conflict;
pub mod receivers;
mod saves;
