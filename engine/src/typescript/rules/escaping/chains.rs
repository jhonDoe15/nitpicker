//! `replace-chains.mts` of the escaping rules: what each `replace` call of a chain matches and inserts.
use super::js_regex::JsRegex;
use crate::typescript::rules::security_values::{member_name, resolve_constant, unwrapped};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::urls::values::string_units;

const REPLACERS: [&str; 2] = ["replace", "replaceAll"];
const BACKSLASH: u16 = b'\\' as u16;
const QUOTED: [u8; 5] = [b'"', b'\'', b'`', b'{', b'}'];

enum Matcher {
    Pattern(Option<JsRegex>),
    Text(Vec<u16>),
}

pub struct Replacement<'v> {
    pub call: Node<'v>,
    matcher: Matcher,
    source_length: usize,
    text: Option<Vec<u16>>,
}

impl Replacement<'_> {
    pub fn test(&self, text: &[u16]) -> bool {
        match &self.matcher {
            Matcher::Pattern(pattern) => pattern.as_ref().and_then(|pattern| pattern.test(text)).unwrap_or(false),
            Matcher::Text(value) => value.is_empty() || text.windows(value.len()).any(|window| window == value.as_slice()),
        }
    }

    fn test_ascii(&self, text: &[u8]) -> bool {
        self.test(&text.iter().map(|byte| u16::from(*byte)).collect::<Vec<u16>>())
    }
}

fn pattern_test(scopes: &Scopes, node: Node) -> Option<(Matcher, usize)> {
    let plain = resolve_constant(scopes, Some(node))?;
    if let (true, Value::Node(at)) = (plain.is("Literal"), plain.get("regex")) {
        let regex = plain.view.at(at);
        let source = regex.text("pattern")?.into_owned();
        let flags: String = regex.text("flags")?.chars().filter(|flag| !matches!(flag, 'g' | 'y')).collect();
        let length = source.encode_utf16().count();
        return Some((Matcher::Pattern(JsRegex::new(&source, &flags)), length));
    }
    let value = string_units(Some(plain))?;
    let length = value.len();
    Some((Matcher::Text(value), length))
}

/// `replacementOf`: a `replace` or `replaceAll` call whose pattern is known.
pub fn replacement_of<'v>(scopes: &Scopes<'_, 'v>, call: Node<'v>) -> Option<Replacement<'v>> {
    let callee = unwrapped(call.node("callee")?);
    let arguments = call.nodes("arguments");
    let named = callee.is("MemberExpression") && member_name(callee).is_some_and(|name| REPLACERS.contains(&name.as_str()));
    let (Some(pattern), Some(replacement), true) = (arguments.first().copied(), arguments.get(1).copied(), named) else { return None };
    let (matcher, source_length) = pattern_test(scopes, pattern)?;
    let text = string_units(resolve_constant(scopes, Some(replacement)));
    Some(Replacement { call, matcher, source_length, text })
}

/// `chainOf`: the `replace` calls of a chain, the innermost first.
pub fn chain_of<'v>(scopes: &Scopes<'_, 'v>, outermost: Node<'v>) -> Vec<Replacement<'v>> {
    let mut chain = Vec::new();
    let mut current = outermost;
    while current.is("CallExpression") {
        let Some(replacement) = replacement_of(scopes, current) else { break };
        let Some(callee) = current.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression")) else { break };
        chain.push(replacement);
        let Some(object) = callee.node("object") else { break };
        current = unwrapped(object);
    }
    chain.reverse();
    chain
}

/// `chainRoot`: what the innermost call is made on.
pub fn chain_root<'v>(chain: &[Replacement<'v>]) -> Option<Node<'v>> {
    let callee = unwrapped(chain.first()?.call.node("callee")?);
    if callee.is("MemberExpression") { callee.node("object").map(unwrapped) } else { None }
}

/// `isOutermost`: no `replace` call is made on this call's result.
pub fn is_outermost(scopes: &Scopes, call: Node) -> bool {
    let Some(member) = call.parent() else { return true };
    let outer = member.parent();
    !(member.is("MemberExpression")
        && member.node("object") == Some(call)
        && outer.is_some_and(|outer| outer.is("CallExpression") && outer.node("callee") == Some(member) && replacement_of(scopes, outer).is_some()))
}

pub fn handles_backslash(step: &Replacement) -> bool {
    step.test(&[BACKSLASH])
}

pub fn inserts_backslash(step: &Replacement) -> bool {
    let Some(text) = &step.text else { return false };
    if text.len() < 2 || text[0] != BACKSLASH || handles_backslash(step) {
        return false;
    }
    let matched: Vec<u8> = QUOTED.into_iter().filter(|character| step.test_ascii(&[*character])).collect();
    if !matched.iter().any(|character| step.test_ascii(&[b'\\', *character])) {
        return false;
    }
    let rest = &text[1..];
    let group = rest.len() == 2 && rest[0] == u16::from(b'$') && (rest[1] == u16::from(b'&') || (u16::from(b'0')..=u16::from(b'9')).contains(&rest[1]));
    group || (rest.len() == 1 && rest[0] != BACKSLASH && step.test(rest))
}

pub fn is_escape_pair(step: &Replacement) -> bool {
    step.text.as_deref() == Some(&[BACKSLASH]) && step.test_ascii(b"\\\\") && !handles_backslash(step) && !step.test_ascii(b"\\n")
}

pub fn is_escape_sequence(step: &Replacement) -> bool {
    let plain = step.text.as_ref().is_some_and(|text| !text.contains(&BACKSLASH));
    plain && step.source_length >= 2 && !step.test_ascii(b"\\\\") && [b'"', b'\'', b'n', b't'].iter().any(|letter| step.test_ascii(&[b'\\', *letter]))
}
