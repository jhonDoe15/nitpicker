use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use std::collections::HashMap;

const RULE: &str = "cognitive-complexity";
const DEFAULT_MAX: u32 = 15;
const FUNCTIONS: [&str; 3] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];
const LOOPS: [&str; 5] = ["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"];
const NESTED: [&str; 3] = ["ConditionalExpression", "SwitchStatement", "CatchClause"];

fn is_function(node: Node) -> bool {
    FUNCTIONS.contains(&node.kind())
}

fn is_else_if(node: Node) -> bool {
    node.is("IfStatement") && node.parent().is_some_and(|parent| parent.is("IfStatement") && parent.node("alternate") == Some(node))
}

fn nests_child(parent: Node, child: Node) -> bool {
    match parent.kind() {
        "IfStatement" => {
            parent.node("consequent") == Some(child) || (parent.node("alternate") == Some(child) && !child.is("IfStatement"))
        }
        "ConditionalExpression" => parent.node("test") != Some(child),
        "SwitchStatement" => parent.node("discriminant") != Some(child),
        "CatchClause" => parent.node("body") == Some(child),
        kind => LOOPS.contains(&kind) && parent.node("body") == Some(child),
    }
}

/// The function a node counts toward and how deep it nests in that function's branches.
fn position(node: Node) -> Option<(u32, u32)> {
    if is_function(node) {
        return Some((node.index, 0));
    }
    let mut nesting = 0;
    let mut child = node;
    loop {
        let parent = child.parent()?;
        nesting += u32::from(nests_child(parent, child));
        if is_function(parent) {
            return Some((parent.index, nesting));
        }
        child = parent;
    }
}

fn add(scores: &mut HashMap<u32, u32>, node: Node, nested: bool) {
    if let Some((root, nesting)) = position(node) {
        *scores.entry(root).or_default() += if nested { 1 + nesting } else { 1 };
    }
}

fn starts_logical_sequence(node: Node) -> bool {
    let operator = node.text("operator");
    matches!(operator.as_deref(), Some("&&" | "||"))
        && !node.parent().is_some_and(|parent| parent.is("LogicalExpression") && parent.text("operator") == operator)
}

fn count(scores: &mut HashMap<u32, u32>, node: Node) {
    match node.kind() {
        "IfStatement" => {
            add(scores, node, !is_else_if(node));
            if let Some(alternate) = node.node("alternate").filter(|alternate| !alternate.is("IfStatement")) {
                add(scores, alternate, false);
            }
        }
        "BreakStatement" | "ContinueStatement" if node.node("label").is_some() => add(scores, node, false),
        "LogicalExpression" if starts_logical_sequence(node) => add(scores, node, false),
        kind if LOOPS.contains(&kind) || NESTED.contains(&kind) => add(scores, node, true),
        _ => {}
    }
}

/// The `=>` after an arrow function's parameters and return type, past white space and comments.
fn arrow_at(text: &str, from: usize) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut at = from;
    while at + 1 < bytes.len() {
        match (bytes[at], bytes[at + 1]) {
            (b'=', b'>') => return Some(at),
            (b'/', b'/') => at = text[at..].find(['\n', '\r', '\u{2028}', '\u{2029}']).map_or(bytes.len(), |end| at + end),
            (b'/', b'*') => at = text[at + 2..].find("*/").map_or(bytes.len(), |end| at + end + 4),
            _ => at += 1,
        }
    }
    None
}

fn head(context: &Context, function: Node) -> (u32, u32) {
    if let Some(id) = function.node("id") {
        return (id.start(), id.end());
    }
    if let Some(parent) = function.parent().filter(|parent| matches!(parent.kind(), "MethodDefinition" | "Property" | "PropertyDefinition"))
        && let Some(key) = parent.node("key")
    {
        return (key.start(), key.end());
    }
    let text = context.file.text;
    if function.is("ArrowFunctionExpression") {
        let ends = [function.node("returnType"), function.nodes("params").last().copied(), function.node("typeParameters")];
        let from = ends.into_iter().flatten().map(|node| node.end()).max().unwrap_or(function.start());
        if let Some(arrow) = arrow_at(text, from as usize) {
            return (arrow as u32, arrow as u32 + 2);
        }
    }
    let word = text[function.start() as usize..].bytes().take_while(u8::is_ascii_alphanumeric).count();
    (function.start(), function.start() + word.max(1) as u32)
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let max = context.setting(&format!("{RULE}.max")).and_then(|value| value.parse().ok()).unwrap_or(DEFAULT_MAX);
    let mut scores = HashMap::new();
    for node in view.nodes() {
        count(&mut scores, node);
    }
    let mut reported: Vec<(u32, u32)> = scores.into_iter().filter(|(_, value)| *value > max).collect();
    reported.sort_unstable();
    for (index, value) in reported {
        let (start, end) = head(context, view.at(index));
        let message = format!(
            "This function has a cognitive complexity of {value}; the limit is {max}. Move nested branches and conditions into smaller named functions."
        );
        context.report_range(RULE, start, Some(end), message);
    }
}
