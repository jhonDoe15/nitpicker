//! `no-raw-http-value`: header values, cookie prefixes, `URL` parts and file extensions compared by exact case, and
//! structured headers split by hand.
mod forms;
mod origins;
mod url_parts;

use self::forms::{cookie_prefix, extension_lookup, hand_split, name_lookup, value_comparison};
use self::url_parts::url_case;
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;

const RULE: &str = "no-raw-http-value";
const PARSER_ROUTE: &str = "a parser: the `content-type`, `negotiator`, `accepts` or `cookie` package, or the framework helper (`req.accepts`, `req.is`, `c.req.parseBody`)";

fn value_case(header: &str) -> String {
    format!("The `{header}` header value is compared as exact text, but media types, charsets, encodings and schemes are case-insensitive, so `Application/JSON` or `HTTPS` is missed. Lowercase it first (`value.toLowerCase()`), or use {PARSER_ROUTE}.")
}

fn name_case(name: &str) -> String {
    let lower = name.to_lowercase();
    format!("`headers['{name}']` looks the header up by exact text, but Node lowercases the names of the request's `headers` object, so this finds nothing. Read `headers['{lower}']`, or use `Headers` and `.get()`, which ignore case.")
}

fn hand_split_message(header: &str) -> String {
    format!("The `{header}` header is split or matched by hand, which breaks on quoted values, whitespace around separators and quality weights. Use {PARSER_ROUTE}. An exception fits only the library that is itself the parser.")
}

const COOKIE_PREFIX: &str = "Cookie name prefixes are case-insensitive, so this exact-case check misses `__host-id`. Lowercase the name first (`name.toLowerCase().startsWith(\"__host-\")`), or use the cookie helper of the framework.";
const EXTENSION_CASE: &str = "File extensions are case-insensitive, so `PHOTO.PNG` misses this MIME table. Lowercase the extension first (`extname(file).toLowerCase()`), or look it up with the `mime` package.";

fn url_case_message(part: &str) -> String {
    format!("The `{part}` of a `URL` is already lower case, so a literal with capitals never matches. Compare with the lower-case text (`url.protocol === \"https:\"`).")
}

fn finding<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<String> {
    let value = || value_comparison(scopes, node).map(|header| value_case(&header));
    let names = || name_lookup(scopes, node).map(|name| name_case(&name));
    let extension = || extension_lookup(scopes, node).then(|| EXTENSION_CASE.to_string());
    match node.kind() {
        "CallExpression" => url_case(node)
            .map(|part| url_case_message(&part))
            .or_else(|| hand_split(scopes, node).map(|header| hand_split_message(&header)))
            .or_else(value)
            .or_else(|| cookie_prefix(node).then(|| COOKIE_PREFIX.to_string()))
            .or_else(extension),
        "MemberExpression" => names().or_else(value).or_else(extension),
        "BinaryExpression" => url_case(node).map(|part| url_case_message(&part)).or_else(value).or_else(names),
        "SwitchStatement" => value(),
        _ => None,
    }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let found: Vec<_> = view.nodes().filter_map(|node| finding(scopes, node).map(|message| (node.start(), node.end(), message))).collect();
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
