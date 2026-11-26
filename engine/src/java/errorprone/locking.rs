//! Checks on locks: synchronizing on a field that can change, and `Lock.lock` that is not guarded by a `try`.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::model::flag;
use tree_sitter::Node;

const SYNCHRONIZED: &str = "Synchronizing on non-final fields is not safe: if the field is ever updated, different threads may end up locking on different objects.";
const LAZY_INIT: &str = "com.google.errorprone.annotations.concurrent.LazyInit";

fn stripped(node: Node) -> Node {
    let mut node = node;
    while node.kind() == "parenthesized_expression" {
        match named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")) {
            Some(inner) => node = inner,
            None => break,
        }
    }
    node
}

/// Whether the field's declaration in this file carries `@LazyInit`.
fn lazy_init(context: &Context, declaring: &str, name: &str) -> bool {
    super::lookup::field_declarator(context, context.file.tree.root_node(), declaring, name)
        .is_some_and(|(declaration, _)| context.resolver.annotation_names(declaration).iter().any(|annotation| annotation == LAZY_INIT))
}

pub fn synchronize_on_non_final_field(context: &Context, node: Node) {
    if node.kind() != "synchronized_statement" {
        return;
    }
    let Some(held) = named_children(node).into_iter().find(|part| part.kind() == "parenthesized_expression") else { return };
    let expression = stripped(held);
    let Some((declaring, field)) = super::lookup::field_of(context, expression) else { return };
    if field.flags & (flag::STATIC | flag::FINAL) != 0 || declaring.name == "java.io.Writer" || declaring.name == "java.io.Reader" {
        return;
    }
    if lazy_init(context, &declaring.name, &field.name) {
        return;
    }
    context.report_fixed("SynchronizeOnNonFinalField", node, held.start_byte(), SYNCHRONIZED, &[]);
}

const LOCK: &str = "java.util.concurrent.locks.Lock#lock(_*)";
const UNLOCK: &str = "java.util.concurrent.locks.Lock#unlock(_*)";

fn is_call(context: &Context, node: Node, name: &str, signature: &str) -> bool {
    node.kind() == "method_invocation"
        && node.child_by_field_name("name").is_some_and(|part| context.text(part) == name)
        && node.child_by_field_name("arguments").is_some()
        && context.resolver.matches_sig(node, signature)
}

fn statements<'t>(block: Node<'t>) -> Vec<Node<'t>> {
    named_children(block).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn same_source(context: &Context, node: Node, lockee: Node) -> bool {
    node.child_by_field_name("object").is_some_and(|receiver| context.text(receiver) == context.text(lockee))
}

fn is_try(node: Node) -> bool {
    matches!(node.kind(), "try_statement" | "try_with_resources_statement")
}

/// Error Prone's scan of a finally block: `Some(true)` when the first unlock found releases this lock.
fn scan_released(context: &Context, node: Node, lockee: Node) -> Option<bool> {
    match node.kind() {
        "method_invocation" if is_call(context, node, "unlock", UNLOCK) => Some(same_source(context, node, lockee)),
        "block" | "constructor_body" => {
            let mut result: Option<bool> = None;
            for (at, statement) in statements(node).into_iter().enumerate() {
                let next = scan_released(context, statement, lockee);
                result = if at == 0 {
                    next
                } else if next.is_none() {
                    result
                } else if result.is_none() {
                    None
                } else {
                    Some(next.unwrap_or(false) && result.unwrap_or(false))
                };
            }
            result
        }
        "expression_statement" | "parenthesized_expression" => named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")).and_then(|inner| scan_released(context, inner, lockee)),
        _ => None,
    }
}

fn releases_try(context: &Context, tried: Node, lockee: Node) -> bool {
    let Some(clause) = children(tried).into_iter().find(|part| part.kind() == "finally_clause") else { return false };
    let Some(block) = named_children(clause).into_iter().find(|part| part.kind() == "block") else { return false };
    scan_released(context, block, lockee).unwrap_or(false)
}

fn release_statement(context: &Context, statement: Node, lockee: Node) -> bool {
    statement.kind() == "expression_statement"
        && named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")).is_some_and(|call| is_call(context, call, "unlock", UNLOCK) && same_source(context, call, lockee))
}

fn acquire_statement(context: &Context, statement: Node, lockee: Node) -> bool {
    statement.kind() == "expression_statement"
        && named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")).is_some_and(|call| is_call(context, call, "lock", LOCK) && same_source(context, call, lockee))
}

pub fn lock_not_before_try(context: &Context, node: Node) {
    if !is_call(context, node, "lock", LOCK) {
        return;
    }
    let Some(statement) = parent(node).filter(|holder| holder.kind() == "expression_statement") else { return };
    let Some(block) = parent(statement).filter(|holder| matches!(holder.kind(), "block" | "constructor_body")) else { return };
    let list = statements(block);
    let Some(index) = list.iter().position(|part| *part == statement) else { return };
    if list.get(index + 1).is_some_and(|next| is_try(*next)) {
        return;
    }
    let Some(lockee) = node.child_by_field_name("object") else { return };
    let at = node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte());
    let name = context.text(lockee);
    let mut enclosing = parent(node);
    while let Some(up) = enclosing {
        if is_try(up) {
            break;
        }
        enclosing = parent(up);
    }
    if let Some(tried) = enclosing.filter(|tried| releases_try(context, *tried, lockee)) {
        let message = format!("Prefer obtaining the lock for {name} outside the try block. That way, if #lock throws, the lock is not erroneously released.");
        let first = tried.child_by_field_name("body").map(statements).and_then(|body| body.first().copied());
        let mut fixes = Vec::new();
        if first == Some(statement) {
            let fix = Fix::replace(statement.start_byte(), statement.end_byte(), "").insert(tried.start_byte(), context.text(statement));
            fixes.push(fix);
        }
        context.report_fixed("LockNotBeforeTry", node, at, &message, &fixes);
        return;
    }
    for later in &list[index + 1..] {
        if is_try(*later) && releases_try(context, *later, lockee) {
            let Some(body) = later.child_by_field_name("body") else { return };
            let Some(first) = statements(body).first().copied() else { return };
            let text = &context.file.text[later.start_byte()..first.start_byte()];
            let fix = Fix::replace(later.start_byte(), first.start_byte(), "").insert(statement.end_byte(), text);
            let message = "Prefer locking *immediately* before the try block which releases the lock to avoid the possibility of any intermediate statements throwing.";
            context.report_fixed("LockNotBeforeTry", node, at, message, &[fix]);
            return;
        }
        if acquire_statement(context, *later, lockee) {
            context.report_fixed("LockNotBeforeTry", node, at, &format!("Did you forget to release the lock on {name}?"), &[]);
            return;
        }
        if release_statement(context, *later, lockee) {
            let fix = Fix::new().insert(statement.end_byte(), "try {").insert(later.start_byte(), "} finally {").insert(later.end_byte(), "}");
            context.report_fixed("LockNotBeforeTry", node, at, &format!("Prefer releasing the lock on {name} inside a finally block."), &[fix]);
            return;
        }
    }
}
