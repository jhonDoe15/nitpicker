//! Questions about the compiler's answers that rules ask beyond the basic ones of `types.rs`, one file per area.
mod delegation;
mod forwarding;
mod forwarding_tables;
mod promises;
mod spreads;

pub use forwarding_tables::{ClassFacts, MethodFacts};
