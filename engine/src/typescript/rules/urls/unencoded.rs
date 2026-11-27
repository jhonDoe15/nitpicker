//! `no-unencoded-url-part`: a query value, path segment or credential put into a URL template without encoding, a
//! query appended to a URL that may have one, and a path starting the target of `new URL(path, base)`.
use super::values::{
    CONSTANT_NAME, SPACE, is_encoded_text, is_plain_value, is_url_constructor, last_name_of, leaf_names_of, quasi_text, source, string_value,
};
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::resolve_constant;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-unencoded-url-part";
const QUERY_VALUE: &str = "Encode this query value with `encodeURIComponent(value)`, or build the URL with `url.searchParams.set(name, value)`. A value with `&`, `#`, `+` or non-ASCII text changes the URL.";
const PATH_SEGMENT: &str = "Encode this path segment with `encodeURIComponent(value)`: a value with `/`, `?`, `#` or `..` changes the route. Encode a key that keeps its slashes per segment.";
const APPENDED_QUERY: &str = "This appends `?` to a URL that may already carry a query. Build it with `const url = new URL(base); url.searchParams.set(name, value)`.";
const RELATIVE_START: &str = "A path that starts with `//` passed to `new URL(path, base)` replaces the host. Reject a path that does not start with a single `/` before building the URL.";
const CREDENTIALS: &str = "Encode a user name or password put into a connection URL with `encodeURIComponent(value)`: `@`, `:`, `/` and `#` in it change the host.";

fn pattern(text: &str) -> Regex {
    Regex::new(&text.replace("SPACE", SPACE)).expect("pattern")
}

struct Patterns {
    query_value_start: Regex,
    scheme_start: Regex,
    credential_scheme: Regex,
    url_name: Regex,
    segment_name: Regex,
    query_name: Regex,
    slash_keeping_segment: Regex,
    credential_name: Regex,
    link_name: Regex,
    fixed_base_name: Regex,
    mock_file: Regex,
    path_name: Regex,
    space: Regex,
    url_part: Regex,
}

static PATTERNS: LazyLock<Patterns> = LazyLock::new(|| Patterns {
    query_value_start: pattern(r"[?&][^\t\n\x0B\x0C\r\p{Z}\x{FEFF}?&=#/]+=$"),
    scheme_start: pattern(r"(?i)^(?:[a-z][a-z0-9+.-]*:)?//"),
    credential_scheme: pattern(r"(?i)(?:postgres(?:ql)?|mysql|mariadb|rediss?|mongodb(?:\+srv)?|amqps?)://$"),
    url_name: pattern(r"(?i)(?:url|uri|endpoint|origin|host)s?$|^api"),
    segment_name: pattern(r"(?i)(?:branch|ref|tag|title|username|filename|label|query|search|term|keyword|message|email|token)$|^q$"),
    query_name: pattern(concat!(
        r"(?i)(?:branch|ref|tag|title|username|filename|label|query|search|term|keyword|message|email|url|uri|",
        r"href|link|path|redirect|callback|returnTo|next|error|description|reason|text)s?$|^q$",
    )),
    slash_keeping_segment: pattern(concat!(
        r"(?i)/(?:blob|tree|src|raw|commits?|blame|browse|heads|tags?|refs|-|branch|_edit|archive|",
        r"contents|tar\.gz|zipball)/$",
    )),
    credential_name: pattern(r"(?i)(?:user|username|login|password|passwd|pwd)$"),
    link_name: pattern(r"(?i)(?:action|callback|redirect)(?:url|uri|to)?$|returnTo$"),
    fixed_base_name: pattern(r"(?i)^(?:base|api|origin|host|root|site|app|server|endpoint|public)"),
    mock_file: pattern(r"__mocks__|\.mock\."),
    path_name: pattern(r"(?i)(?:path|pathname|route)$"),
    space: pattern("SPACE"),
    url_part: pattern(r"(?i)url|uri"),
});

struct Check<'c, 'a, 's> {
    scopes: &'c Scopes<'a, 's>,
    text: &'a str,
}

impl<'s> Check<'_, '_, 's> {
    fn is_open(&self, node: Node) -> bool {
        !(is_plain_value(node) || is_encoded_text(source(self.text, node)))
    }

    fn texts(template: Node) -> Vec<String> {
        (0..template.list("quasis").len()).map(|index| quasi_text(template, index)).collect()
    }

    fn first_name(template: Node) -> String {
        last_name_of(template.nodes("expressions").first().copied().unwrap_or(template)).unwrap_or_default()
    }

    fn looks_like_url(&self, template: Node) -> bool {
        let p = &*PATTERNS;
        let texts = Self::texts(template);
        let first = texts.first().cloned().unwrap_or_default();
        let anchored = p.scheme_start.is_match(&first) || (first.is_empty() && p.url_name.is_match(&Self::first_name(template)));
        !texts.iter().any(|text| p.space.is_match(text)) && (anchored || p.query_value_start.is_match(&first))
    }

    fn query_reports(&self, template: Node<'s>, found: &mut Vec<(Node<'s>, &'static str)>) {
        let p = &*PATTERNS;
        for (index, expression) in template.nodes("expressions").into_iter().enumerate() {
            if p.query_value_start.is_match(&quasi_text(template, index))
                && leaf_names_of(expression).iter().any(|name| p.query_name.is_match(name))
                && self.is_open(expression)
            {
                found.push((expression, QUERY_VALUE));
            }
        }
    }

    fn segment_reports(&self, template: Node<'s>, found: &mut Vec<(Node<'s>, &'static str)>) {
        let p = &*PATTERNS;
        let first = quasi_text(template, 0);
        let anchored = p.scheme_start.is_match(&first) || p.url_name.is_match(&Self::first_name(template));
        for (index, expression) in template.nodes("expressions").into_iter().enumerate() {
            let tail = quasi_text(template, index);
            if anchored
                && index > 0
                && tail.ends_with('/')
                && leaf_names_of(expression).iter().any(|name| p.segment_name.is_match(name))
                && !p.slash_keeping_segment.is_match(&tail)
                && self.is_open(expression)
            {
                found.push((expression, PATH_SEGMENT));
            }
        }
    }

    fn is_query_free(&self, base: Option<Node<'s>>) -> bool {
        let value = base.and_then(|base| resolve_constant(self.scopes, Some(base)));
        if let Some(value) = value.filter(|value| value.is("TemplateLiteral")) {
            return (0..value.list("quasis").len()).all(|index| !quasi_text(value, index).contains('?'));
        }
        string_value(value).is_some_and(|text| !text.contains('?'))
    }

    fn appended_query(&self, template: Node<'s>, found: &mut Vec<(Node<'s>, &'static str)>) {
        let p = &*PATTERNS;
        let base = template.nodes("expressions").first().copied();
        let names = base.map(leaf_names_of).unwrap_or_default();
        if quasi_text(template, 0).is_empty()
            && quasi_text(template, 1).starts_with('?')
            && names.iter().any(|name| p.link_name.is_match(name))
            && !names.iter().any(|name| p.fixed_base_name.is_match(name) || CONSTANT_NAME.is_match(name))
            && !self.is_query_free(base)
        {
            found.push((template, APPENDED_QUERY));
        }
    }

    fn credential_reports(&self, template: Node<'s>, found: &mut Vec<(Node<'s>, &'static str)>) {
        let p = &*PATTERNS;
        let expressions = template.nodes("expressions");
        for (index, expression) in expressions.iter().copied().enumerate() {
            let tail = quasi_text(template, index);
            let user = p.credential_scheme.is_match(&tail) && p.credential_name.is_match(&last_name_of(expression).unwrap_or_default());
            let password = expressions.get(index + 1).copied();
            let mut candidates: Vec<Node> = if user { vec![expression] } else { Vec::new() };
            if user && quasi_text(template, index + 1) == ":" {
                candidates.extend(password);
            }
            if let Some(node) = candidates.into_iter().find(|value| self.is_open(*value)) {
                found.push((node, CREDENTIALS));
            }
        }
    }

    fn template(&self, template: Node<'s>) -> Option<(Node<'s>, &'static str)> {
        if template.parent().is_some_and(|parent| parent.is("TaggedTemplateExpression")) {
            return None;
        }
        let mut found = Vec::new();
        self.credential_reports(template, &mut found);
        self.appended_query(template, &mut found);
        if self.looks_like_url(template) {
            self.query_reports(template, &mut found);
            self.segment_reports(template, &mut found);
        }
        found.into_iter().next()
    }
}

fn is_parsed_pathname(node: Node) -> bool {
    node.is("MemberExpression")
        && last_name_of(node).as_deref() == Some("pathname")
        && PATTERNS.url_part.is_match(&node.node("object").and_then(last_name_of).unwrap_or_default())
}

fn relative_start(node: Node) -> Option<Node> {
    let p = &*PATTERNS;
    let arguments = node.nodes("arguments");
    let target = arguments.first().copied().filter(|target| target.is("TemplateLiteral"))?;
    arguments.get(1)?;
    let first = target.nodes("expressions").first().copied()?;
    let name = last_name_of(first).unwrap_or_default();
    let starts = is_url_constructor(node.node("callee")) && quasi_text(target, 0).is_empty();
    (starts && p.path_name.is_match(&name) && !p.fixed_base_name.is_match(&name) && !is_parsed_pathname(first)).then_some(target)
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    if PATTERNS.mock_file.is_match(context.file.path) {
        return;
    }
    let state = Check { scopes, text: context.file.text };
    let mut found = Vec::new();
    for node in view.nodes() {
        let report = match node.kind() {
            "TemplateLiteral" => state.template(node),
            "NewExpression" => relative_start(node).map(|target| (target, RELATIVE_START)),
            _ => None,
        };
        found.extend(report);
    }
    for (node, message) in found {
        context.report_range(RULE, node.start(), Some(node.end()), message.to_string());
    }
}
