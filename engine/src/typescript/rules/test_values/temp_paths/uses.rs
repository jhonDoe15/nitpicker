//! `temp-path-uses.mts`: whether a path reaches a call that writes, moves or removes a file, or starts a process,
//! through the names and the functions that carry it.
use super::parts::{callee_name, is_join};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;

const MAX_DEPTH: usize = 6;
const MOVE_NAMES: [&str; 1] = ["rename"];
const TARGET_NAMES: [&str; 4] = ["copyFile", "cp", "copy", "symlink"];
const ONE_PATH_NAMES: [&str; 14] = [
    "writeFile", "appendFile", "createWriteStream", "mkdir", "outputFile", "outputJson", "writeJson", "ensureDir", "emptyDir", "rm", "rmdir",
    "unlink", "remove", "truncate",
];
const PROCESS_STARTS: [&str; 10] = ["exec", "execSync", "execFile", "execFileSync", "spawn", "spawnSync", "fork", "execa", "execaSync", "execaNode"];
const CARRIERS: [&str; 7] =
    ["ArrayExpression", "SpreadElement", "ObjectExpression", "AwaitExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression"];
const DATA_CARRIERS: [&str; 4] = ["ArrayExpression", "SpreadElement", "ObjectExpression", "Property"];
const FUNCTIONS: [&str; 3] = ["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"];

fn in_sync(names: &[&str], name: &str) -> bool {
    names.iter().any(|known| name == *known || name.strip_suffix("Sync") == Some(*known))
}

/// `isPathPiece`: a template, a `+` concatenation or a join.
pub fn is_path_piece(node: Option<Node>) -> bool {
    node.is_some_and(|node| node.is("TemplateLiteral") || (node.is("BinaryExpression") && node.text("operator").as_deref() == Some("+")) || is_join(node))
}

fn is_carried(node: Node) -> bool {
    let Some(parent) = node.parent() else { return false };
    if parent.is("Property") {
        return parent.node("value") == Some(node) && parent.parent().is_some_and(|object| object.is("ObjectExpression"));
    }
    CARRIERS.contains(&parent.kind()) || is_path_piece(Some(parent))
}

fn carrier_of(node: Node) -> (Node, bool) {
    let mut chain = vec![node];
    while let Some(current) = chain.last().copied().filter(|current| is_carried(*current)).and_then(|current| current.parent()) {
        chain.push(current);
    }
    let as_data = chain[1..].iter().any(|carrier| DATA_CARRIERS.contains(&carrier.kind()));
    (chain.last().copied().unwrap_or(node), as_data)
}

fn enclosing_function(node: Node) -> Option<Node> {
    let parent = node.parent()?;
    if parent.is("ArrowFunctionExpression") && parent.node("body") == Some(node) {
        return Some(parent);
    }
    if !parent.is("ReturnStatement") {
        return None;
    }
    parent.ancestors().find(|ancestor| FUNCTIONS.contains(&ancestor.kind()))
}

fn function_binding(function: Node) -> Option<Node> {
    if function.is("FunctionDeclaration") {
        return function.node("id");
    }
    let parent = function.parent()?;
    parent.node("id").filter(|id| parent.is("VariableDeclarator") && id.is("Identifier"))
}

/// The identifiers of the reads of a binding's variable.
pub fn reads_of<'s>(scopes: &Scopes<'_, 's>, binding: Node<'s>) -> Vec<Node<'s>> {
    let Some(symbol) = super::super::find_variable(scopes, binding) else { return Vec::new() };
    scopes.references(symbol).into_iter().filter(super::super::is_read).map(|reference| reference.identifier).collect()
}

fn uses_of<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> Vec<Node<'s>> {
    let parent = node.parent();
    let declared = parent.filter(|parent| parent.is("VariableDeclarator") && parent.node("init") == Some(node)).and_then(|parent| parent.node("id"));
    if let Some(id) = declared.filter(|id| id.is("Identifier")) {
        return reads_of(scopes, id);
    }
    if let Some(binding) = enclosing_function(node).and_then(function_binding) {
        let calls = reads_of(scopes, binding).into_iter().filter_map(|identifier| identifier.parent().filter(|call| call.is("CallExpression") && call.node("callee") == Some(identifier)));
        return calls.collect();
    }
    vec![node]
}

fn is_change_call(top: Node, as_data: bool) -> bool {
    let Some(parent) = top.parent().filter(|parent| matches!(parent.kind(), "CallExpression" | "NewExpression")) else { return false };
    if parent.node("callee") == Some(top) {
        return false;
    }
    let name = callee_name(parent.node("callee"));
    let Some(position) = parent.list("arguments").iter().position(|argument| *argument == Some(top)) else { return false };
    let path_argument = if in_sync(&TARGET_NAMES, &name) { position == 1 } else { position == 0 || (position == 1 && in_sync(&MOVE_NAMES, &name)) };
    let changes = in_sync(&ONE_PATH_NAMES, &name) || in_sync(&MOVE_NAMES, &name) || in_sync(&TARGET_NAMES, &name);
    PROCESS_STARTS.contains(&name.as_str()) || (changes && !as_data && path_argument)
}

/// `reachesFileChange`.
pub fn reaches_file_change(scopes: &Scopes, start: Node) -> bool {
    let mut pending = vec![(start, 0)];
    let mut index = 0;
    while index < pending.len() {
        let (node, depth) = pending[index];
        index += 1;
        let carried: Vec<(Node, bool)> = if depth > MAX_DEPTH { Vec::new() } else { uses_of(scopes, node).into_iter().map(carrier_of).collect() };
        if carried.iter().any(|(top, as_data)| is_change_call(*top, *as_data)) {
            return true;
        }
        pending.extend(carried.into_iter().filter(|(top, _)| *top != node).map(|(top, _)| (top, depth + 1)));
    }
    false
}
