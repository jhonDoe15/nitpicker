//! `sql-arrays.mts`: what an array must hold for its `join` to be inert text, as obligations on its elements, the
//! callbacks that map it and the writes to a local array.
use crate::typescript::rules::security_values::leaves::{assigned_writes, is_eslint_write};
use crate::typescript::rules::security_values::{defs, is_function_node, member_name, resolved_value, unwrapped, variable_of};
use crate::typescript::rules::support::scope::{DefKind, Reference, Scopes};
use crate::typescript::rules::support::view::Node;

#[derive(Clone, Copy, PartialEq)]
pub enum Kind {
    Text,
    Array,
}

#[derive(Clone, Copy)]
pub struct Obligation<'s> {
    pub kind: Kind,
    pub node: Option<Node<'s>>,
}

pub type Obligations<'s> = Option<Vec<Obligation<'s>>>;

const MAPPERS: [&str; 2] = ["map", "flatMap"];
const PRESERVING: [&str; 7] = ["filter", "slice", "reverse", "sort", "toSorted", "toReversed", "flat"];
const ADDERS: [(&str, usize); 3] = [("push", 0), ("unshift", 0), ("splice", 2)];
const INDEX_CALLBACKS: [&str; 7] = ["map", "flatMap", "forEach", "filter", "some", "every", "find"];
const NUMERIC_MAPPERS: [&str; 4] = ["Number", "parseInt", "parseFloat", "BigInt"];

pub fn text_of(node: Option<Node>) -> Obligation {
    Obligation { kind: Kind::Text, node }
}

pub fn array_of(node: Option<Node>) -> Obligation {
    Obligation { kind: Kind::Array, node }
}

fn is_named(node: Option<Node>, names: &[&str]) -> bool {
    node.is_some_and(|node| node.is("Identifier") && node.name().is_some_and(|name| names.contains(&name.as_ref())))
}

fn has_name(name: &Option<String>, names: &[&str]) -> bool {
    name.as_deref().is_some_and(|name| names.contains(&name))
}

fn is_array_from(call: Node) -> bool {
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"));
    callee.is_some_and(|callee| is_named(callee.node("object"), &["Array"]) && member_name(callee).as_deref() == Some("from"))
}

/// `isIndexParameter`: the second parameter of an array callback, the index.
pub fn is_index_parameter<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> bool {
    let Some(definition) = defs(scopes, identifier).into_iter().next().filter(|definition| definition.kind == DefKind::Parameter) else { return false };
    let function = definition.node;
    let Some(call) = function.parent().filter(|call| call.is("CallExpression")) else { return false };
    let Some(callee) = call.node("callee").filter(|callee| callee.is("MemberExpression")) else { return false };
    let arguments = call.list("arguments");
    let is_callback = if is_array_from(call) {
        arguments.get(1).copied().flatten() == Some(function)
    } else {
        has_name(&member_name(callee), &INDEX_CALLBACKS) && arguments.first().copied().flatten() == Some(function)
    };
    is_callback && function.list("params").get(1).copied().flatten() == Some(definition.name)
}

fn returns_of(body: Node) -> Vec<Node> {
    let mut found = Vec::new();
    let mut pending = vec![body];
    while let Some(node) = pending.pop() {
        if node.is("ReturnStatement") {
            found.push(node);
        }
        pending.extend(node.children().into_iter().filter(|child| !is_function_node(*child)).rev());
    }
    found
}

fn callback_obligations(callback: Option<Node>) -> Obligations {
    let Some(callback) = callback.filter(|callback| is_function_node(*callback)) else {
        return is_named(callback, &NUMERIC_MAPPERS).then(Vec::new);
    };
    let body = callback.node("body")?;
    if !body.is("BlockStatement") {
        return Some(vec![text_of(Some(body))]);
    }
    let returns = returns_of(body);
    let valued = !returns.is_empty() && returns.iter().all(|node| node.node("argument").is_some());
    valued.then(|| returns.iter().map(|node| text_of(node.node("argument"))).collect())
}

fn element_obligations<'s>(elements: &[Option<Node<'s>>]) -> Obligations<'s> {
    let present: Vec<Node> = elements.iter().flatten().copied().collect();
    if present.len() < elements.len() {
        return None;
    }
    Some(present.into_iter().map(|element| if element.is("SpreadElement") { array_of(element.node("argument")) } else { text_of(Some(element)) }).collect())
}

fn reference_obligations<'s>(reference: &Reference<'s>, init: bool) -> Obligations<'s> {
    let identifier = reference.identifier;
    if reference.write && is_eslint_write(identifier) {
        if init {
            return Some(Vec::new());
        }
        let writes = assigned_writes(identifier);
        return Some(if writes.is_empty() { vec![array_of(None)] } else { writes.into_iter().map(|write| array_of(Some(write))).collect() });
    }
    let member = identifier.parent().filter(|member| member.is("MemberExpression") && member.node("object") == Some(identifier))?;
    let owner = member.parent()?;
    let name = member_name(member);
    let adder = ADDERS.iter().find(|(adder, _)| name.as_deref() == Some(*adder)).map(|(_, from)| *from);
    if let Some(from) = adder.filter(|_| owner.is("CallExpression") && owner.node("callee") == Some(member)) {
        let arguments = owner.list("arguments");
        return element_obligations(arguments.get(from..).unwrap_or_default());
    }
    if owner.is("AssignmentExpression") && owner.node("left") == Some(member) {
        return member.flag("computed").then(|| vec![text_of(owner.node("right"))]);
    }
    (name.as_deref() != Some("fill")).then(Vec::new)
}

fn local_array_obligations<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> Obligations<'s> {
    let variable = variable_of(scopes, identifier)?;
    let definitions = defs(scopes, identifier);
    let [definition] = definitions.as_slice() else { return None };
    let declarator = Some(definition.node).filter(|_| definition.kind == DefKind::Variable)?;
    let init = declarator.node("init").filter(|_| declarator.node("id").is_some_and(|id| id.is("Identifier")))?;
    let names: Vec<Node> = definitions.iter().map(|definition| definition.name).collect();
    let mut found = vec![array_of(Some(init))];
    for reference in scopes.references(variable) {
        found.extend(reference_obligations(&reference, names.contains(&reference.identifier))?);
    }
    Some(found)
}

fn method_obligations(call: Node) -> Obligations {
    let callee = call.node("callee")?;
    let name = member_name(callee);
    let arguments = call.list("arguments");
    let first = arguments.first().copied().flatten();
    let second = arguments.get(1).copied().flatten();
    if is_array_from(call) {
        return if arguments.len() < 2 { Some(vec![array_of(first)]) } else { callback_obligations(second) };
    }
    if has_name(&name, &MAPPERS) {
        return callback_obligations(first);
    }
    if name.as_deref() == Some("fill") {
        return first.map(|first| vec![text_of(Some(first))]);
    }
    has_name(&name, &PRESERVING).then(|| vec![array_of(callee.node("object"))])
}

/// `arrayObligations`: what the elements of an array must be for its text to be inert.
pub fn array_obligations<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Obligations<'s> {
    let start = unwrapped(node?);
    if start.is("Identifier") {
        return local_array_obligations(scopes, start);
    }
    let target = resolved_value(scopes, Some(start))?;
    if target.is("ArrayExpression") {
        return element_obligations(&target.list("elements"));
    }
    let method = target.is("CallExpression") && target.node("callee").is_some_and(|callee| callee.is("MemberExpression"));
    if method { method_obligations(target) } else { None }
}
