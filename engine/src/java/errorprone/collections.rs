//! ModifyCollectionInEnhancedForLoop: a collection changed inside the loop that iterates over it.
use super::Context;
use super::symbol_key::same_symbol as same_variable;
use crate::engine::source::{named_children, parent};
use tree_sitter::Node;

const MESSAGE: &str = "Modifying a collection while iterating over it in a loop may cause a ConcurrentModificationException to be thrown or lead to undefined behavior.";

const COLLECTION: &[&str] = &["add", "addAll", "clear", "remove", "removeAll", "retainAll"];
const MAP: &[&str] = &["put", "putAll", "putIfAbsent", "clear", "remove", "replace", "replaceAll", "merge"];

fn matches_modifier(context: &Context, call: Node, name: &str) -> bool {
    (COLLECTION.contains(&name) && context.resolver.matches_sig(call, &format!("java.util.Collection#{name}(_*)")))
        || (MAP.contains(&name) && context.resolver.matches_sig(call, &format!("java.util.Map#{name}(_*)")))
}

fn concurrent_receiver(context: &Context, call: Node) -> bool {
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    let receiver = resolved.receiver.name();
    context.resolver.index.lineage(&receiver).iter().any(|name| name.starts_with("java.util.concurrent"))
}

fn is_statement(node: Node) -> bool {
    let kind = node.kind();
    if kind == "switch_expression" {
        return parent(node).is_some_and(|holder| matches!(holder.kind(), "block" | "switch_block_statement_group" | "if_statement" | "labeled_statement" | "constructor_body"));
    }
    kind.ends_with("_statement")
        || matches!(kind, "block" | "local_variable_declaration" | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "constructor_body" | ";")
}

fn block_ends_in_break_or_return(node: Node) -> bool {
    let mut at = parent(node);
    while let Some(up) = at {
        if is_statement(up) {
            let Some(holder) = parent(up).filter(|holder| matches!(holder.kind(), "block" | "constructor_body")) else { return false };
            let last = named_children(holder).into_iter().rfind(|part| !part.kind().ends_with("comment"));
            return last.is_some_and(|last| matches!(last.kind(), "break_statement" | "return_statement"));
        }
        at = parent(up);
    }
    false
}

fn same_collection(context: &Context, collection: Node, looped: Node) -> bool {
    if same_variable(context, collection, looped) {
        return true;
    }
    if looped.kind() != "method_invocation" {
        return false;
    }
    let Some(receiver) = looped.child_by_field_name("object") else { return false };
    let name = looped.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    same_variable(context, collection, receiver) && matches!(name, "entrySet" | "keySet" | "values") && context.resolver.matches_sig(looped, &format!("java.util.Map#{name}(_*)"))
}

fn enclosing_loop(context: &Context, call: Node, collection: Node) -> bool {
    let mut at = parent(call);
    while let Some(up) = at {
        match up.kind() {
            "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "lambda_expression" | "class_body" | "class_declaration"
            | "interface_declaration" | "enum_declaration" | "record_declaration" => return false,
            "enhanced_for_statement" => {
                if up.child_by_field_name("value").is_some_and(|looped| same_collection(context, collection, looped)) {
                    return true;
                }
            }
            _ => {}
        }
        at = parent(up);
    }
    false
}

pub fn modify_collection_in_enhanced_for_loop(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    if !COLLECTION.contains(&name) && !MAP.contains(&name) {
        return;
    }
    let Some(collection) = node.child_by_field_name("object") else { return };
    if !matches!(collection.kind(), "identifier" | "field_access") || !has_loop_above(node) {
        return;
    }
    if !matches_modifier(context, node, name) || concurrent_receiver(context, node) || block_ends_in_break_or_return(node) {
        return;
    }
    if enclosing_loop(context, node, collection) {
        let at = node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte());
        context.report_fixed("ModifyCollectionInEnhancedForLoop", node, at, MESSAGE, &[]);
    }
}

fn has_loop_above(node: Node) -> bool {
    let mut at = parent(node);
    while let Some(up) = at {
        match up.kind() {
            "enhanced_for_statement" => return true,
            "method_declaration" | "constructor_declaration" | "lambda_expression" | "class_body" => return false,
            _ => {}
        }
        at = parent(up);
    }
    false
}
