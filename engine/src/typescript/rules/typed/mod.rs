//! Rules that ask the compiler about types. They run one file after another against one session of the
//! compiler's API server, opened for the project's tsconfig; a file outside that program is left to the
//! ESLint-plugin rule, which the caller learns from a `!types` row.
pub mod caller_objects;
pub mod numbers;
pub mod offsets;
pub mod presence;
pub mod questions;
pub mod regex;
pub mod streams;
pub mod time;
pub mod types;
pub mod unions;

use super::Rule;
use super::arguments;
use super::chunks;
use super::collections;
use super::defaults;
use super::delegation;
use super::domain;
use super::empty_lists;
use super::forwarding;
use super::number_input;
use super::patterns;
use super::presence as presence_rules;
use super::promises;
use super::signatures;
use super::spreads;
use super::time_zones;
use super::union_members;

pub const TYPED: &[(&str, Rule)] =
    &[
    ("exhaustive-union-predicate", union_members::exhaustive_union_check),
    ("no-accumulator-concat", collections::no_accumulator_concat::check),
    ("no-array-spread-arguments", spreads::no_array_spread_arguments::check),
    ("no-blank-number-coercion", number_input::no_blank_number_coercion::check),
    ("no-chunkwise-stream-text", chunks::no_chunkwise_stream_text::check),
    ("no-dropped-delegate-result", delegation::no_dropped_delegate_result::check),
    ("no-empty-every-signal", empty_lists::no_empty_every_signal::check),
    ("no-expanding-replacement-string", patterns::replacements::no_expanding_replacement_string::check),
    ("no-falsy-default", defaults::no_falsy_default::check),
    ("no-forwarding-method-alias", forwarding::no_forwarding_method_alias::check),
    ("no-forwarding-wrapper", forwarding::no_forwarding_wrapper::check),
    ("no-in-presence-check", presence_rules::no_in_presence_check::check),
    ("no-local-time-zone", time_zones::no_local_time_zone::check),
    ("no-lookup-as-presence", presence_rules::no_lookup_as_presence::check),
    ("no-mutating-method-in-domain", domain::no_mutating_method_in_domain::check), ("no-parameter-mutation", signatures::no_parameter_mutation::check),
    ("no-shadowed-spread-key", spreads::no_shadowed_spread_key::check),
    ("no-string-as-regex", patterns::no_string_as_regex::check),
    ("no-swapped-arguments", arguments::no_swapped_arguments::check),
    ("no-unhandled-void-promise", promises::no_unhandled_void_promise::check),
    ("no-union-order-dependence", union_members::no_union_order_check),
];

pub fn is_typed(name: &str) -> bool {
    TYPED.iter().any(|(typed, _)| *typed == name)
}
