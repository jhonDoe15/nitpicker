//! Lint rules on the shared parse. Ids, messages and positions are those of the ESLint-plugin rule of the same name.
mod errors;
mod lifecycles;
mod listeners;
mod modules;
mod react_tests;
pub mod support;
mod test_runtime;
pub mod testing_library;

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
        let finding = Finding { file: self.display.to_string(), line, column, rule, message, symbol: None };
        self.findings.push(Reported { finding, end: end.map(|end| self.place(end)), conditions });
    }
}

pub type Rule = fn(&mut Context);

/// Rules written against the ESTree-shaped view.
const ON_VIEW: &[&str] = &["hover-test-needs-keyboard", "no-add-only-collection", "no-external-executables-in-unit-tests", "no-internal-module-mocks", "no-wait-for-with-fake-timers", "preserve-error-cause", "react-test-no-implementation-details", "settle-pending-on-close", "structured-catch-logging"];

pub const ALL: &[(&str, Rule)] = &[
    ("hover-test-needs-keyboard", react_tests::hover_test_needs_keyboard::check),
    ("no-add-only-collection", lifecycles::no_add_only_collection::check),
    ("no-external-executables-in-unit-tests", test_runtime::no_external_executables_in_unit_tests::check),
    ("no-internal-module-mocks", test_runtime::no_internal_module_mocks::check),
    ("no-listen-on-all-interfaces", listeners::no_listen_on_all_interfaces::check),
    ("no-production-console", modules::no_production_console::check),
    ("no-silent-catch", errors::no_silent_catch::check),
    ("no-wait-for-with-fake-timers", test_runtime::no_wait_for_with_fake_timers::check),
    ("preserve-error-cause", errors::preserve_error_cause::check),
    ("react-test-no-implementation-details", react_tests::no_implementation_details::check),
    ("settle-pending-on-close", lifecycles::settle_pending_on_close::check),
    ("structured-catch-logging", errors::logging::structured_catch_logging::check),
];

fn known() -> impl Iterator<Item = (&'static str, Rule)> {
    ALL.iter().copied().chain(testing_library::RULES.iter().map(|name| (*name, testing_library::check as Rule)))
}


pub struct Selection {
    names: Vec<&'static str>,
    rules: Vec<Rule>,
    view: bool,
}

/// The names of `only` that are no rule of the engine.
pub fn unknown(only: &[String]) -> Vec<&str> {
    only.iter().map(String::as_str).filter(|wanted| !known().any(|(name, _)| name == *wanted)).collect()
}

pub fn selected(only: Option<&[String]>) -> Selection {
    let chosen: Vec<_> = known().filter(|(name, _)| only.is_none_or(|names| names.iter().any(|wanted| wanted == name))).collect();
    let mut rules: Vec<Rule> = Vec::new();
    for (_, rule) in &chosen {
        if !rules.iter().any(|kept| std::ptr::fn_addr_eq(*kept, *rule)) {
            rules.push(*rule);
        }
    }
    let view = chosen.iter().any(|(name, _)| ON_VIEW.contains(name) || name.starts_with("testing-library/"));
    Selection { names: chosen.iter().map(|(name, _)| *name).collect(), rules, view }
}

impl Selection {
    pub fn len(&self) -> usize {
        self.names.len()
    }
}

fn lint_file(path: &str, display: &str, settings: &[String], selection: &Selection) -> Vec<Reported> {
    let unparsed = || vec![Finding { file: display.to_string(), line: 1, column: 1, rule: "!parse".into(), message: String::new(), symbol: None }.into()];
    let Ok(text) = std::fs::read_to_string(path) else { return unparsed() };
    super::with_parsed(path, &text, |file| {
        if file.panicked || !file.errors.is_empty() {
            return unparsed();
        }
        let built = SemanticBuilder::new().with_build_nodes(true).with_check_syntax_error(true).build(file.program);
        if !built.diagnostics.is_empty() {
            return unparsed();
        }
        let semantic = built.semantic;
        let view = selection.view.then(|| support::view::View::of(file.program.to_estree_json(true, true)));
        let scopes = view.as_ref().map(|view| support::scope::Scopes::of(&semantic, view));
        let estree = view.as_ref().zip(scopes.as_ref());
        let mut context = Context { file, semantic: &semantic, estree, selected: &selection.names, settings, display, scope: Default::default(), findings: Vec::new() };
        for rule in &selection.rules {
            rule(&mut context);
        }
        context.findings
    })
}

/// A file to lint: the path to read, the path to report, and settings for this file alone.
pub struct Listed {
    pub path: String,
    pub display: String,
    pub settings: Vec<String>,
}

pub fn lint_files(files: &[Listed], rules: &Selection) -> Vec<Reported> {
    let mut findings: Vec<Reported> = files.par_iter().flat_map_iter(|file| lint_file(&file.path, &file.display, &file.settings, rules)).collect();
    findings.sort_by(|left, right| {
        let (left, right) = (&left.finding, &right.finding);
        left.file.cmp(&right.file).then(left.line.cmp(&right.line)).then(left.column.cmp(&right.column))
    });
    findings
}
