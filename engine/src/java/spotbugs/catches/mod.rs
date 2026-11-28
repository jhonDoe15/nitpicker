//! REC_CATCH_EXCEPTION: `catch (Exception e)` on a `try` whose code throws other exceptions only. SpotBugs looks at
//! the exception types the code of the `try` can throw by what its calls declare and what it throws itself (the
//! code a try-with-resources or `synchronized` adds throws `Throwable` again), nested `try` blocks included; it is
//! silent when one of them is `Exception`, when the code neither calls nor throws anything, and when another
//! `catch` of the same `try` takes `RuntimeException`. Each range of the exception table the `catch` covers is
//! judged alone (`code.rs`): the priority starts at 4, one less when the range throws two types or more, one less at
//! 30 bytes and one more less at 300; one more when the handler reads the exception, one more when the `try` has
//! other `catch` clauses. Reported at priority 2 or less, once per method and priority, on the line of the caught
//! type; the `try` statements are taken in the order of javac's exception table, by where their first `catch` starts.
mod code;
mod resources;
mod size;
pub use size::store_gap;
mod slots;
mod thrown;

use super::{Context, place};
use crate::engine::source::{children, named_children, walk};
use std::collections::HashSet;
use tree_sitter::Node;

pub const PATTERN: &str = "REC_CATCH_EXCEPTION";
const EXCEPTION: &str = "java.lang.Exception";
const RUNTIME: &str = "java.lang.RuntimeException";

/// The type each `catch` of a `try` takes, when it takes one only.
fn caught(context: &Context, clause: Node) -> Option<String> {
    let parameter = children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter")?;
    let listed = children(parameter).into_iter().find(|part| part.kind() == "catch_type")?;
    let [single] = named_children(listed)[..] else { return None };
    context.resolver.type_node(single).map(|kind| kind.erased().name())
}

/// Whether the handler's code reads the caught exception.
fn reads_exception(context: &Context, clause: Node) -> bool {
    let Some(parameter) = children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter") else { return false };
    let Some(name) = parameter.child_by_field_name("name").map(|name| context.text(name).to_string()) else { return false };
    let Some(body) = clause.child_by_field_name("body") else { return false };
    let mut read = false;
    walk(body, |node| {
        if node.kind() == "identifier" && context.text(node) == name {
            let written = crate::engine::source::parent(node).is_some_and(|holder| {
                holder.kind() == "assignment_expression" && holder.child_by_field_name("left").is_some_and(|left| left.id() == node.id())
            });
            let member = crate::engine::source::parent(node).is_some_and(|holder| {
                holder.kind() == "field_access" && holder.child_by_field_name("field").is_some_and(|field| field.id() == node.id())
            });
            read |= !written && !member;
        }
    });
    read
}

pub fn catches(context: &Context) {
    if !context.wants(&[PATTERN]) {
        return;
    }
    let mut seen = HashSet::new();
    let mut tries = Vec::new();
    walk(context.file.tree.root_node(), |tried| {
        if matches!(tried.kind(), "try_statement" | "try_with_resources_statement") {
            tries.push(tried);
        }
    });
    tries.sort_by_key(|tried| children(*tried).into_iter().find(|part| part.kind() == "catch_clause").map_or(tried.end_byte(), |clause| clause.start_byte()));
    for tried in tries {
        let clauses: Vec<Node> = children(tried).into_iter().filter(|part| part.kind() == "catch_clause").collect();
        let types: Vec<Option<String>> = clauses.iter().map(|clause| caught(context, *clause)).collect();
        if types.iter().any(|kind| kind.as_deref() == Some(RUNTIME)) {
            continue;
        }
        for (clause, kind) in clauses.iter().zip(&types) {
            if kind.as_deref() != Some(EXCEPTION) {
                continue;
            }
            let thrown = thrown::thrown(context, tried);
            let Some(all) = thrown.within(tried.start_byte(), tried.end_byte()) else { continue };
            if (all.is_empty() && !thrown.calls) || all.contains(EXCEPTION) {
                continue;
            }
            let others = u8::from(reads_exception(context, *clause)) + u8::from(clauses.len() > 1);
            let priorities: Vec<u8> = code::ranges(context, tried)
                .into_iter()
                .filter_map(|(bytes, start, end)| {
                    let types = thrown.within(start, end)?;
                    Some(4 + others - u8::from(types.len() >= 2) - u8::from(bytes >= 30) - u8::from(bytes >= 300))
                })
                .filter(|priority| *priority <= 2)
                .collect();
            let Some(parameter) = children(*clause).into_iter().find(|part| part.kind() == "catch_formal_parameter") else { continue };
            for priority in priorities {
                for label in place::methods(context, *clause) {
                    if !seen.insert((label.clone(), priority)) {
                        continue;
                    }
                    let message = format!("Exception is caught when Exception is not thrown in {label}");
                    context.report_placed(PATTERN, *clause, context.line(parameter), message, place::function(&label), priority);
                }
            }
        }
    }
}
