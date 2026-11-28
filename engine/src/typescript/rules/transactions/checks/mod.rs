//! `no-check-then-write` and `check-then-write.mts`: a read outside any transaction or lock whose result decides a
//! later write to the same table.
pub mod no_check_then_write;
pub mod reads;
