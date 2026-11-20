//! Lint rules on the shared parse. Ids, messages and positions are those of the ESLint-plugin rule of the same name.
mod errors;
mod lifecycles;
mod listeners;
mod modules;
pub mod support;
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
    findings: Vec<Reported>,
}

/// A finding, and where its range ends when the rule reports a range and not a point.
#[derive(Clone, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub struct Reported {
    pub finding: Finding,
    pub end: Option<(usize, usize)>,
}

impl From<Finding> for Reported {
    fn from(finding: Finding) -> Reported {
        Reported { finding, end: None }
    }
}

impl<'a> Context<'a, '_> {
    pub fn setting(&self, key: &str) -> Option<&str> {
        self.settings.iter().find_map(|setting| setting.strip_prefix(key).and_then(|rest| rest.strip_prefix('=')))
    }

    pub fn display(&self) -> &str {
        self.display
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

    fn place(&self, offset: u32) -> (usize, usize) {
        (self.file.lines.line(offset) as usize, self.file.lines.column_utf16(self.file.text, offset) as usize + 1)
    }

    /// Reports from `start`, up to `end` when the rule reports a range and not a point.
    pub fn report_range(&mut self, rule: &str, start: u32, end: Option<u32>, message: String) {
        let (line, column) = self.place(start);
        let rule = if rule.contains('/') { rule.to_string() } else { format!("nitpicker/{rule}") };
        let finding = Finding { file: self.display.to_string(), line, column, rule, message };
        self.findings.push(Reported { finding, end: end.map(|end| self.place(end)) });
    }
}

pub type Rule = fn(&mut Context);

/// Rules written against the ESTree-shaped view.
const ON_VIEW: &[&str] = &["no-add-only-collection", "settle-pending-on-close"];

pub const ALL: &[(&str, Rule)] = &[
    ("no-add-only-collection", lifecycles::no_add_only_collection::check),
    ("no-listen-on-all-interfaces", listeners::no_listen_on_all_interfaces::check),
    ("no-production-console", modules::no_production_console::check),
    ("no-silent-catch", errors::no_silent_catch::check),
    ("settle-pending-on-close", lifecycles::settle_pending_on_close::check),
];

fn known() -> impl Iterator<Item = (&'static str, Rule)> {
    ALL.iter().copied().chain(testing_library::RULES.iter().map(|name| (*name, testing_library::check as Rule)))
}


pub struct Selection {
    names: Vec<&'static str>,
    rules: Vec<Rule>,
    view: bool,
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
    let Ok(text) = std::fs::read_to_string(path) else { return Vec::new() };
    super::with_parsed(path, &text, |file| {
        if file.panicked {
            return vec![Finding { file: display.to_string(), line: 1, column: 1, rule: "!parse".into(), message: String::new() }.into()];
        }
        let semantic = SemanticBuilder::new().with_build_nodes(true).build(file.program).semantic;
        let view = selection.view.then(|| support::view::View::of(file.program.to_estree_json(true, true)));
        let scopes = view.as_ref().map(|view| support::scope::Scopes::of(&semantic, view));
        let estree = view.as_ref().zip(scopes.as_ref());
        let mut context = Context { file, semantic: &semantic, estree, selected: &selection.names, settings, display, findings: Vec::new() };
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
    findings.sort();
    findings
}
