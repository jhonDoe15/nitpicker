//! `isPagingCall`: a call of a `for`, `while` or `do ... while` loop that reads the next page, the next cursor or
//! the loop's own test, rather than one item each pass.
use super::names::{descendants, is_function, name_of, pass_roots};
use crate::typescript::rules::support::view::{Node, Value};
use std::collections::{HashMap, HashSet};

const ARITHMETIC_OPERATORS: [&str; 6] = ["+", "-", "*", "/", "%", "**"];

fn operator(node: Node) -> String {
    node.text("operator").map(|text| text.into_owned()).unwrap_or_default()
}

/// `isIdentifierAssignment`.
pub fn is_identifier_assignment(node: Node) -> bool {
    node.is("AssignmentExpression") && node.node("left").is_some_and(|left| left.is("Identifier"))
}

fn left_name(node: Node) -> Option<String> {
    name_of(node.node("left"))
}

fn is_named(node: Option<Node>, name: &Option<String>) -> bool {
    node.is_some_and(|node| node.is("Identifier") && name_of(Some(node)) == *name)
}

fn is_arithmetic_self_update(node: Node) -> bool {
    let op = operator(node);
    if op != "=" {
        return ARITHMETIC_OPERATORS.contains(&&op[..op.len().saturating_sub(1)]);
    }
    let Some(right) = node.node("right").filter(|right| right.is("BinaryExpression")) else { return false };
    let name = left_name(node);
    ARITHMETIC_OPERATORS.contains(&operator(right).as_str()) && [right.node("left"), right.node("right")].into_iter().any(|side| is_named(side, &name))
}

fn is_open_loop(lp: Node) -> bool {
    match lp.node("test") {
        None => true,
        Some(test) => test.is("Literal") && test.get("value") == Value::Bool(true),
    }
}

fn is_unit(node: Option<Node>) -> bool {
    let value = node.and_then(|node| if node.is("UnaryExpression") { node.node("argument") } else { Some(node) });
    value.is_some_and(|value| value.is("Literal") && value.get("value") == Value::Number(1.0))
}

fn is_counter_step(node: Node) -> bool {
    if operator(node) != "=" {
        return is_unit(node.node("right"));
    }
    let Some(right) = node.node("right").filter(|right| right.is("BinaryExpression")) else { return false };
    let step = if is_named(right.node("left"), &left_name(node)) { right.node("right") } else { right.node("left") };
    is_unit(step)
}

fn stepped_names(lp: Node) -> HashSet<String> {
    let nodes = pass_roots(lp).into_iter().flat_map(|root| descendants(root, is_function));
    nodes.filter(|node| is_identifier_assignment(*node) && is_arithmetic_self_update(*node) && !is_counter_step(*node)).filter_map(left_name).collect()
}

fn is_paging_loop(lp: Node) -> bool {
    let Some(test) = lp.node("test").filter(|_| !is_open_loop(lp)) else { return true };
    let tested: HashSet<String> = descendants(test, is_function).into_iter().filter(|node| node.is("Identifier")).filter_map(|node| name_of(Some(node))).collect();
    let Some(body) = lp.node("body") else { return false };
    descendants(body, is_function).into_iter().any(|node| {
        is_identifier_assignment(node) && left_name(node).is_some_and(|name| tested.contains(&name)) && !is_arithmetic_self_update(node)
    })
}

fn is_reference(node: Node) -> bool {
    if !node.is("Identifier") {
        return false;
    }
    let Some(parent) = node.parent() else { return true };
    let property = parent.is("MemberExpression") && parent.node("property") == Some(node) && !parent.flag("computed");
    let key = parent.is("Property") && parent.node("key") == Some(node) && !parent.flag("shorthand");
    !(property || key)
}

/// `namesIn`: the names a subtree reads, member properties and object keys left out.
fn names_in(node: Node) -> HashSet<String> {
    descendants(node, is_function).into_iter().filter(|each| is_reference(*each)).filter_map(|each| name_of(Some(each))).collect()
}

fn binding_of(node: Node) -> Option<(Option<Node>, Option<Node>, bool)> {
    if node.is("AssignmentExpression") {
        return Some((node.node("left"), node.node("right"), true));
    }
    node.is("VariableDeclarator").then(|| (node.node("id"), node.node("init"), false))
}

fn loop_assignments(lp: Node) -> HashMap<String, bool> {
    let mut varying = HashMap::new();
    let Some(body) = lp.node("body") else { return varying };
    for node in descendants(body, is_function) {
        let Some((Some(target), Some(value), assigned)) = binding_of(node) else { continue };
        let Some(name) = name_of(Some(target)).filter(|_| target.is("Identifier")) else { continue };
        let sources: Vec<String> = names_in(value).into_iter().filter(|each| *each != name).collect();
        let carried = assigned && !sources.is_empty();
        let derived = sources.iter().any(|each| varying.get(each) == Some(&true));
        varying.insert(name, carried || derived);
    }
    varying
}

/// `isPagingCall`; `lp` is the loop of the enclosing site (`None` for an iteration callback).
pub fn is_paging_call(call: Node, lp: Option<Node>) -> bool {
    let Some(lp) = lp.filter(|lp| !(lp.is("ForOfStatement") || lp.is("ForInStatement"))) else { return false };
    let arguments = if call.is("CallExpression") { call.nodes("arguments") } else { Vec::new() };
    let inputs: Vec<String> = arguments.into_iter().flat_map(names_in).collect();
    let stepped = stepped_names(lp);
    let polling = lp.node("test").is_some_and(|test| test.contains(call));
    if polling || inputs.iter().any(|name| stepped.contains(name)) {
        return true;
    }
    if !is_paging_loop(lp) {
        return false;
    }
    let varying = loop_assignments(lp);
    let changing: Vec<&String> = inputs.iter().filter(|name| varying.contains_key(*name)).collect();
    let carried = changing.iter().any(|name| varying.get(*name) == Some(&true));
    if is_open_loop(lp) { carried } else { changing.is_empty() || carried }
}
