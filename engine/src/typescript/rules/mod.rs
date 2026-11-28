//! Lint rules on the shared parse. Ids, messages and positions are those of the ESLint-plugin rule of the same name.
mod arguments;
mod btoa_text;
mod chunks;
mod collections;
mod contracts;
mod defaults;
mod deserialization;
mod delegation;
mod domain;
mod database;
mod dual_writes;
mod effects;
mod empty_lists;
mod entity_versions;
mod errors;
mod escaping;
mod events;
mod existence;
mod forwarding;
mod handlers;
mod http_values;
mod hashes;
mod header_values;
mod io_loops;
mod jobs;
mod lazy_relations;
mod held_scopes;
mod html_text;
mod lifecycles;
mod listeners;
mod listings;
mod loop_repeats;
mod lossy_decoding;
mod module_values;
mod modules;
mod number_input;
mod patterns;
mod persistence;
mod presence;
mod promises;
mod queries;
mod react_tests;
mod redirects;
mod request_inputs;
mod request_text;
mod response_json;
mod route_auth;
mod secrets;
mod security_values;
mod selectors;
mod signatures;
mod spreads;
mod sql;
mod stale_retries;
pub mod support;
mod test_assertions;
mod test_quality;
mod test_runtime;
mod terminal;
pub mod testing_library;
mod time;
mod timeouts;
mod time_zones;
mod tls;
pub mod typed;
mod union_members;
mod unknown_types;
mod urls;
mod wildcards;
mod writes;

use super::ParsedFile;
use crate::engine::finding::Finding;
use oxc_semantic::{Semantic, SemanticBuilder};
use oxc_span::Span;
use rayon::prelude::*;

pub struct Context<'a, 's> {
    pub file: &'s ParsedFile<'a>,
    pub semantic: &'s Semantic<'a>,
    /// The ESTree-shaped view and its scopes, built when a selected rule asks for them.
    pub estree: Option<(&'s support::view::View, &'s support::scope::Scopes<'a, 's>)>,
    /// The ids of the rules this run reports.
    pub selected: &'s [&'static str],
    /// Settings given for this file alone, as `key=value`.
    pub settings: &'s [String],
    /// The compiler's answers about the file, for the rules that ask about types.
    pub types: Option<&'s std::cell::RefCell<typed::types::Types>>,
    display: &'s str,
    scope: std::cell::OnceCell<testing_library::scope::Scope>,
    findings: Vec<Reported>,
}

/// A finding, where its range ends when the rule reports a range and not a point, and the policy questions the
/// caller answers before it keeps the finding: each a kind of question and the value it is asked about.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Reported {
    pub finding: Finding,
    pub end: Option<(usize, usize)>,
    pub conditions: Vec<(String, String)>,
}

impl From<Finding> for Reported {
    fn from(finding: Finding) -> Reported {
        Reported { finding, end: None, conditions: Vec::new() }
    }
}

impl<'a> Context<'a, '_> {
    pub fn setting(&self, key: &str) -> Option<&str> {
        self.settings.iter().find_map(|setting| setting.strip_prefix(key).and_then(|rest| rest.strip_prefix('=')))
    }

    pub fn display(&self) -> &str {
        self.display
    }

    /// Whether the preset counts this file as a React test, and the module it takes its testing utilities from.
    pub fn react_test_scope(&self) -> Option<&testing_library::scope::Scope> {
        let (view, _) = self.estree?;
        Some(self.scope.get_or_init(|| testing_library::scope::of(view.program(), self.file.path, self.display)))
    }

    pub fn text(&self, span: Span) -> &'a str {
        self.file.slice(span.start, span.end)
    }

    pub fn report(&mut self, rule: &str, span: Span, message: String) {
        self.report_at(rule, span.start, message);
    }

    pub fn report_at(&mut self, rule: &str, start: u32, message: String) {
        self.report_range(rule, start, None, message);
    }

    /// Line and 1-based UTF-16 column, as ESLint counts them: it drops a byte order mark before it counts.
    fn place(&self, offset: u32) -> (usize, usize) {
        let line = self.file.lines.line(offset) as usize;
        let column = self.file.lines.column_utf16(self.file.text, offset) as usize + 1;
        let mark = usize::from(line == 1 && self.file.text.starts_with('\u{feff}') && offset > 0);
        (line, column - mark)
    }

    /// Reports from `start`, up to `end` when the rule reports a range and not a point.
    pub fn report_range(&mut self, rule: &str, start: u32, end: Option<u32>, message: String) {
        self.report_when(rule, start, end, message, Vec::new());
    }

    /// Reports only if the caller answers yes to every condition, a question of policy the engine leaves to it.
    pub fn report_when(&mut self, rule: &str, start: u32, end: Option<u32>, message: String, conditions: Vec<(String, String)>) {
        let (line, column) = self.place(start);
        let rule = if rule.contains('/') { rule.to_string() } else { format!("nitpicker/{rule}") };
        let finding = Finding { file: self.display.to_string(), line, column, rule, message, symbol: None, priority: None, arguments: None };
        self.findings.push(Reported { finding, end: end.map(|end| self.place(end)), conditions });
    }
}

pub type Rule = fn(&mut Context);

/// Rules written against the ESTree-shaped view.
const ON_VIEW: &[&str] = &["contract-infrastructure-type", "exhaustive-union-predicate", "handler-entity-type", "hover-test-needs-keyboard", "no-accumulator-concat", "no-add-only-collection", "no-array-spread-arguments", "no-assertion-in-loop", "no-blank-number-coercion", "no-btoa-on-runtime-text", "no-case-mixed-header-merge", "no-case-sensitive-path-compare", "no-chunkwise-stream-text", "no-copied-constant", "no-copy-pasted-tests", "no-disabled-tls-verification", "no-directory-passing-existence-check", "no-double-decode", "no-dropped-delegate-result", "no-dual-write", "no-dynamic-import-of-path", "no-eager-relation", "no-empty-every-signal", "no-error-response-without-status", "no-expanding-replacement-string", "no-external-executables-in-unit-tests", "no-falsy-default", "no-forwarding-method-alias", "no-forwarding-wrapper", "no-git-repository-per-test", "no-hardcoded-secret", "no-in-presence-check", "no-incomplete-escaping", "no-internal-module-mocks", "no-interval-polling-in-tests", "no-io-in-loop", "no-lazy-relation-in-loop", "no-local-time-zone", "no-lookup-as-presence", "no-lossy-utf8-decode", "no-many-to-many-cascade-remove", "no-mutating-method-in-domain", "no-non-latin1-header-value", "no-node-process-per-test", "no-orm-query-logging", "no-orm-schema-sync", "no-parameter-mutation", "no-raw-http-value", "no-remote-call-in-transaction", "no-remote-call-under-lock", "no-retry-without-idempotency", "no-route-without-auth", "no-secret-in-log", "no-send-without-return", "no-server-or-worker-per-test", "no-shadowed-spread-key", "no-shared-test-state", "no-slash-only-redirect-guard", "no-sql-string-building", "no-stale-retry-after-conflict", "no-string-as-regex", "no-swapped-arguments", "no-switched-off-tests", "no-unbounded-query-array", "no-unchecked-response-json", "no-unchecked-url-sink", "no-uncoerced-request-input", "no-unencoded-url-part", "no-unescaped-css-selector", "no-unescaped-filter-value", "no-unescaped-html-interpolation", "no-unescaped-pattern-translation", "no-unhandled-void-promise", "no-union-order-dependence", "no-unisolated-job-loop", "no-unknown-in-domain", "no-unordered-query", "no-unowned-async-assertion", "no-unpaged-listing", "no-unresolved-relative-url", "no-unsafe-deserialization", "no-unstripped-remote-text", "no-untrimmed-request-text", "no-unversioned-orm-entity", "no-wait-for-with-fake-timers", "no-weak-hash", "preserve-error-cause", "react-test-no-implementation-details", "report-module-load-effects", "require-client-timeout", "require-error-listener", "require-http-timeout", "settle-pending-on-close", "structured-catch-logging", "test-must-use-production-runtime", "time-unit-mismatch"];

pub const ALL: &[(&str, Rule)] = &[
    ("hover-test-needs-keyboard", react_tests::hover_test_needs_keyboard::check),
    ("no-add-only-collection", lifecycles::no_add_only_collection::check),
    ("no-assertion-in-loop", test_assertions::loop_assertions::check),
    ("no-btoa-on-runtime-text", btoa_text::check),
    ("no-case-mixed-header-merge", urls::headers::check),
    ("no-case-sensitive-path-compare", urls::paths::compare::check),
    ("no-copied-constant", test_assertions::no_copied_constant::check),
    ("no-copy-pasted-tests", test_quality::copy_pasted::check),
    ("no-disabled-tls-verification", tls::check),
    ("no-sql-string-building", sql::check),
    ("no-non-latin1-header-value", header_values::check),
    ("no-route-without-auth", route_auth::check),
    ("require-client-timeout", timeouts::clients::check),
    ("require-http-timeout", timeouts::http::check),
    ("no-directory-passing-existence-check", existence::check),
    ("no-double-decode", urls::decoding::check),
    ("no-dynamic-import-of-path", urls::paths::imports::check),
    ("no-eager-relation", persistence::no_eager_relation::check),
    ("no-error-response-without-status", handlers::error_response_without_status),
    ("no-external-executables-in-unit-tests", test_runtime::no_external_executables_in_unit_tests::check),
    ("no-git-repository-per-test", test_runtime::per_test::rules::no_git_repository_per_test),
    ("no-hardcoded-secret", secrets::hardcoded::check),
    ("no-incomplete-escaping", escaping::incomplete::check),
    ("no-internal-module-mocks", test_runtime::no_internal_module_mocks::check),
    ("no-interval-polling-in-tests", test_runtime::interval_polling::check),
    ("no-listen-on-all-interfaces", listeners::no_listen_on_all_interfaces::check),
    ("no-lossy-utf8-decode", lossy_decoding::check),
    ("no-many-to-many-cascade-remove", persistence::no_many_to_many_cascade_remove::check),
    ("no-node-process-per-test", test_runtime::per_test::rules::no_node_process_per_test),
    ("no-orm-query-logging", database::no_orm_query_logging::check),
    ("no-orm-schema-sync", database::no_orm_schema_sync::check),
    ("no-production-console", modules::no_production_console::check),
    ("no-raw-http-value", http_values::check),
    ("no-secret-in-log", secrets::in_log::check),
    ("no-send-without-return", handlers::send_without_return),
    ("no-server-or-worker-per-test", test_runtime::per_test::rules::no_server_or_worker_per_test),
    ("no-shared-test-state", test_quality::no_shared_test_state::check),
    ("no-silent-catch", errors::no_silent_catch::check),
    ("no-slash-only-redirect-guard", redirects::check),
    ("no-switched-off-tests", test_assertions::switched_off::check),
    ("no-test-helpers-in-source", test_quality::helpers_in_source::check),
    ("no-unbounded-query-array", queries::arrays::no_unbounded_query_array::check),
    ("no-unchecked-response-json", response_json::check),
    ("no-unchecked-url-sink", urls::links::check),
    ("no-unencoded-url-part", urls::unencoded::check),
    ("no-unescaped-css-selector", selectors::check),
    ("no-unescaped-filter-value", wildcards::filters::check),
    ("no-unescaped-html-interpolation", html_text::check),
    ("no-unescaped-pattern-translation", wildcards::translation::check),
    ("no-unordered-query", queries::order::no_unordered_query::check),
    ("no-unowned-async-assertion", test_assertions::unowned_async::check),
    ("no-unpaged-listing", listings::no_unpaged_listing::check),
    ("no-unresolved-relative-url", urls::relative::check),
    ("no-unsafe-deserialization", deserialization::check),
    ("no-unstripped-remote-text", terminal::check),
    ("no-uncoerced-request-input", request_inputs::check),
    ("no-untrimmed-request-text", request_text::check),
    ("no-wait-for-with-fake-timers", test_runtime::no_wait_for_with_fake_timers::check),
    ("no-weak-hash", hashes::check),
    ("preserve-error-cause", errors::preserve_error_cause::check),
    ("react-test-no-implementation-details", react_tests::no_implementation_details::check),
    ("report-module-load-effects", modules::load_effects::check),
    ("require-error-listener", events::require_error_listener::check),
    ("settle-pending-on-close", lifecycles::settle_pending_on_close::check),
    ("structured-catch-logging", errors::logging::structured_catch_logging::check),
    ("test-must-use-production-runtime", test_runtime::production_runtime::check),
    ("time-unit-mismatch", time::units::check),
];

fn known() -> impl Iterator<Item = (&'static str, Rule)> {
    ALL.iter().copied().chain(testing_library::RULES.iter().map(|name| (*name, testing_library::check as Rule))).chain(typed::TYPED.iter().copied())
}


pub struct Selection {
    names: Vec<&'static str>,
    rules: Vec<Rule>,
    typed: Vec<Rule>,
    view: bool,
}

/// The names of `only` that are no rule of the engine.
pub fn unknown(only: &[String]) -> Vec<&str> {
    only.iter().map(String::as_str).filter(|wanted| !known().any(|(name, _)| name == *wanted)).collect()
}

pub fn selected(only: Option<&[String]>) -> Selection {
    let chosen: Vec<_> = known().filter(|(name, _)| only.is_none_or(|names| names.iter().any(|wanted| wanted == name))).collect();
    let mut rules: Vec<Rule> = Vec::new();
    for (_, rule) in chosen.iter().filter(|(name, _)| !typed::is_typed(name)) {
        if !rules.iter().any(|kept| std::ptr::fn_addr_eq(*kept, *rule)) {
            rules.push(*rule);
        }
    }
    let typed = chosen.iter().filter(|(name, _)| typed::is_typed(name)).map(|(_, rule)| *rule).collect();
    let view = chosen.iter().any(|(name, _)| ON_VIEW.contains(name) || name.starts_with("testing-library/"));
    Selection { names: chosen.iter().map(|(name, _)| *name).collect(), rules, typed, view }
}

impl Selection {
    pub fn len(&self) -> usize {
        self.names.len()
    }

    pub fn has_typed(&self) -> bool {
        !self.typed.is_empty()
    }
}

fn unparsed(display: &str, rule: &str) -> Vec<Reported> {
    vec![Finding { file: display.to_string(), line: 1, column: 1, rule: rule.into(), message: String::new(), symbol: None, priority: None, arguments: None }.into()]
}

fn lint_file(path: &str, display: &str, settings: &[String], (selected, rules, view): (&[&'static str], &[Rule], bool), types: Option<&std::cell::RefCell<typed::types::Types>>) -> Vec<Reported> {
    let Ok(text) = std::fs::read_to_string(path) else { return unparsed(display, "!parse") };
    if let Some(types) = types
        && !types.borrow_mut().enter(path, &text)
    {
        return unparsed(display, "!types");
    }
    let lint = |file: &super::ParsedFile| lint_parsed(file, display, settings, (selected, rules, view), types);
    match super::with_parsed(path, &text, lint) {
        Some(findings) => findings,
        None => super::with_parsed_module(path, &text, lint).unwrap_or_else(|| unparsed(display, "!parse")),
    }
}

/// The findings on a parsed file, or none when the file is to be parsed again as a module.
fn lint_parsed(file: &super::ParsedFile, display: &str, settings: &[String], (selected, rules, view): (&[&'static str], &[Rule], bool), types: Option<&std::cell::RefCell<typed::types::Types>>) -> Option<Vec<Reported>> {
    match support::early_errors::parsed(file) {
        support::early_errors::Verdict::Refused => return Some(unparsed(display, "!parse")),
        support::early_errors::Verdict::Module => return None,
        support::early_errors::Verdict::Linted => {}
    }
    let built = SemanticBuilder::new().with_build_nodes(true).with_check_syntax_error(true).build(file.program);
    if support::early_errors::refused(&built) {
        return Some(unparsed(display, "!parse"));
    }
    let semantic = built.semantic;
    let view = view.then(|| support::view::View::of(file.program.to_estree_json(true, true)));
    let scopes = view.as_ref().map(|view| support::scope::Scopes::of(&semantic, view));
    let estree = view.as_ref().zip(scopes.as_ref());
    let mut context = Context { file, semantic: &semantic, estree, selected, settings, types, display, scope: Default::default(), findings: Vec::new() };
    for rule in rules {
        rule(&mut context);
    }
    if types.is_some_and(|types| types.borrow().refused.is_some()) {
        return Some(unparsed(display, "!types"));
    }
    Some(context.findings)
}

/// A file to lint: the path to read, the path to report, and settings for this file alone.
pub struct Listed {
    pub path: String,
    pub display: String,
    pub settings: Vec<String>,
}

/// The stack of the threads that lint. `typescript-lint` runs on a thread of this size too, for the typed rules.
pub const STACK: usize = 512 << 20;

/// Lints every file with the untyped rules, in parallel, then with the typed ones against `types`, one file after
/// another. Without `types` the typed rules are left to the caller.
pub fn lint_files(files: &[Listed], rules: &Selection, types: Option<typed::types::Types>) -> Vec<Reported> {
    // Deeply nested files make the parser, the ESTree view and the rule walks recurse once per level, so the workers
    // get a large stack. Only the part that is used takes memory.
    let pool = rayon::ThreadPoolBuilder::new().stack_size(STACK).build().expect("threads");
    let untyped = (&rules.names[..], &rules.rules[..], rules.view);
    let mut findings: Vec<Reported> = pool.install(|| files.par_iter().flat_map_iter(|file| lint_file(&file.path, &file.display, &file.settings, untyped, None)).collect());
    match types {
        Some(types) if rules.has_typed() => {
            let types = std::cell::RefCell::new(types);
            for file in files {
                findings.extend(lint_file(&file.path, &file.display, &file.settings, (&rules.names, &rules.typed, true), Some(&types)));
            }
        }
        _ if rules.has_typed() => findings.extend(files.iter().flat_map(|file| unparsed(&file.display, "!types"))),
        _ => {}
    }
    findings.sort_by(|left, right| {
        let (left, right) = (&left.finding, &right.finding);
        left.file.cmp(&right.file).then(left.line.cmp(&right.line)).then(left.column.cmp(&right.column))
    });
    findings.dedup_by(|later, earlier| later.finding.rule.starts_with('!') && later.finding == earlier.finding);
    findings
}
