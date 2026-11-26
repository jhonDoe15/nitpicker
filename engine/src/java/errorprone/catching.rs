//! Checks on catch clauses, labels and `finalize`: CatchAndPrintStackTrace, InterruptedInCatchBlock, LabelledBreakTarget, Finalize.
use super::Context;
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::unused::statements;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

const CATCH_AND_PRINT: &str = "Logging or rethrowing exceptions should usually be preferred to catching and calling printStackTrace";
const INTERRUPTED: &str = "Did you mean to call Thread.currentThread().interrupt() instead of Thread.interrupted()?";

pub fn catch_and_print_stack_trace(context: &Context, node: Node) {
    if node.kind() != "catch_clause" {
        return;
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    let [only] = statements(body)[..] else { return };
    if only.kind() != "expression_statement" {
        return;
    }
    let Some(call) = named_children(only).into_iter().find(|part| part.kind() == "method_invocation") else { return };
    if only.named_child_count() == 1 && context.resolver.matches_sig(call, "java.lang.Throwable#printStackTrace()") && !is_static(context, call) {
        context.report_fixed("CatchAndPrintStackTrace", only, only.start_byte(), CATCH_AND_PRINT, &[]);
    }
}

fn is_static(context: &Context, call: Node) -> bool {
    context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.is_static)
}

fn caught_types(context: &Context, catch: Node) -> Vec<Option<Type>> {
    let parameter = children(catch).into_iter().find(|part| part.kind() == "catch_formal_parameter");
    let union = parameter.and_then(|parameter| children(parameter).into_iter().find(|part| part.kind() == "catch_type"));
    let kinds = union.map(named_children).unwrap_or_default();
    kinds.into_iter().filter(|part| !part.kind().ends_with("comment")).map(|part| context.resolver.type_node(part)).collect()
}

fn thread_interrupted(context: &Context, call: Node) -> bool {
    call.child_by_field_name("arguments").is_some_and(|list| list.named_child_count() == 0)
        && static_on_class(context, call, "java.lang.Thread", &["interrupted"])
}

/// Error Prone's `isReturnValueUnused` for a call whose method returns a value.
fn value_unused(context: &Context, call: Node) -> bool {
    let Some(holder) = parent(call) else { return false };
    if holder.kind() == "expression_statement" {
        return true;
    }
    if holder.kind() != "lambda_expression" || holder.child_by_field_name("body") != Some(call) {
        return false;
    }
    let Some(target) = context.resolver.lambda_target(holder) else { return false };
    context.resolver.index.functional_method(&target.name()).is_some_and(|(_, method)| method.returns == Type::Primitive("void"))
}

pub fn interrupted_in_catch_block(context: &Context, node: Node) {
    if node.kind() != "catch_clause" {
        return;
    }
    let kinds = caught_types(context, node);
    let interrupted = "java.lang.InterruptedException";
    if kinds.is_empty() || !kinds.iter().all(|kind| kind.as_ref().is_some_and(|kind| matches!(kind, Type::Class(..)) && context.resolver.index.is_subtype(&kind.name(), interrupted))) {
        return;
    }
    walk(node, |call| {
        if call.kind() != "method_invocation" || !thread_interrupted(context, call) {
            return;
        }
        let mut fixes = Vec::new();
        if value_unused(context, call) {
            fixes.push(Fix::replace(call.start_byte(), call.end_byte(), "Thread.currentThread().interrupt()"));
        }
        let at = call.child_by_field_name("arguments").map_or(call.start_byte(), |list| list.start_byte());
        context.report_fixed("InterruptedInCatchBlock", call, at, INTERRUPTED, &fixes);
    });
}

pub fn labelled_break_target(context: &Context, node: Node) {
    if node.kind() != "labeled_statement" {
        return;
    }
    let body = named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).nth(1);
    if body.is_some_and(|body| matches!(body.kind(), "do_statement" | "enhanced_for_statement" | "for_statement" | "while_statement")) {
        return;
    }
    context.report_fixed("LabelledBreakTarget", node, node.start_byte(), "Labels should only be used on loops.", &[]);
}

fn finalize_visible(method: Node) -> bool {
    if has_modifier(method, "public") || has_modifier(method, "protected") {
        return true;
    }
    let interface = parent(method).and_then(parent).is_some_and(|holder| holder.kind() == "interface_declaration");
    interface && !has_modifier(method, "private")
}

pub fn finalize(context: &Context, node: Node) {
    if node.kind() != "method_declaration" || node.child_by_field_name("name").is_none_or(|name| context.text(name) != "finalize") {
        return;
    }
    if node.child_by_field_name("parameters").is_some_and(|list| list.named_child_count() > 0) {
        return;
    }
    let returns = node.child_by_field_name("type");
    let void = returns.is_some_and(|kind| kind.kind() == "void_type" || context.resolver.type_node(kind).is_some_and(|kind| kind.name() == "java.lang.Void"));
    if !void || !finalize_visible(node) {
        return;
    }
    let at = node.child_by_field_name("name").map_or(node.start_byte(), |name| name.start_byte());
    context.report_fixed("Finalize", node, at, "Do not override finalize", &[]);
}
