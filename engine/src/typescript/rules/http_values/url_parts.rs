//! `url-parts.mts` of the ESLint plugin: a `URL`'s protocol, host or origin compared with text that has capitals.
use super::origins::{name_of, url_like};
use crate::typescript::rules::security_values::unwrapped;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::string_value;

const URL_PARTS: [&str; 4] = ["protocol", "hostname", "host", "origin"];
const EQUALITY: [&str; 4] = ["===", "!==", "==", "!="];

fn url_part(node: Option<Node>) -> Option<String> {
    let member = unwrapped(node?);
    if !member.is("MemberExpression") || member.flag("computed") {
        return None;
    }
    let part = name_of(Some(member)).filter(|part| URL_PARTS.contains(&part.as_str()))?;
    url_like(unwrapped(member.node("object")?)).then_some(part)
}

/// Whether a node's text has a capital letter.
pub fn capitals(node: Option<Node>) -> bool {
    string_value(node.map(unwrapped)).is_some_and(|text| text.bytes().any(|byte| byte.is_ascii_uppercase()))
}

fn operands_of(node: Node) -> Option<(Option<Node>, Option<Node>)> {
    if node.is("BinaryExpression") && node.text("operator").is_some_and(|operator| EQUALITY.contains(&operator.as_ref())) {
        let (left, right) = (node.node("left"), node.node("right"));
        return Some(if capitals(right) { (left, right) } else { (right, left) });
    }
    if !node.is("CallExpression") {
        return None;
    }
    let callee = unwrapped(node.node("callee")?);
    let text_method = callee.is("MemberExpression") && matches!(name_of(Some(callee)).as_deref(), Some("startsWith" | "endsWith" | "includes"));
    text_method.then(|| (callee.node("object"), node.list("arguments").first().copied().flatten()))
}

/// `urlCase`: the part of the `URL` compared, when the text it is compared with has capitals.
pub fn url_case(node: Node) -> Option<String> {
    let (subject, other) = operands_of(node)?;
    let part = url_part(subject)?;
    capitals(other).then_some(part)
}
