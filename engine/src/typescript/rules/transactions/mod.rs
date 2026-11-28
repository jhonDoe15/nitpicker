//! The transaction rules of the plugin's `transactions/` folder: related writes run in one transaction and through
//! its client, a read does not decide a write without a lock, and a cache is not written inside a transaction. The
//! ORMs and whether the project opens transactions come as the rule's settings.
pub mod branches;
pub mod cache_writes;
pub mod checks;
pub mod clients;
pub mod no_unatomic_writes;
pub mod units;
