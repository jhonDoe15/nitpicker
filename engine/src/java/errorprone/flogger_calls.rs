//! FloggerPerWithoutRateLimit, FloggerLogWithCause and FloggerRedundantIsEnabled.
use super::Context;
use super::fixes::Fix;
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use super::symbol_key::same_declaration;
use crate::engine::source::{children, named_children};
use crate::java::javac::locals::{Found, Scopes, declaration, is_use};
use tree_sitter::Node;

const LOGGING_API: &str = "com.google.common.flogger.LoggingApi";
const ABSTRACT_LOGGER: &str = "com.google.common.flogger.AbstractLogger";
const FLOGGER: &str = "com.google.common.flogger.FluentLogger";
const FLOGGER_API: &str = "com.google.common.flogger.FluentLogger.Api";

fn name_of<'f>(context: &'f Context, call: Node) -> &'f str {
    call.child_by_field_name("name").map_or("", |name| context.text(name))
}

/// `instanceMethod().onDescendantOf(owner).namedAnyOf(names)`, with no parameters when asked.
pub(super) fn on_descendant(context: &Context, tree: Node, owner: &str, names: &[&str], no_parameters: bool) -> bool {
    if tree.kind() != "method_invocation" || !names.contains(&name_of(context, tree)) || (no_parameters && !arguments(tree).is_empty()) {
        return false;
    }
    let Some(resolved) = context.resolver.resolve_call(tree) else { return false };
    if resolved.method.is_static || (no_parameters && !resolved.method.parameters.is_empty()) {
        return false;
    }
    receiver_class(context, tree).is_some_and(|class| context.resolver.index.is_subtype(&class, owner))
}

fn receiver_call(call: Node) -> Option<Node> {
    call.child_by_field_name("object")
}

pub fn flogger_per_without_rate_limit(context: &Context, tree: Node) {
    if !on_descendant(context, tree, LOGGING_API, &["log"], false) {
        return;
    }
    let mut per = None;
    let mut current = Some(tree);
    while let Some(call) = current.filter(|call| call.kind() == "method_invocation") {
        if on_descendant(context, call, LOGGING_API, &["atMostEvery", "every", "onAverageEvery"], false) {
            return;
        }
        if on_descendant(context, call, LOGGING_API, &["per"], false) {
            per = Some(call);
        }
        current = receiver_call(call);
    }
    if let Some(per) = per {
        let message = "per() methods are no-ops unless combined with atMostEvery(), every(), or onAverageEvery()";
        context.report_fixed("FloggerPerWithoutRateLimit", per, preferred(context, per), message, &[]);
    }
}

pub fn flogger_log_with_cause(context: &Context, clause: Node) {
    if clause.kind() != "catch_clause" {
        return;
    }
    let Some(parameter) = children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter") else { return };
    let Some(block) = clause.child_by_field_name("body") else { return };
    if context.suppressed("FloggerLogWithCause", parameter) {
        return;
    }
    let statements: Vec<Node> = named_children(block).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let [statement] = statements.as_slice() else { return };
    if statement.kind() != "expression_statement" {
        return;
    }
    let Some(expression) = statement.named_child(0).filter(|part| part.kind() == "method_invocation") else { return };
    if !on_descendant(context, expression, LOGGING_API, &["log"], false) {
        return;
    }
    let mut high_level = false;
    let mut current = Some(expression);
    while let Some(call) = current.filter(|call| call.kind() == "method_invocation") {
        if on_descendant(context, call, LOGGING_API, &["withCause"], false) {
            return;
        }
        high_level |= on_descendant(context, call, ABSTRACT_LOGGER, &["atWarning", "atSevere"], false);
        current = receiver_call(call);
    }
    if !high_level {
        return;
    }
    let Some(name) = parameter.child_by_field_name("name") else { return };
    let scopes = Scopes::of(context.file, context.file.tree.root_node());
    let mut used = false;
    crate::engine::source::walk(block, |part| {
        if part.kind() == "identifier" && !used && context.text(part) == context.text(name) && is_use(part) {
            used = matches!(declaration(context.resolver, &scopes, part, context.text(name)), Some(Found::Local(found)) if found.id() == parameter.id());
        }
    });
    if used {
        return;
    }
    let Some(receiver) = receiver_call(expression) else { return };
    let fix = Fix::new().insert(receiver.end_byte(), format!(".withCause({})", context.text(name)));
    let message = "Setting the caught exception as the cause of the log message may provide more context for anyone debugging errors.";
    context.report_fixed("FloggerLogWithCause", expression, preferred(context, expression), message, &[fix]);
}

const LEVELS: [&str; 7] = ["atInfo", "atConfig", "atFine", "atFiner", "atFinest", "atWarning", "atSevere"];

fn unwrap(node: Node) -> Node {
    let mut current = node;
    loop {
        match current.kind() {
            "parenthesized_expression" => match current.named_child(0) {
                Some(inner) => current = inner,
                None => return current,
            },
            "unary_expression" => match current.child_by_field_name("operand") {
                Some(inner) => current = inner,
                None => return current,
            },
            "update_expression" => match children(current).into_iter().find(|part| part.is_named() && !part.kind().ends_with("comment")) {
                Some(inner) => current = inner,
                None => return current,
            },
            _ => return current,
        }
    }
}

fn is_enabled(context: &Context, tree: Node) -> bool {
    on_descendant(context, tree, FLOGGER_API, &["isEnabled"], true)
}

fn at_level(context: &Context, tree: Node) -> bool {
    on_descendant(context, tree, FLOGGER, &LEVELS, true)
}

fn same_method(context: &Context, first: Node, second: Node) -> bool {
    match (context.resolver.resolve_call(first), context.resolver.resolve_call(second)) {
        (Some(a), Some(b)) => a.declaring == b.declaring && name_of(context, first) == name_of(context, second) && a.method.parameters == b.method.parameters,
        _ => false,
    }
}

fn same_logger_at_same_level(context: &Context, first: Node, second: Node) -> bool {
    let (Some(level1), Some(level2)) = (receiver_call(first), receiver_call(second)) else { return false };
    if !at_level(context, level1) || !at_level(context, level2) || !same_method(context, level1, level2) {
        return false;
    }
    let (Some(logger1), Some(logger2)) = (receiver_call(level1), receiver_call(level2)) else { return false };
    match (logger1.kind(), logger2.kind()) {
        ("method_invocation", "method_invocation") => same_method(context, logger1, logger2),
        ("method_invocation", _) | (_, "method_invocation") => false,
        _ => same_declaration(context, logger1, logger2),
    }
}

fn lone_log_invocation<'t>(context: &Context, statement: Node<'t>) -> Option<Node<'t>> {
    let mut then = statement;
    while then.kind() == "block" {
        let statements: Vec<Node> = named_children(then).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
        let [only] = statements.as_slice() else { return None };
        then = *only;
    }
    let expression = then.named_child(0).filter(|_| then.kind() == "expression_statement")?;
    on_descendant(context, expression, FLOGGER_API, &["log"], false).then_some(expression)
}

/// The replacement for the last binary expression in the condition that holds a redundant `isEnabled()`.
fn binary_fix(context: &Context, node: Node, log: Node, found: &mut Option<(usize, usize, String)>) {
    if node.kind() == "binary_expression" {
        if let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) {
            for (checked, kept) in [(left, right), (right, left)] {
                let checked = unwrap(checked);
                if is_enabled(context, checked) && same_logger_at_same_level(context, log, checked) {
                    *found = Some((node.start_byte(), node.end_byte(), context.text(kept).to_string()));
                    return;
                }
            }
        }
    }
    for part in children(node) {
        binary_fix(context, part, log, found);
    }
}

pub fn flogger_redundant_is_enabled(context: &Context, tree: Node) {
    if tree.kind() != "if_statement" || tree.child_by_field_name("alternative").is_some() {
        return;
    }
    let (Some(then), Some(condition)) = (tree.child_by_field_name("consequence"), tree.child_by_field_name("condition")) else { return };
    let Some(log) = lone_log_invocation(context, then) else { return };
    let message = "Logger level check is already implied in the log() call. An explicit atLEVEL().isEnabled() check is redundant.";
    let unwrapped = unwrap(condition);
    if is_enabled(context, unwrapped) && same_logger_at_same_level(context, unwrapped, log) {
        let fix = Fix::replace(tree.start_byte(), tree.end_byte(), format!("{};", context.text(log)));
        context.report_fixed("FloggerRedundantIsEnabled", tree, tree.start_byte(), message, &[fix]);
        return;
    }
    let mut found = None;
    binary_fix(context, condition, log, &mut found);
    if let Some((start, end, text)) = found {
        context.report_fixed("FloggerRedundantIsEnabled", tree, tree.start_byte(), message, &[Fix::replace(start, end, text)]);
    }
}
