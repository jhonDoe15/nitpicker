//! `no-unescaped-html-interpolation`: a value put into an HTML string, by a template or a `+` chain, without
//! escaping.
pub mod parts;
mod safe;

use self::parts::{fragment_of, is_diagnostic_text, is_fragment_top, is_markup, is_placed_in_markup};
use self::safe::is_safe_value;
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::unwrapped;
use crate::typescript::rules::urls::values::source;

const RULE: &str = "no-unescaped-html-interpolation";
const MESSAGE: &str = "Escape `{{ value }}` before it goes into this HTML string: a quote, `<` or `&` in it breaks the markup or injects script. Wrap it in an escaping helper (`escapeHtml({{ value }})`), build the markup with a template engine that escapes by default, or set it with DOM APIs (`textContent`, `setAttribute`). A value that is always an id or an enum can take an exception.";

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let text = context.file.text;
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("TemplateLiteral") || node.is("BinaryExpression")) {
        let Some(fragment) = fragment_of(node) else { continue };
        if !is_fragment_top(node) || !is_markup(&fragment.texts) || is_diagnostic_text(node) {
            continue;
        }
        for value in &fragment.values {
            if is_placed_in_markup(&fragment, *value) && !is_safe_value(scopes, *value) {
                found.push((*value, source(text, unwrapped(*value)).to_string()));
            }
        }
    }
    for (value, shown) in found {
        context.report_range(RULE, value.start(), Some(value.end()), MESSAGE.replace("{{ value }}", &shown));
    }
}
