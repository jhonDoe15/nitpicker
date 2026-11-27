//! `no-slash-only-redirect-guard`: a redirect target accepted as same-site only because it starts with a slash, and
//! a redirect to a parsed URL's `pathname` after its origin was compared.
mod guards;

use self::guards::{is_sink, slash_guard_target};
use crate::typescript::rules::Context;
use crate::typescript::rules::handlers::walk::enclosing_function;
use crate::typescript::rules::patterns::syntax::operands_of;
use crate::typescript::rules::security_values::resolve_constant;
use crate::typescript::rules::signatures::unwrap;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_runtime::production_runtime::first_token;
use crate::typescript::rules::urls::values::{last_name_of, source};
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-slash-only-redirect-guard";
const SLASH_ONLY: &str = "A target that starts with `/` can still be `//host` or `/\\host`, which browsers treat as another site. Resolve it against a fixed origin and compare the origin back (`new URL(value, base).origin === base`), or allow only exact paths.";
const PATHNAME: &str = "A same-origin pathname can still be `//host`, so redirecting to `pathname + search` can leave the site. Reject a pathname that starts with `//` or a backslash, or redirect to the resolved `URL` after comparing its origin.";
const ASSERTION_FORMS: [&str; 3] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"];
/// `\w` of a JavaScript regular expression with the `i` and `u` flags.
const WORD: &str = r"[A-Za-z0-9_\x{17F}\x{212A}]";

static TARGET_NAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:callback|redirect|return|next|continue|target|destination|goto|success)(?:url|uri|to|path)?$|^(?:from|callback)$")
        .expect("pattern")
});
static DOUBLE_SLASH_CHECK: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)['"`]//['"`]|startsWith\(['"`]//|['"`]\\{2,}['"`]|%2f|%5c|\\/\\/|\(\?!|\[\^/|\[\^\\/"#).expect("pattern")
});
static HELPER_CHECK: LazyLock<fancy_regex::Regex> = LazyLock::new(|| {
    let pattern = r"(?i)(?<!W)(?:isSafe|isValid|isAllowed|isLocal|isRelative|sanitiz|safeRedirect|validateRedirect)W*\(|new URL\(|\.origin(?!W)";
    fancy_regex::Regex::new(&pattern.replace('W', WORD)).expect("pattern")
});
static SAME_ORIGIN_CHECK: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\.origin(?-u:\b)").expect("pattern"));

struct Check<'c, 'a, 's> {
    scopes: &'c Scopes<'a, 's>,
    text: &'a str,
}

impl<'s> Check<'_, '_, 's> {
    fn scope_text(&self, node: Node) -> &str {
        enclosing_function(node).map_or(&self.text[first_token(self.text)..], |function| source(self.text, function))
    }

    fn flows_target(&self, node: Node, target: &str) -> bool {
        let mentions = |part: Node| source(self.text, part).contains(target);
        if node.is("ReturnStatement") {
            return node.node("argument").is_some_and(mentions);
        }
        node.is("CallExpression") && is_sink(node) && node.nodes("arguments").into_iter().any(mentions)
    }

    fn uses_target(&self, region: Node, target: &str) -> bool {
        region.descendants().into_iter().any(|node| self.flows_target(node, target))
            || (!region.is("BlockStatement") && source(self.text, region).contains(target))
    }

    fn guarded(&self, guards: &[(Node<'s>, Node<'s>)], region: Node<'s>, found: &mut Vec<(Node<'s>, &'static str)>) {
        for (target, test) in guards {
            let scope = self.scope_text(*test);
            let helper = HELPER_CHECK.is_match(scope).unwrap_or(false);
            if TARGET_NAME.is_match(&last_name_of(*target).unwrap_or_default())
                && !DOUBLE_SLASH_CHECK.is_match(scope)
                && !helper
                && self.uses_target(region, source(self.text, *target))
            {
                found.push((*test, SLASH_ONLY));
            }
        }
    }

    fn pathname_sink(&self, node: Node<'s>) -> Option<Node<'s>> {
        let argument = node.list("arguments").first().copied().flatten().filter(|argument| !argument.is("SpreadElement"))?;
        if !is_sink(node) {
            return None;
        }
        let mut leading = argument;
        while let Some(left) = leading.node("left").filter(|_| leading.is("BinaryExpression")) {
            leading = left;
        }
        let first = if leading.is("TemplateLiteral") { leading.nodes("expressions").first().copied()? } else { leading };
        let value = unwrap(first, &ASSERTION_FORMS);
        let pathname = value.node("property").and_then(|property| property.name()).as_deref() == Some("pathname");
        if !value.is("MemberExpression") || !pathname {
            return None;
        }
        let parsed = resolve_constant(self.scopes, value.node("object"))?;
        let url = parsed.node("callee").is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("URL"));
        (parsed.is("NewExpression") && url && !parsed.list("arguments").is_empty()).then_some(argument)
    }
}

fn guards_in(test: Option<Node>) -> Vec<(Node, Node)> {
    let Some(test) = test else { return Vec::new() };
    operands_of(test, "&&").into_iter().filter_map(|part| slash_guard_target(part).map(|target| (target, part))).collect()
}

fn statements_after(node: Node) -> Vec<Node> {
    let Some(holder) = node.parent().filter(|holder| holder.is("BlockStatement") || holder.is("Program")) else { return Vec::new() };
    let body = holder.nodes("body");
    let index = body.iter().position(|item| *item == node).map_or(0, |index| index + 1);
    body[index..].to_vec()
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let state = Check { scopes, text: context.file.text };
    let mut found = Vec::new();
    for node in view.nodes() {
        match node.kind() {
            "IfStatement" => {
                if let Some(consequent) = node.node("consequent") {
                    state.guarded(&guards_in(node.node("test")), consequent, &mut found);
                }
                let test = node.node("test").filter(|test| test.is("UnaryExpression") && test.text("operator").as_deref() == Some("!"));
                if let Some(test) = test {
                    let inner = guards_in(test.node("argument"));
                    for statement in statements_after(node) {
                        state.guarded(&inner, statement, &mut found);
                    }
                }
            }
            "ConditionalExpression" => {
                if let Some(consequent) = node.node("consequent") {
                    state.guarded(&guards_in(node.node("test")), consequent, &mut found);
                }
            }
            "LogicalExpression" if node.text("operator").as_deref() == Some("&&") => {
                if let Some(right) = node.node("right") {
                    state.guarded(&guards_in(node.node("left")), right, &mut found);
                }
            }
            "CallExpression" => {
                let scope = state.scope_text(node);
                let reported = SAME_ORIGIN_CHECK.is_match(scope) && !DOUBLE_SLASH_CHECK.is_match(scope);
                found.extend(state.pathname_sink(node).filter(|_| reported).map(|argument| (argument, PATHNAME)));
            }
            _ => {}
        }
    }
    for (node, message) in found {
        context.report_range(RULE, node.start(), Some(node.end()), message.to_string());
    }
}
