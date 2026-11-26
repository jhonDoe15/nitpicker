//! `isFillOnce`: a call that fills shared state once, under a guard that tests the state the block then sets
//! (`if (!token) { token = await fetch(url); }`, `cache.has(key)` ... `cache.set(key, ...)`, `token ??= ...`).
use crate::typescript::rules::support::view::Node;
use std::collections::HashSet;

const SETTERS: [&str; 4] = ["set", "add", "setItem", "put"];
const READERS: [&str; 3] = ["has", "get", "getItem"];

fn text<'t>(source: &'t str, node: Node) -> &'t str {
    &source[node.start() as usize..node.end() as usize]
}

fn property_name(member: Node) -> Option<String> {
    member.node("property").and_then(|property| property.name()).map(|name| name.into_owned())
}

fn read_key(source: &str, node: Node) -> Option<String> {
    let parent = node.parent();
    if let Some(parent) = parent.filter(|parent| parent.is("MemberExpression") && parent.node("object") == Some(node)) {
        let reader = parent.parent().is_some_and(|call| call.is("CallExpression") && call.node("callee") == Some(parent));
        let method = property_name(parent);
        return (reader && method.is_some_and(|method| READERS.contains(&method.as_str()))).then(|| text(source, node).to_string());
    }
    let chain = node.is("MemberExpression") || node.is("Identifier");
    let property = parent.is_some_and(|parent| parent.is("MemberExpression") && parent.node("property") == Some(node));
    (chain && !property).then(|| text(source, node).to_string())
}

fn written_key(source: &str, node: Node) -> Option<String> {
    if node.is("AssignmentExpression") {
        return node.node("left").map(|left| text(source, left).to_string());
    }
    let callee = node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression"))?;
    let method = property_name(callee)?;
    SETTERS.contains(&method.as_str()).then(|| callee.node("object").map(|object| text(source, object).to_string())).flatten()
}

fn exits(statement: Node) -> bool {
    let last = if statement.is("BlockStatement") { statement.nodes("body").last().copied() } else { Some(statement) };
    last.is_some_and(|last| last.is("ReturnStatement") || last.is("ThrowStatement"))
}

fn guards<'v>(call: Node<'v>, root: Node<'v>) -> Vec<Node<'v>> {
    let mut found: Vec<Node> = call
        .ancestors()
        .filter(|ancestor| ancestor.is("IfStatement") && root.contains(*ancestor) && !ancestor.node("test").is_some_and(|test| test.contains(call)))
        .collect();
    for block in call.ancestors().filter(|ancestor| ancestor.is("BlockStatement") && root.contains(*ancestor)) {
        let early = |statement: &Node| statement.is("IfStatement") && statement.end() <= call.start() && statement.node("consequent").is_some_and(exits);
        found.extend(block.nodes("body").into_iter().filter(early));
    }
    found
}

pub fn is_fill_once(source: &str, call: Node, root: Node) -> bool {
    let filled = call.ancestors().any(|ancestor| ancestor.is("AssignmentExpression") && matches!(ancestor.text("operator").as_deref(), Some("??=" | "||=")));
    if filled {
        return true;
    }
    let written: HashSet<String> = root.descendants().into_iter().filter_map(|node| written_key(source, node)).collect();
    guards(call, root).into_iter().any(|guard| guard.node("test").is_some_and(|test| test.descendants().into_iter().filter_map(|node| read_key(source, node)).any(|key| written.contains(&key))))
}
