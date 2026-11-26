//! `no-unknown-in-domain`: the unknown type in a parameter or property type, also through a type alias, and in a
//! documentation comment when the `jsdoc` option is on.
use super::aliases::Aliases;
use super::jsdoc::has_unknown_member_tag;
use super::positions::is_reportable;
use crate::typescript::rules::Context;

const RULE: &str = "no-unknown-in-domain";
const DEFAULT_PHRASE: &str = "a zod schema";

fn message(phrase: &str) -> String {
    format!("domain/ code takes typed values, not unknown (also through a type alias). Write a readonly type for this value in domain/; adapters/ parses the input with {phrase} and passes the result in (the parsed value is assignable to a readonly type; do not import the schema type from adapters/). A caught error may be typed unknown as `cause` or `error`. An exception fits only when the value is genuinely opaque.")
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let aliases = Aliases { scopes, types };
    let mut found: Vec<(u32, u32)> = Vec::new();
    for node in view.nodes() {
        let hit = match node.kind() {
            "TSUnknownKeyword" => is_reportable(node),
            "TSTypeReference" => is_reportable(node) && aliases.references_unknown(node),
            _ => false,
        };
        if types.borrow().refused.is_some() {
            return;
        }
        if hit {
            found.push((node.start(), node.end()));
        }
    }
    if context.setting(&format!("{RULE}.jsdoc")) == Some("true") {
        for comment in context.file.program.comments.iter().filter(|comment| comment.is_block()) {
            let text = context.file.slice(comment.span.start, comment.span.end);
            let value = text.strip_prefix("/*").and_then(|inner| inner.strip_suffix("*/")).unwrap_or_default();
            if has_unknown_member_tag(value) {
                found.push((comment.span.start, comment.span.end));
            }
        }
    }
    let text = message(context.setting(&format!("{RULE}.phrase")).unwrap_or(DEFAULT_PHRASE));
    for (start, end) in found {
        context.report_range(RULE, start, Some(end), text.clone());
    }
}
