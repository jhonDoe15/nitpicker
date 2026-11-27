//! `no-double-decode`: `decodeURIComponent` or `decodeURI` applied to a query or route value the framework has
//! already decoded.
use super::relative::NULLISH_WRAPPERS;
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::defs;
use crate::typescript::rules::signatures::unwrap;
use crate::typescript::rules::support::scope::{Def, DefKind, Scopes};
use crate::typescript::rules::support::view::Node;

const RULE: &str = "no-double-decode";
const MESSAGE: &str = "This value is already percent-decoded by the framework. Decoding it again changes text with a literal `%41` and throws a URIError on a bare `%`. Use the value as it is; decode only raw text such as `location.search` or `request.url`.";
const DECODERS: [&str; 2] = ["decodeURIComponent", "decodeURI"];
const QUERY: &str = "query";
const CONTAINER_MEMBERS: [&str; 2] = [QUERY, "searchParams"];
const CONTAINER_NAMES: [&str; 3] = ["searchParams", QUERY, "queryParams"];
const READ_METHODS: [&str; 2] = ["get", "getAll"];
const REQUEST_READS: [&str; 2] = [QUERY, "param"];
const REQUEST_NAMES: [&str; 2] = ["req", "request"];
const STRING_METHODS: [&str; 2] = ["trim", "toString"];
const MAX_DEPTH: usize = 6;

enum Step<'s> {
    Done(bool),
    Next(Node<'s>),
}

fn name(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn callee_name(node: Node) -> Option<String> {
    node.node("callee").filter(|callee| callee.is("Identifier")).and_then(|callee| name(Some(callee)))
}

fn method_of(node: Node) -> Option<(Node, String)> {
    let callee = node.node("callee").filter(|callee| callee.is("MemberExpression") && !callee.flag("computed"))?;
    Some((callee.node("object")?, name(callee.node("property")).unwrap_or_default()))
}

fn is_request(node: Node) -> bool {
    let value = unwrap(node, NULLISH_WRAPPERS);
    if value.is("Identifier") {
        return name(Some(value)).is_some_and(|name| REQUEST_NAMES.contains(&name.as_str()));
    }
    value.is("MemberExpression") && !value.flag("computed") && name(value.node("property")).as_deref() == Some("req")
}

fn definition_of<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<Def<'s>> {
    defs(scopes, node).into_iter().next()
}

fn is_container_member(node: Node) -> bool {
    let property = if node.flag("computed") { String::new() } else { name(node.node("property")).unwrap_or_default() };
    let object = node.node("object");
    CONTAINER_MEMBERS.contains(&property.as_str())
        || (property == "params" && object.is_some_and(|object| object.is("Identifier") && is_request(object)))
}

fn is_container_call(node: Node) -> bool {
    let method = method_of(node);
    callee_name(node).as_deref() == Some("useSearchParams")
        || method.is_some_and(|(owner, method)| node.nodes("arguments").is_empty() && method == QUERY && is_request(owner))
}

fn variable_binding<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Option<(Node<'s>, Node<'s>)> {
    let definition = definition_of(scopes, node).filter(|definition| definition.kind == DefKind::Variable)?;
    Some((definition.node.node("id")?, definition.node.node("init")?))
}

fn container_binding_step<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Step<'s> {
    if definition_of(scopes, node).is_some_and(|definition| definition.kind == DefKind::Parameter) {
        return Step::Done(name(Some(node)).is_some_and(|name| CONTAINER_NAMES.contains(&name.as_str())));
    }
    let Some((id, init)) = variable_binding(scopes, node) else { return Step::Done(false) };
    if id.is("ArrayPattern") {
        let first = id.list("elements").first().copied().flatten();
        let own = first.is_some_and(|first| first.is("Identifier") && name(Some(first)) == name(Some(node)));
        return if own { Step::Next(init) } else { Step::Done(false) };
    }
    if id.is("Identifier") { Step::Next(init) } else { Step::Done(false) }
}

fn container_step<'s>(scopes: &Scopes<'_, 's>, value: Node<'s>) -> Step<'s> {
    match value.kind() {
        "NewExpression" => Step::Done(
            value.node("callee").is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("URLSearchParams")),
        ),
        "CallExpression" => Step::Done(is_container_call(value)),
        "MemberExpression" => Step::Done(is_container_member(value)),
        "Identifier" => container_binding_step(scopes, value),
        _ => Step::Done(false),
    }
}

fn is_container(scopes: &Scopes, node: Node, depth: usize) -> bool {
    let mut current = node;
    let mut offset = 0;
    while depth + offset <= MAX_DEPTH {
        match container_step(scopes, unwrap(current, NULLISH_WRAPPERS)) {
            Step::Done(answer) => return answer,
            Step::Next(next) => current = next,
        }
        offset += 1;
    }
    false
}

fn call_step<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, depth: usize) -> Step<'s> {
    if callee_name(node).as_deref() == Some("String") {
        return node.nodes("arguments").first().copied().map_or(Step::Done(false), Step::Next);
    }
    let Some((owner, method)) = method_of(node) else { return Step::Done(false) };
    if READ_METHODS.contains(&method.as_str()) {
        return Step::Done(is_container(scopes, owner, depth + 1));
    }
    if REQUEST_READS.contains(&method.as_str()) && !node.nodes("arguments").is_empty() {
        return Step::Done(is_request(owner));
    }
    if STRING_METHODS.contains(&method.as_str()) { Step::Next(owner) } else { Step::Done(false) }
}

fn binding_step<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, depth: usize) -> Step<'s> {
    let Some((id, init)) = variable_binding(scopes, node) else { return Step::Done(false) };
    if id.is("ObjectPattern") {
        return Step::Done(is_container(scopes, init, depth + 1));
    }
    if id.is("Identifier") { Step::Next(init) } else { Step::Done(false) }
}

fn member_step<'s>(scopes: &Scopes<'_, 's>, value: Node<'s>, depth: usize) -> Step<'s> {
    let Some(object) = value.node("object") else { return Step::Done(false) };
    if is_container(scopes, object, depth + 1) {
        return Step::Done(true);
    }
    if value.flag("computed") { Step::Next(object) } else { Step::Done(false) }
}

fn decoded_step<'s>(scopes: &Scopes<'_, 's>, value: Node<'s>, depth: usize) -> Step<'s> {
    match value.kind() {
        "MemberExpression" => member_step(scopes, value, depth),
        "CallExpression" => call_step(scopes, value, depth),
        "Identifier" => binding_step(scopes, value, depth),
        "LogicalExpression" => value.node("left").map_or(Step::Done(false), Step::Next),
        _ => Step::Done(false),
    }
}

fn is_decoded(scopes: &Scopes, node: Node) -> bool {
    let mut current = node;
    for depth in 0..=MAX_DEPTH {
        match decoded_step(scopes, unwrap(current, NULLISH_WRAPPERS), depth) {
            Step::Done(answer) => return answer,
            Step::Next(next) => current = next,
        }
    }
    false
}

fn is_double_decode(scopes: &Scopes, node: Node) -> bool {
    let arguments = node.list("arguments");
    let decoder = node.node("callee").is_some_and(|callee| callee.is("Identifier") && name(Some(callee)).is_some_and(|name| DECODERS.contains(&name.as_str())));
    let argument = arguments.first().copied().flatten();
    arguments.len() == 1 && decoder && argument.is_some_and(|argument| is_decoded(scopes, argument))
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let found: Vec<Node> = view.nodes().filter(|node| node.is("CallExpression") && is_double_decode(scopes, *node)).collect();
    for node in found {
        context.report_range(RULE, node.start(), Some(node.end()), MESSAGE.to_string());
    }
}
