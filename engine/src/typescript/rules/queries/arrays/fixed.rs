//! `concurrency/collections/fixed-collections.mts`: collections whose size the code fixes, such as literals,
//! enums, windows of a constant size and the chunks of a chunking helper.
use crate::typescript::rules::security_values::{defs, member_name, resolve_constant, unwrapped};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};

const CHUNKERS: [&str; 8] = ["chunk", "chunked", "chunks", "splitEvery", "cluster", "batch", "batches", "inGroupsOf"];
const KEEPS_SIZE: [&str; 9] = ["filter", "map", "sort", "toSorted", "reverse", "toReversed", "flat", "fill", "keys"];
const OBJECT_VIEWS: [&str; 3] = ["keys", "values", "entries"];
const SIZES: [&str; 2] = ["length", "size"];
const ARRAY: &str = "Array";
const MAX_DEPTH: usize = 6;

enum Step<'s> {
    Done(bool),
    Next(Vec<Option<Node<'s>>>),
}

/// `skipped`: the expression under type wrappers and `await`.
pub fn skipped(node: Option<Node>) -> Option<Node> {
    let mut current = unwrapped(node?);
    while current.is("AwaitExpression") {
        match current.node("argument") {
            Some(argument) => current = unwrapped(argument),
            None => break,
        }
    }
    Some(current)
}

fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn numeric_parts(target: Node) -> Option<Vec<Option<Node>>> {
    match target.kind() {
        "Literal" => matches!(target.get("value"), Value::Number(..)).then(Vec::new),
        "UnaryExpression" => Some(vec![target.node("argument")]),
        "BinaryExpression" => Some(vec![target.node("left"), target.node("right")]),
        _ => None,
    }
}

fn numeric<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> bool {
    let mut pending = vec![(node, 0)];
    let mut at = 0;
    while at < pending.len() {
        let (node, depth) = pending[at];
        at += 1;
        let target = resolve_constant(scopes, skipped(node));
        let Some(parts) = target.filter(|_| depth <= MAX_DEPTH).and_then(numeric_parts) else { return false };
        pending.extend(parts.into_iter().map(|part| (part, depth + 1)));
    }
    true
}

fn explicit_size(node: Node) -> bool {
    !node.descendants().into_iter().any(|child| child.is("MemberExpression") && member_name(child).is_some_and(|name| SIZES.contains(&name.as_str())))
}

fn resolved_value<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> Option<Node<'s>> {
    let mut seen = vec![skipped(node)?];
    loop {
        let current = *seen.last().expect("a value");
        let next = skipped(resolve_constant(scopes, Some(current)));
        match next {
            Some(next) if next != current && seen.len() < MAX_DEPTH => seen.push(next),
            _ => return next,
        }
    }
}

fn first_definition<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> Option<crate::typescript::rules::support::scope::Def<'s>> {
    defs(scopes, identifier).into_iter().next()
}

fn is_enum<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> bool {
    first_definition(scopes, identifier).is_some_and(|definition| definition.kind == DefKind::Other && definition.node.is("TSEnumDeclaration"))
}

fn is_size_text<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> bool {
    resolved_value(scopes, node).is_some_and(explicit_size)
}

fn sized_window<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> bool {
    let arguments = call.nodes("arguments");
    let slice = call.node("callee").is_some_and(|callee| callee.is("MemberExpression") && member_name(callee).as_deref() == Some("slice"));
    if slice && arguments.get(1).is_none() {
        return arguments.first().is_some_and(|first| numeric(scopes, Some(*first)));
    }
    arguments.get(1).is_some_and(|second| explicit_size(*second))
}

fn sized_by_length<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> bool {
    let object = skipped(node).filter(|object| object.is("ObjectExpression"));
    let length = object.and_then(|object| {
        object.nodes("properties").into_iter().find(|property| property.is("Property") && name_of(property.node("key")).as_deref() == Some("length"))
    });
    length.is_some_and(|length| is_size_text(scopes, length.node("value")))
}

fn callee_name(call: Node) -> Option<String> {
    let callee = call.node("callee")?;
    if callee.is("MemberExpression") { member_name(callee) } else { name_of(Some(callee)) }
}

fn is_chunk_call<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> bool {
    let Some(target) = resolve_constant(scopes, skipped(node)).filter(|target| target.is("CallExpression")) else { return false };
    let callee = target.node("callee");
    let name = match callee {
        Some(callee) if callee.is("Identifier") => name_of(Some(callee)),
        Some(callee) if callee.is("MemberExpression") => member_name(callee),
        _ => None,
    };
    let size = target.nodes("arguments").get(1).copied();
    name.is_some_and(|name| CHUNKERS.contains(&name.as_str())) && size.is_some_and(explicit_size)
}

fn is_chunk_variable<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> bool {
    let definition = first_definition(scopes, identifier).filter(|definition| definition.kind == DefKind::Variable);
    let statement = definition.and_then(|definition| definition.node.parent()).and_then(|declaration| declaration.parent());
    statement.is_some_and(|statement| statement.is("ForOfStatement") && is_chunk_call(scopes, statement.node("right")))
}

fn fixed_call<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> Step<'s> {
    let name = callee_name(call);
    let name = name.as_deref().unwrap_or_default();
    let member = call.node("callee").filter(|callee| callee.is("MemberExpression"));
    let owner = member.and_then(|callee| skipped(callee.node("object")));
    let arguments = call.nodes("arguments");
    let first = arguments.first().copied();
    let owner_name = name_of(owner);
    if name == "slice" || name == "splice" {
        return Step::Done(sized_window(scopes, call));
    }
    if owner_name.as_deref() == Some("Object") && OBJECT_VIEWS.contains(&name) {
        return Step::Next(vec![first]);
    }
    if owner_name.as_deref() == Some(ARRAY) && name == "from" {
        return Step::Done(sized_by_length(scopes, first));
    }
    if name == ARRAY && arguments.len() == 1 {
        return Step::Done(is_size_text(scopes, first));
    }
    match owner {
        Some(owner) if KEEPS_SIZE.contains(&name) => Step::Next(vec![Some(owner)]),
        _ => Step::Done(false),
    }
}

fn array_step(target: Node) -> Step {
    let elements = target.list("elements");
    if elements.is_empty() || elements.iter().any(Option::is_none) {
        return Step::Done(false);
    }
    let spreads: Vec<Option<Node>> = elements.iter().flatten().filter(|element| element.is("SpreadElement")).map(|element| element.node("argument")).collect();
    if spreads.is_empty() { Step::Done(true) } else { Step::Next(spreads) }
}

fn fixed_step<'s>(scopes: &Scopes<'_, 's>, target: Node<'s>) -> Step<'s> {
    match target.kind() {
        "ArrayExpression" => array_step(target),
        "ObjectExpression" => {
            let properties = target.nodes("properties");
            Step::Done(!properties.is_empty() && properties.iter().all(|property| property.is("Property")))
        }
        "CallExpression" => fixed_call(scopes, target),
        "NewExpression" => {
            let arguments = target.nodes("arguments");
            Step::Done(name_of(target.node("callee")).as_deref() == Some(ARRAY) && arguments.len() == 1 && is_size_text(scopes, arguments.first().copied()))
        }
        "Identifier" => Step::Done(is_enum(scopes, target) || is_chunk_variable(scopes, target)),
        _ => Step::Done(false),
    }
}

/// `isFixedCollection`: every value the collection can come from has a size the code fixes.
pub fn is_fixed_collection<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    let mut pending = vec![(Some(node), 0)];
    let mut at = 0;
    while at < pending.len() {
        let (node, depth) = pending[at];
        at += 1;
        let step = match resolved_value(scopes, node) {
            Some(target) if depth <= MAX_DEPTH => fixed_step(scopes, target),
            _ => Step::Done(false),
        };
        match step {
            Step::Done(false) => return false,
            Step::Done(true) => {}
            Step::Next(next) => pending.extend(next.into_iter().map(|node| (node, depth + 1))),
        }
    }
    true
}
