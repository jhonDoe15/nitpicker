//! `no-unescaped-pattern-translation`: a chain of `replace` calls that turns a glob or pattern into a regex or a
//! SQL `LIKE` pattern without escaping the target's metacharacters first.
use super::chains::{is_chain_top, is_escaped_root, is_escaping_replacement, replace_chain_at};
use super::sinks::flows_to_regexp;
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::{resolve_constant, unwrapped};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};

const RULE: &str = "no-unescaped-pattern-translation";
const REGEX_TRANSLATION: &str = "This chain of `replace` calls turns a glob or pattern into a regex without escaping the regex metacharacters first, so a `.`, `+`, `(` or `$` in the value changes what matches. Escape first (`escapeRegExp(value)`) and restore the wildcards from their escaped form (`\\*\\*` to `.*`), or tokenise the pattern and map each token, or use a glob library.";
const LIKE_TRANSLATION: &str = "This chain of `replace` calls builds a SQL `LIKE` pattern without escaping `%`, `_` and the escape character first, so those characters in the value act as wildcards. Escape them (`replace(/[\\\\%_]/g, '\\\\$&')`) before mapping the wildcards, add `ESCAPE '\\\\'`, or tokenise the pattern and map each token.";
const REGEX_TOKENS: [&str; 15] = [
    ".*", ".+", ".", ".?", "(.*)", "(.+)", "[^/]*", "[^/]+", "[^/]", "([^/]*)", "([^/]+)", "[^\\/]*", "[^\\/]+", "[\\s\\S]*",
    "[\\s\\S]+",
];

fn is_constant_root(scopes: &Scopes, root: Node) -> bool {
    let Some(resolved) = resolve_constant(scopes, Some(root)).map(unwrapped) else { return false };
    let text = resolved.is("Literal") && matches!(resolved.get("value"), Value::Text(..));
    text || (resolved.is("TemplateLiteral") && resolved.nodes("expressions").is_empty())
}

fn translation(replacements: &[Option<String>]) -> Option<&'static str> {
    let texts: Vec<&str> = replacements.iter().map(|replacement| replacement.as_deref().unwrap_or("")).collect();
    let likes: Vec<&&str> = texts.iter().filter(|text| **text == "%" || **text == "_").collect();
    if likes.iter().any(|text| ***text == *"%") && likes.len() >= 2 {
        return Some(LIKE_TRANSLATION);
    }
    texts.iter().any(|text| REGEX_TOKENS.contains(text)).then_some(REGEX_TRANSLATION)
}

fn is_reported(scopes: &Scopes, node: Node) -> Option<&'static str> {
    if !is_chain_top(node) {
        return None;
    }
    let chain = replace_chain_at(node);
    if chain.replacements.len() < 2 {
        return None;
    }
    let kind = translation(&chain.replacements)?;
    let escaped = chain.replacements.iter().any(|replacement| is_escaping_replacement(replacement.as_deref()));
    if escaped || is_escaped_root(chain.root) || is_constant_root(scopes, chain.root) {
        return None;
    }
    (kind == LIKE_TRANSLATION || flows_to_regexp(scopes, node).is_some()).then_some(kind)
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let found: Vec<(Node, &str)> =
        view.nodes().filter(|node| node.is("CallExpression")).filter_map(|node| is_reported(scopes, node).map(|kind| (node, kind))).collect();
    for (node, message) in found {
        context.report_range(RULE, node.start(), Some(node.end()), message.to_string());
    }
}
