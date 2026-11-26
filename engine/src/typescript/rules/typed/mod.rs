//! Rules that ask the compiler about types. They run one file after another against one session of the
//! compiler's API server, opened for the project's tsconfig; a file outside that program is left to the
//! ESLint-plugin rule, which the caller learns from a `!types` row.
pub mod offsets;
pub mod types;

use super::Rule;
use super::domain;

pub const TYPED: &[(&str, Rule)] = &[("no-mutating-method-in-domain", domain::no_mutating_method_in_domain::check)];

pub fn is_typed(name: &str) -> bool {
    TYPED.iter().any(|(typed, _)| *typed == name)
}
