//! `loop-names.mts` and the tree walks of `loop-shapes.mts`: the names a loop binds per pass (its item, its
//! counters, what its body declares) and the names a subtree mentions.
use crate::typescript::rules::collections::loops::Site;
use crate::typescript::rules::support::view::Node;
use std::collections::HashSet;

const FUNCTIONS: [&str; 3] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];
const CONSUMING_METHODS: [&str; 4] = ["shift", "pop", "next", "dequeue"];

pub fn is_function(node: Node) -> bool {
    FUNCTIONS.contains(&node.kind())
}

pub fn never(_: Node) -> bool {
    false
}

/// `isTestedLoop`: a `for`, `while` or `do ... while` loop.
pub fn is_tested_loop(lp: Option<Node>) -> bool {
    lp.is_some_and(|lp| matches!(lp.kind(), "ForStatement" | "WhileStatement" | "DoWhileStatement"))
}

/// `descendants(root, keys, isBoundary)`: the root and every node under it, breadth first, without entering the
/// nodes the boundary picks (other than the root).
pub fn descendants<'v>(root: Node<'v>, boundary: fn(Node) -> bool) -> Vec<Node<'v>> {
    let mut found = vec![root];
    let mut at = 0;
    while at < found.len() {
        let node = found[at];
        if at == 0 || !boundary(node) {
            found.extend(node.children());
        }
        at += 1;
    }
    found
}

/// `nameOf` of a field.
pub fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

/// `calleeName`: the name of an identifier or of a plain member's property, else empty.
pub fn callee_name(callee: Option<Node>) -> String {
    let Some(callee) = callee else { return String::new() };
    if callee.is("Identifier") {
        return name_of(Some(callee)).unwrap_or_default();
    }
    if callee.is("MemberExpression") && !callee.flag("computed") {
        return name_of(callee.node("property")).unwrap_or_default();
    }
    String::new()
}

fn subpatterns(pattern: Node) -> Vec<Node> {
    match pattern.kind() {
        "ObjectPattern" => pattern
            .nodes("properties")
            .into_iter()
            .filter_map(|property| if property.is("Property") { property.node("value") } else { property.node("argument") })
            .collect(),
        "ArrayPattern" => pattern.nodes("elements"),
        "AssignmentPattern" => pattern.node("left").into_iter().collect(),
        "RestElement" => pattern.node("argument").into_iter().collect(),
        _ => Vec::new(),
    }
}

/// The identifiers a binding or assignment pattern names, breadth first.
pub fn pattern_identifiers(pattern: Option<Node>) -> Vec<Node> {
    let mut found = Vec::new();
    let mut pending: Vec<Node> = pattern.into_iter().collect();
    let mut at = 0;
    while at < pending.len() {
        let current = pending[at];
        at += 1;
        if current.is("Identifier") {
            found.push(current);
            continue;
        }
        pending.extend(subpatterns(current));
    }
    found
}

/// `patternNames`.
pub fn pattern_names(pattern: Option<Node>) -> Vec<String> {
    pattern_identifiers(pattern).into_iter().filter_map(|identifier| name_of(Some(identifier))).collect()
}

fn declaration_names(node: Option<Node>) -> Vec<String> {
    let Some(declaration) = node.filter(|node| node.is("VariableDeclaration")) else { return Vec::new() };
    declaration.nodes("declarations").into_iter().flat_map(|declarator| pattern_names(declarator.node("id"))).collect()
}

/// `bodyDeclaredNames`: what the loop body declares, nested functions left out.
pub fn body_declared_names(lp: Node) -> HashSet<String> {
    let Some(body) = lp.node("body") else { return HashSet::new() };
    descendants(body, is_function).into_iter().filter(|node| node.is("VariableDeclarator")).flat_map(|declarator| pattern_names(declarator.node("id"))).collect()
}

/// `callsMethodIn`: a call (awaited or not) of a member whose property is one of the methods.
pub fn calls_method_in(node: Node, methods: &[&str]) -> bool {
    let value = if node.is("AwaitExpression") { node.node("argument") } else { Some(node) };
    let Some(call) = value.filter(|value| value.is("CallExpression")) else { return false };
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"));
    callee.is_some_and(|callee| methods.contains(&name_of(callee.node("property")).unwrap_or_default().as_str()))
}

pub fn is_consuming_call(node: Node) -> bool {
    calls_method_in(node, &CONSUMING_METHODS)
}

fn is_own_step(node: Node) -> bool {
    let own = pattern_names(node.node("left"));
    let Some(right) = node.node("right") else { return false };
    let steps = right.is("BinaryExpression") || right.is("MemberExpression");
    let referenced = referenced_names(right);
    steps && own.iter().any(|name| referenced.contains(name))
}

fn is_self_step(node: Node) -> bool {
    if node.is("UpdateExpression") {
        return true;
    }
    if !node.is("AssignmentExpression") {
        return false;
    }
    node.text("operator").as_deref() != Some("=") || node.node("right").is_some_and(is_consuming_call) || is_own_step(node)
}

fn test_assigned_names(lp: Node) -> Vec<String> {
    let Some(test) = lp.node("test") else { return Vec::new() };
    descendants(test, is_function).into_iter().filter(|node| node.is("AssignmentExpression")).flat_map(|node| pattern_names(node.node("left"))).collect()
}

/// The roots a loop runs each pass: its body, and the update of a `for` loop.
pub fn pass_roots(lp: Node) -> Vec<Node> {
    lp.node("body").into_iter().chain(lp.node("update")).collect()
}

fn updated_names(lp: Node) -> Vec<String> {
    let nodes = pass_roots(lp).into_iter().flat_map(|root| descendants(root, is_function));
    nodes
        .filter(|node| is_self_step(*node))
        .flat_map(|node| if node.is("UpdateExpression") { pattern_names(node.node("argument")) } else { pattern_names(node.node("left")) })
        .collect()
}

/// `itemNames`: the names that change from one pass to the next.
pub fn item_names(found: &Site) -> HashSet<String> {
    match found {
        Site::Callback(callback) => callback.list("params").into_iter().flat_map(pattern_names).collect(),
        Site::Loop(lp) if lp.is("ForOfStatement") || lp.is("ForInStatement") => declaration_names(lp.node("left")).into_iter().collect(),
        Site::Loop(lp) => {
            let init = if lp.is("ForStatement") { lp.node("init") } else { None };
            declaration_names(init).into_iter().chain(updated_names(*lp)).chain(test_assigned_names(*lp)).collect()
        }
    }
}

/// `referencedNames`: every identifier name under a node, nested functions left out.
pub fn referenced_names(node: Node) -> HashSet<String> {
    descendants(node, is_function).into_iter().filter(|each| each.is("Identifier")).filter_map(|each| name_of(Some(each))).collect()
}
