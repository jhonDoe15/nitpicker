//! Rules that ask the compiler about types. They run one file after another against one session of the
//! compiler's API server, opened for the project's tsconfig; a file outside that program is left to the
//! ESLint-plugin rule, which the caller learns from a `!types` row.
pub mod caller_objects;
pub mod offsets;
pub mod questions;
pub mod types;

use super::Rule;
use super::arguments;
use super::defaults;
use super::delegation;
use super::domain;
use super::forwarding;
use super::promises;
use super::signatures;
use super::spreads;

pub const TYPED: &[(&str, Rule)] =
    &[
    ("no-array-spread-arguments", spreads::no_array_spread_arguments::check),
    ("no-dropped-delegate-result", delegation::no_dropped_delegate_result::check),
    ("no-falsy-default", defaults::no_falsy_default::check),
    ("no-forwarding-method-alias", forwarding::no_forwarding_method_alias::check),
    ("no-forwarding-wrapper", forwarding::no_forwarding_wrapper::check),
    ("no-mutating-method-in-domain", domain::no_mutating_method_in_domain::check), ("no-parameter-mutation", signatures::no_parameter_mutation::check),
    ("no-shadowed-spread-key", spreads::no_shadowed_spread_key::check),
    ("no-swapped-arguments", arguments::no_swapped_arguments::check),
    ("no-unhandled-void-promise", promises::no_unhandled_void_promise::check),
];

pub fn is_typed(name: &str) -> bool {
    TYPED.iter().any(|(typed, _)| *typed == name)
}
