//! The fan-out analysis of the concurrency rules: client origins, limiters, and the calls a per-element callback
//! makes, on the ESTree view.
pub mod bounds;
pub mod io;
pub mod origins;
pub mod resolve;
pub mod specs;
