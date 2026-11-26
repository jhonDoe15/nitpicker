//! Rules that ask the compiler about types. They run one file after another against one session of the
//! compiler's API server, opened for the project's tsconfig; a file outside that program is left to the
//! ESLint-plugin rule, which the caller learns from a `!types` row.
pub mod caller_objects;
pub mod contracts;
pub mod effects;
pub mod numbers;
pub mod offsets;
pub mod presence;
pub mod questions;
pub mod regex;
pub mod relations;
pub mod retries;
pub mod rows;
pub mod streams;
pub mod time;
pub mod types;
pub mod unions;
pub mod unknown;
pub mod versions;

use super::Rule;
use super::arguments;
use super::chunks;
use super::collections;
use super::contracts as contract_rules;
use super::defaults;
use super::delegation;
use super::domain;
use super::dual_writes;
use super::empty_lists;
use super::entity_versions;
use super::forwarding;
use super::handlers;
use super::jobs;
use super::lazy_relations;
use super::held_scopes;
use super::number_input;
use super::patterns;
use super::presence as presence_rules;
use super::promises;
use super::saved_rows;
use super::signatures;
use super::spreads;
use super::stale_retries;
use super::time_zones;
use super::union_members;
use super::unknown_types;
use super::whole_rows;
use super::writes;

pub const TYPED: &[(&str, Rule)] =
    &[
    ("contract-infrastructure-type", contract_rules::contract_infrastructure_type::check),
    ("exhaustive-union-predicate", union_members::exhaustive_union_check),
    ("handler-entity-type", handlers::handler_entity_type),
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
    ("no-loaded-rows-saved-back", saved_rows::no_loaded_rows_saved_back::check),
    ("no-lookup-as-presence", presence_rules::no_lookup_as_presence::check),
    ("no-mutating-method-in-domain", domain::no_mutating_method_in_domain::check), ("no-parameter-mutation", signatures::no_parameter_mutation::check),
    ("no-remote-call-in-transaction", held_scopes::remote_in_scope::no_remote_call_in_transaction),
    ("no-remote-call-under-lock", held_scopes::remote_in_scope::no_remote_call_under_lock),
    ("no-lazy-relation-in-loop", lazy_relations::no_lazy_relation_in_loop::no_lazy_relation_in_loop),
    ("no-retry-without-idempotency", writes::no_retry_without_idempotency::no_retry_without_idempotency),
    ("no-dual-write", dual_writes::no_dual_write::no_dual_write),
    ("no-stale-retry-after-conflict", stale_retries::no_stale_retry_after_conflict::no_stale_retry_after_conflict),
    ("no-unisolated-job-loop", jobs::no_unisolated_job_loop::no_unisolated_job_loop),
    ("no-shadowed-spread-key", spreads::no_shadowed_spread_key::check),
    ("no-string-as-regex", patterns::no_string_as_regex::check),
    ("no-swapped-arguments", arguments::no_swapped_arguments::check),
    ("no-unhandled-void-promise", promises::no_unhandled_void_promise::check),
    ("no-union-order-dependence", union_members::no_union_order_check),
    ("no-unknown-in-domain", unknown_types::no_unknown_in_domain::check),
    ("no-unversioned-orm-entity", entity_versions::no_unversioned_orm_entity::check),
    ("no-whole-rows-for-one-value", whole_rows::no_whole_rows_for_one_value::check),
];

pub fn is_typed(name: &str) -> bool {
    TYPED.iter().any(|(typed, _)| *typed == name)
}
