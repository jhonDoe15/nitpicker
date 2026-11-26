//! PMD's UnnecessaryWarningSuppression (pmd-core `UnnecessaryPmdSuppressionRule`): the `@SuppressWarnings` values
//! and `// NOPMD` comments that silenced no finding of any rule of the run. It runs after every other rule of a file.
mod unused;

use crate::java::pmd::coded::ctx::Ctx;
use crate::java::pmd::suppress::{Suppressions, pmd_name, warning};

pub const CLASS: &str = "net.sourceforge.pmd.lang.rule.impl.UnnecessaryPmdSuppressionRule";

/// The port named for the rule: it reports nothing by itself, the rule list runs `unnecessary` last.
pub fn placeholder(_: &Ctx, _: &mut Vec<super::ctx::Hit>) {}

/// Where PMD reports one unused suppressor: a node, or the line and byte of a comment.
pub enum Place {
    Node(u32),
    Comment(usize, usize),
}

pub fn unnecessary(ctx: &Ctx, quiet: &Suppressions) -> Vec<(Place, String)> {
    let mut found = Vec::new();
    if quiet.annotated() {
        for &annotation in ctx.all("Annotation") {
            let Some(warning) = warning(ctx.tree, ctx.file, ctx.machine.resolver, annotation) else { continue };
            let mut unused_parts = Vec::new();
            let mut whole = true;
            for (part, value) in &warning.parts {
                if quiet.part_used(*part) {
                    whole = false;
                } else if pmd_name(value) || (value == "unused" && unused::unambiguous(ctx, annotation)) {
                    unused_parts.push((Place::Node(*part), format!("Unnecessary suppression \"{value}\" in @SuppressWarnings annotation")));
                } else {
                    whole = false;
                }
            }
            if !warning.parts.is_empty() && whole {
                found.push((Place::Node(annotation), "Unnecessary @SuppressWarnings annotation".to_string()));
            } else {
                found.extend(unused_parts);
            }
        }
    }
    for (line, byte) in quiet.unused_comments() {
        found.push((Place::Comment(line, byte), "Unnecessary PMD suppression comment".to_string()));
    }
    found
}

/// Adds the findings of the rule for a file; PMD does not let any suppressor silence them.
pub fn report(ctx: &Ctx, quiet: &Suppressions, rule: &str, out: &mut Vec<crate::engine::finding::Finding>) -> usize {
    let found = unnecessary(ctx, quiet);
    let count = found.len();
    for (place, reason) in found {
        let (line, column) = match place {
            Place::Node(node) => (ctx.whole(node, "BeginLine").unwrap_or(0) as usize, ctx.whole(node, "BeginColumn").unwrap_or(0) as usize),
            Place::Comment(_, byte) => ctx.tree.place(ctx.file, byte),
        };
        let message = super::formatted(&reason, &[]);
        out.push(crate::engine::finding::Finding {
            file: ctx.file.path.clone(),
            line,
            column,
            rule: rule.to_string(),
            message,
            symbol: None,
            priority: None,
            arguments: None,
        });
    }
    count
}
