//! `no-unescaped-filter-value`: text given to a LIKE, `contains`, `startsWith` or regex filter without escaping
//! its wildcards.
mod sites;
mod values;

use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use sites::{Site, call_sites, property_site, template_sites};
use values::unescaped_leaf;

const RULE: &str = "no-unescaped-filter-value";

fn message(value: &str, operator: &str) -> String {
    format!(
        "Escape `{value}` before it goes into the `{operator}` filter (`escapeSqlLikePattern({value})` with `ESCAPE` where the dialect needs it, or `escapeRegExp` for a regex): `%`, `_`, `\\` and regex characters in it match other rows. Use a full-text or equality filter instead, or take an exception when wildcards are an intended feature of the input."
    )
}

fn sites_of(node: Node) -> Vec<Site> {
    match node.kind() {
        "Property" => property_site(node).into_iter().collect(),
        "CallExpression" => call_sites(node),
        "TaggedTemplateExpression" => template_sites(node),
        _ => Vec::new(),
    }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let text = context.file.text;
    let mut found = Vec::new();
    for site in view.nodes().flat_map(sites_of) {
        if let Some(leaf) = unescaped_leaf(scopes, site.value) {
            let value = &text[leaf.start() as usize..leaf.end() as usize];
            found.push((leaf.start(), leaf.end(), message(value, &site.operator)));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
