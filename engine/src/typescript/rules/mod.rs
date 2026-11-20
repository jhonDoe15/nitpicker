//! Lint rules on the shared parse. Ids, messages and positions are those of the ESLint-plugin rule of the same name.
mod no_silent_catch;

use super::ParsedFile;
use crate::engine::finding::Finding;
use oxc_semantic::{Semantic, SemanticBuilder};
use oxc_span::Span;
use rayon::prelude::*;

pub struct Context<'a, 's> {
    pub file: &'s ParsedFile<'a>,
    pub semantic: &'s Semantic<'a>,
    display: &'s str,
    findings: Vec<Finding>,
}

impl<'a> Context<'a, '_> {
    pub fn text(&self, span: Span) -> &'a str {
        self.file.slice(span.start, span.end)
    }

    pub fn report(&mut self, rule: &str, span: Span, message: String) {
        self.findings.push(Finding {
            file: self.display.to_string(),
            line: self.file.lines.line(span.start) as usize,
            column: self.file.lines.column_utf16(self.file.text, span.start) as usize + 1,
            rule: format!("nitpicker/{rule}"),
            message,
        });
    }
}

pub type Rule = fn(&mut Context);

pub const ALL: &[(&str, Rule)] = &[("no-silent-catch", no_silent_catch::check)];

pub fn selected(only: Option<&[String]>) -> Vec<Rule> {
    ALL.iter().filter(|(name, _)| only.is_none_or(|names| names.iter().any(|wanted| wanted == name))).map(|(_, rule)| *rule).collect()
}

fn lint_file(path: &str, display: &str, rules: &[Rule]) -> Vec<Finding> {
    let Ok(text) = std::fs::read_to_string(path) else { return Vec::new() };
    super::with_parsed(path, &text, |file| {
        if file.panicked {
            return vec![Finding { file: display.to_string(), line: 1, column: 1, rule: "!parse".into(), message: String::new() }];
        }
        let semantic = SemanticBuilder::new().with_build_nodes(true).build(file.program).semantic;
        let mut context = Context { file, semantic: &semantic, display, findings: Vec::new() };
        for rule in rules {
            rule(&mut context);
        }
        context.findings
    })
}

/// Each entry is the path to read and the path to report.
pub fn lint_files(files: &[(String, String)], rules: &[Rule]) -> Vec<Finding> {
    let mut findings: Vec<Finding> = files.par_iter().flat_map_iter(|(path, display)| lint_file(path, display, rules)).collect();
    findings.sort();
    findings
}
