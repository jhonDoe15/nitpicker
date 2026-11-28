//! Where a test sits: the condition a comparison belongs to, the statements after a branch.
use crate::typescript::rules::support::view::Node;

const FILTERS: [&str; 5] = ["filter", "find", "findLast", "some", "every"];
const TEST_PARENTS: [&str; 4] = ["IfStatement", "ConditionalExpression", "WhileStatement", "DoWhileStatement"];
const VALUE_PARENTS: [&str; 3] = ["VariableDeclarator", "ReturnStatement", "ArrowFunctionExpression"];

pub fn plain_text(text: &str, node: Node) -> String {
    text[node.start() as usize..node.end() as usize].replace("?.", ".").replace('!', "")
}

pub fn unwrapped(mut node: Node) -> Node {
    while matches!(node.kind(), "ChainExpression" | "TSNonNullExpression" | "TSAsExpression") {
        let Some(inner) = node.node("expression") else { break };
        node = inner;
    }
    node
}

fn is_transparent(parent: Node) -> bool {
    match parent.kind() {
        "UnaryExpression" => parent.text("operator").as_deref() == Some("!"),
        "LogicalExpression" | "TSNonNullExpression" => true,
        _ => false,
    }
}

fn is_boolean_argument(parent: Node, child: Node) -> bool {
    parent.is("CallExpression")
        && parent.node("callee").and_then(|callee| callee.name()).as_deref() == Some("Boolean")
        && parent.nodes("arguments").first() == Some(&child)
}

fn is_predicate_body(parent: Node, child: Node) -> bool {
    let Some(call) = parent.parent().filter(|call| call.is("CallExpression")) else { return false };
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"));
    parent.is("ArrowFunctionExpression")
        && parent.node("body") == Some(child)
        && call.nodes("arguments").first() == Some(&parent)
        && callee.is_some_and(|callee| callee.node("property").and_then(|property| property.name()).is_some_and(|name| FILTERS.contains(&name.as_ref())))
}

pub fn condition_root(node: Node) -> Option<Node> {
    let mut child = node;
    for parent in node.ancestors() {
        if TEST_PARENTS.contains(&parent.kind()) {
            return (parent.node("test") == Some(child)).then_some(child);
        }
        if is_boolean_argument(parent, child) || is_predicate_body(parent, child) {
            return Some(child);
        }
        if !is_transparent(parent) {
            return None;
        }
        child = parent;
    }
    None
}

pub fn presence_root(node: Node) -> Option<Node> {
    if let Some(condition) = condition_root(node) {
        return Some(condition);
    }
    let mut child = node;
    for parent in node.ancestors() {
        if VALUE_PARENTS.contains(&parent.kind()) {
            return Some(child);
        }
        if !is_transparent(parent) {
            return None;
        }
        child = parent;
    }
    None
}

pub fn siblings_after(node: Node) -> Vec<Node> {
    let list = match node.parent() {
        Some(holder) if matches!(holder.kind(), "BlockStatement" | "Program") => holder.nodes("body"),
        Some(holder) if holder.is("SwitchCase") => holder.nodes("consequent"),
        _ => Vec::new(),
    };
    let from = list.iter().position(|item| *item == node).map_or(0, |index| index + 1);
    list[from..].to_vec()
}

pub fn enclosing_statement(node: Node) -> Node {
    let holds = |item: &Node| item.parent().is_some_and(|parent| matches!(parent.kind(), "BlockStatement" | "Program" | "SwitchCase"));
    std::iter::once(node).chain(node.ancestors()).find(holds).unwrap_or(node)
}
