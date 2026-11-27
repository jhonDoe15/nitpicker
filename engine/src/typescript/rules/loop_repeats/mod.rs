//! The loop shapes the per-item input/output rule leaves alone: paging, draining and polling loops, re-reads
//! in a `catch`, and the call chains and names those checks read.
pub mod chains;
pub mod drains;
pub mod names;
pub mod paging;
pub mod polling;
