//! Rules about promises: where one is dropped, and whether what drops it is safe.
mod callees;
mod catching;
pub mod no_unhandled_void_promise;
