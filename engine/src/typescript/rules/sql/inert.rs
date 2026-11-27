//! `sql-inert.mts`: the pieces of SQL text, each a known text or a runtime value, and whether a value can only be
//! inert text: numbers, escapes, guarded names, placeholder lists built from placeholders.
use super::arrays::{Kind, Obligation, Obligations, array_obligations, array_of, is_index_parameter, text_of};
use super::text::DYNAMIC;
use crate::typescript::rules::security_values::leaves::leaf_values;
use crate::typescript::rules::security_values::{member_name, resolved_value, unwrapped, variable_of};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::urls::values::string_value;
use crate::typescript::rules::writes::syntax::js_number;
use oxc_semantic::SymbolId;
use std::collections::HashSet;

/// A piece of the text: its known text, or the runtime value it comes from. A piece can have neither, where an
/// array has a hole.
#[derive(Clone)]
pub struct Piece<'s> {
    pub text: Option<String>,
    pub node: Option<Node<'s>>,
}

const MAX_OBLIGATIONS: usize = 256;
const MAX_CHAIN: usize = 64;
const NUMERIC_FUNCTIONS: [&str; 5] = ["Number", "parseInt", "parseFloat", "BigInt", "Boolean"];
const ESCAPE_FUNCTIONS: [&str; 4] = ["escape", "escapeId", "escapeLiteral", "escapeIdentifier"];
const NUMERIC_METHODS: [&str; 3] = ["getTime", "now", "toFixed"];
const NUMERIC_PROPERTIES: [&str; 3] = ["length", "size", "byteLength"];
const INERT_UNARY: [&str; 4] = ["+", "-", "!", "typeof"];
const TEXT_BUILDERS: [&str; 7] = ["repeat", "slice", "substring", "padStart", "padEnd", "trimEnd", "trimStart"];
const MEMBERSHIP: [&str; 2] = ["has", "includes"];
const EXITS: [&str; 4] = ["ThrowStatement", "ReturnStatement", "ContinueStatement", "BreakStatement"];

fn has_name(name: &Option<String>, names: &[&str]) -> bool {
    name.as_deref().is_some_and(|name| names.contains(&name))
}

/// `literalText`: the text of a string, number, boolean or bigint literal.
pub fn literal_text(leaf: Node) -> Option<String> {
    if let Some(text) = string_value(Some(leaf)) {
        return Some(text);
    }
    if !leaf.is("Literal") {
        return None;
    }
    if leaf.get("bigint") != Value::Null {
        return leaf.text("bigint").map(|text| text.into_owned());
    }
    match leaf.get("value") {
        Value::Number(number) => Some(js_number(number)),
        Value::Bool(flag) => Some(flag.to_string()),
        _ => None,
    }
}

fn first_argument(call: Node) -> Option<Node> {
    call.list("arguments").first().copied().flatten()
}

fn is_set_call(value: Node) -> bool {
    value.is("NewExpression") && value.node("callee").is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("Set"))
}

fn resolved_list<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Node<'s>> {
    resolved_value(scopes, node).or(node).map(unwrapped)
}

fn is_constant_collection<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> bool {
    let mut list = resolved_list(scopes, node);
    for _ in 0..MAX_CHAIN {
        match list.filter(|value| is_set_call(*value)).and_then(|value| resolved_list(scopes, first_argument(value))) {
            Some(next) => list = Some(next),
            None => break,
        }
    }
    let Some(list) = list.filter(|list| list.is("ArrayExpression")) else { return false };
    let elements = list.list("elements");
    !elements.is_empty() && elements.iter().all(|element| element.is_some_and(|element| literal_text(element).is_some()))
}

fn checks<'s>(scopes: &Scopes<'_, 's>, test: Node<'s>, variable: SymbolId) -> bool {
    let call = unwrapped(test);
    if !call.is("CallExpression") {
        return false;
    }
    let argument = first_argument(call).map(unwrapped);
    let Some(callee) = call.node("callee").filter(|callee| callee.is("MemberExpression")) else { return false };
    has_name(&member_name(callee), &MEMBERSHIP)
        && argument.is_some_and(|argument| argument.is("Identifier") && variable_of(scopes, argument) == Some(variable))
        && is_constant_collection(scopes, callee.node("object"))
}

fn block_tail(statement: Node) -> Node {
    let mut current = statement;
    while current.is("BlockStatement") {
        match current.nodes("body").last() {
            Some(last) => current = *last,
            None => break,
        }
    }
    current
}

fn is_stop_guard<'s>(scopes: &Scopes<'_, 's>, statement: Node<'s>, variable: SymbolId) -> bool {
    if !statement.is("IfStatement") {
        return false;
    }
    let Some(test) = statement.node("test").map(unwrapped).filter(|test| test.is("UnaryExpression") && test.text("operator").as_deref() == Some("!")) else { return false };
    let exits = statement.node("consequent").is_some_and(|consequent| EXITS.contains(&block_tail(consequent).kind()));
    exits && test.node("argument").is_some_and(|argument| checks(scopes, argument, variable))
}

fn guards<'s>(scopes: &Scopes<'_, 's>, parent: Node<'s>, child: Node<'s>, variable: SymbolId) -> bool {
    if parent.is("IfStatement") && parent.node("consequent") == Some(child) {
        return parent.node("test").is_some_and(|test| checks(scopes, test, variable));
    }
    if !matches!(parent.get("body"), Value::List(..)) {
        return false;
    }
    let body = parent.list("body");
    let end = body.iter().position(|statement| *statement == Some(child)).unwrap_or(body.len().saturating_sub(1));
    body[..end].iter().flatten().any(|statement| is_stop_guard(scopes, *statement, variable))
}

fn is_guarded<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> bool {
    let Some(variable) = variable_of(scopes, identifier) else { return false };
    let chain: Vec<Node> = std::iter::once(identifier).chain(identifier.ancestors()).collect();
    chain.windows(2).any(|pair| guards(scopes, pair[1], pair[0], variable))
}

fn is_inert_call(call: Node) -> bool {
    let Some(callee) = call.node("callee") else { return false };
    if callee.is("Identifier") {
        return callee.name().is_some_and(|name| NUMERIC_FUNCTIONS.contains(&name.as_ref()));
    }
    let name = if callee.is("MemberExpression") { member_name(callee) } else { None };
    let on_math = callee.is("MemberExpression") && callee.node("object").is_some_and(|object| object.is("Identifier") && object.name().as_deref() == Some("Math"));
    on_math || has_name(&name, &ESCAPE_FUNCTIONS) || has_name(&name, &NUMERIC_METHODS)
}

fn call_obligations(call: Node) -> Obligations {
    if is_inert_call(call) {
        return Some(Vec::new());
    }
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    let name = member_name(callee);
    if name.as_deref() == Some("join") {
        let mut found = vec![array_of(callee.node("object"))];
        found.extend(call.nodes("arguments").into_iter().map(|argument| text_of(Some(argument))));
        return Some(found);
    }
    has_name(&name, &TEXT_BUILDERS).then(|| vec![text_of(callee.node("object"))])
}

fn shape_obligations<'s>(scopes: &Scopes<'_, 's>, leaf: Node<'s>) -> Obligations<'s> {
    let target = unwrapped(leaf);
    match target.kind() {
        "UnaryExpression" => target.text("operator").is_some_and(|operator| INERT_UNARY.contains(&operator.as_ref())).then(Vec::new),
        "BinaryExpression" if target.text("operator").as_deref() == Some("+") => Some(vec![text_of(target.node("left")), text_of(target.node("right"))]),
        "BinaryExpression" => Some(Vec::new()),
        "MemberExpression" => has_name(&member_name(target), &NUMERIC_PROPERTIES).then(Vec::new),
        "TemplateLiteral" => Some(target.nodes("expressions").into_iter().map(|expression| text_of(Some(expression))).collect()),
        "Identifier" => (is_index_parameter(scopes, target) || is_guarded(scopes, target)).then(Vec::new),
        "CallExpression" => call_obligations(target),
        _ => None,
    }
}

fn text_obligations<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Obligations<'s> {
    let mut found = Vec::new();
    for leaf in leaf_values(scopes, Some(node)) {
        if literal_text(leaf).is_none() {
            found.extend(shape_obligations(scopes, leaf)?);
        }
    }
    Some(found)
}

fn is_inert<'s>(scopes: &Scopes<'_, 's>, root: Obligation<'s>) -> bool {
    let mut pending = vec![root];
    let mut seen: [HashSet<Option<u32>>; 2] = [HashSet::new(), HashSet::new()];
    let slot = |kind: Kind| usize::from(kind == Kind::Array);
    let mut at = 0;
    while at < pending.len() {
        let Obligation { kind, node } = pending[at];
        at += 1;
        let Some(node) = node.filter(|_| pending.len() <= MAX_OBLIGATIONS) else { return false };
        let next = match kind {
            Kind::Text => text_obligations(scopes, node),
            Kind::Array => array_obligations(scopes, Some(node)),
        };
        let Some(next) = next else { return false };
        seen[slot(kind)].insert(Some(node.index));
        let fresh: Vec<Obligation> = next.into_iter().filter(|item| !seen[slot(item.kind)].contains(&item.node.map(|node| node.index))).collect();
        pending.extend(fresh);
    }
    true
}

/// `classify`: the known text of a value, inert text, or the value as a runtime piece.
pub fn classify<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Piece<'s> {
    let texts: Vec<Option<String>> = leaf_values(scopes, node).into_iter().map(literal_text).collect();
    if !texts.is_empty() && texts.iter().all(Option::is_some) {
        return Piece { text: texts.into_iter().next().flatten(), node: None };
    }
    if is_inert(scopes, text_of(node)) { Piece { text: Some(DYNAMIC.to_string()), node: None } } else { Piece { text: None, node } }
}
