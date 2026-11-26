//! Rules about retries that repeat the same stale write: a retry after an optimistic-lock conflict.
mod module_scope;
pub mod no_stale_retry_after_conflict;
mod receivers;
mod saves;
