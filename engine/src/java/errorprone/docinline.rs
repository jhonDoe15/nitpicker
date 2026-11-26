//! MalformedInlineTag and PreferThrowsTag.
use super::doc::Kind;
use super::fixes::Fix;
use super::javadoc::{Documented, Element};
use regex::Regex;
use std::sync::LazyLock;

static MALFORMED: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"@\{(code|docRoot|link|linkplain|literal|snippet|inheritDoc|value)").unwrap());

pub(super) fn malformed_inline_tag(documented: &Documented) {
    let text: String = documented.comment.text.iter().collect();
    let chars: Vec<usize> = text.char_indices().map(|(at, _)| at).collect();
    let index = |byte: usize| chars.partition_point(|at| *at < byte);
    for found in MALFORMED.captures_iter(&text) {
        let (Some(whole), Some(tag)) = (found.get(0), found.get(1)) else { continue };
        let (start, end) = (index(whole.start()), index(whole.end()));
        let (Some(from), Some(to)) = (documented.comment.source_pos(start), documented.comment.source_pos(end)) else { continue };
        let message = format!("The correct syntax to open this inline tag is {{@{}.", tag.as_str());
        let fix = Fix::replace(from, to, &format!("{{@{}", tag.as_str()));
        documented.context.report_fixed("MalformedInlineTag", documented.node, from, &message, &[fix]);
    }
}

pub(super) fn prefer_throws_tag(documented: &Documented) {
    if documented.element != Element::Method {
        return;
    }
    documented.doc.visit(&mut |tree, _| {
        if tree.kind == Kind::Block && tree.name == "exception" {
            let Some(start) = documented.comment.source_pos(tree.pos) else { return };
            let fix = Fix::replace(start, start + "@exception".len(), "@throws");
            documented.context.report_fixed("PreferThrowsTag", documented.node, start, "Prefer the @throws javadoc tag instead of @exception.", &[fix]);
        }
    });
}
