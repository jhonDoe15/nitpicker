//! `no-shared-temp-path-in-tests`: a temp path that is the same for every test, or unique only per process, that
//! reaches a file write or a started process.
mod parts;
mod uses;

use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use parts::{callee_name, is_join, is_shared_temp_path, path_parts};
use uses::{is_path_piece, reaches_file_change, reads_of};

const RULE: &str = "no-shared-temp-path-in-tests";
const FIXED: &str = "This temp path is the same in every test run, so tests that run at the same time (concurrent tests, or other test files on other workers) write the same file and one overwrites or deletes the other's. Create a directory per test with `fs.mkdtemp(path.join(os.tmpdir(), \"prefix-\"))` and write inside it.";
const PROCESS_ONLY: &str = "This temp path is unique only per process (`process.pid`), so tests in the same process or worker threads build the same name and one overwrites or deletes the other's file. Create a directory per test with `fs.mkdtemp(path.join(os.tmpdir(), \"prefix-\"))` and write inside it.";
const TEMP_DIRECTORY_CALLS: [&str; 2] = ["mkdtemp", "mkdtempSync"];

fn is_temp_directory_prefix(node: Node) -> bool {
    let Some(parent) = node.parent().filter(|parent| parent.is("CallExpression")) else { return false };
    parent.list("arguments").first().copied().flatten() == Some(node) && TEMP_DIRECTORY_CALLS.contains(&callee_name(parent.node("callee")).as_str())
}

fn is_only_built_on(scopes: &Scopes, node: Node) -> bool {
    let Some(parent) = node.parent().filter(|parent| parent.is("VariableDeclarator") && parent.node("init") == Some(node)) else { return false };
    let Some(id) = parent.node("id").filter(|id| id.is("Identifier")) else { return false };
    let reads = reads_of(scopes, id);
    !reads.is_empty() && reads.iter().all(|read| is_path_piece(read.parent()) || is_temp_directory_prefix(*read))
}

fn is_plain_string(node: Node) -> bool {
    (node.is("Literal") && matches!(node.get("value"), Value::Text(..))) || (node.is("TemplateLiteral") && node.list("expressions").is_empty())
}

fn is_candidate(node: Node) -> bool {
    let parent = node.parent();
    !is_path_piece(parent) && !parent.is_some_and(|parent| parent.is("TSLiteralType")) && (is_path_piece(Some(node)) || is_plain_string(node))
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let mut found = Vec::new();
    for node in view.nodes() {
        let visited = match node.kind() {
            "Literal" | "TemplateLiteral" | "BinaryExpression" => true,
            "CallExpression" => is_join(node),
            _ => false,
        };
        if !visited || !is_candidate(node) || is_temp_directory_prefix(node) || is_only_built_on(scopes, node) {
            continue;
        }
        let Some(parts) = is_shared_temp_path(path_parts(scopes, node)) else { continue };
        if reaches_file_change(scopes, node) {
            found.push((node.start(), node.end(), if parts.process_id { PROCESS_ONLY } else { FIXED }));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message.to_string());
    }
}
