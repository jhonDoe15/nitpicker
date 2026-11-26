//! FloggerWithCause and FloggerWithoutCause: how a logged exception is attached to a Flogger call.
use super::Context;
use super::fixes::Fix;
use super::flogger_calls::on_descendant;
use super::method_call_checks::{erased_subtype, expression_subtype};
use super::positions::{arguments, preferred};
use crate::engine::source::children;
use crate::java::types::model::Type;
use tree_sitter::Node;

const LOGGING_API: &str = "com.google.common.flogger.LoggingApi";
const FIXABLE: [&str; 7] = [
    "java.lang.AssertionError",
    "java.lang.Error",
    "java.lang.Exception",
    "java.lang.IllegalArgumentException",
    "java.lang.IllegalStateException",
    "java.lang.RuntimeException",
    "java.lang.Throwable",
];

/// What `ASTHelpers.streamReceivers` walks: each receiver of a call chain, through field accesses.
fn receivers<'t>(call: Node<'t>) -> Vec<Node<'t>> {
    let mut found = Vec::new();
    let mut current = call;
    while matches!(current.kind(), "method_invocation" | "field_access") {
        let Some(next) = current.child_by_field_name("object") else { break };
        found.push(next);
        current = next;
    }
    found
}

pub fn flogger_without_cause(context: &Context, call: Node) {
    if !on_descendant(context, call, LOGGING_API, &["log"], false) {
        return;
    }
    let exception = arguments(call).into_iter().rev().find(|argument| {
        context.resolver.type_of(*argument).is_some_and(|kind| kind != Type::Null && erased_subtype(context, *argument, &kind, "java.lang.Throwable", 0))
    });
    let Some(exception) = exception else { return };
    if receivers(call).into_iter().any(|receiver| on_descendant(context, receiver, LOGGING_API, &["withCause"], false)) {
        return;
    }
    let Some(receiver) = call.child_by_field_name("object") else { return };
    let fix = Fix::new().insert(receiver.end_byte(), format!(".withCause({})", context.text(exception)));
    context.report_fixed("FloggerWithoutCause", call, preferred(context, call), "Use withCause to associate Exceptions with log statements", &[fix]);
}

/// The argument that `getThrowableArgument` takes: a throwable, or the receiver of its `getMessage()` or `toString()`.
fn throwable_argument<'t>(context: &Context, creation: Node<'t>) -> Option<Option<Node<'t>>> {
    for argument in arguments(creation) {
        if context.resolver.type_of(argument).is_some_and(|kind| erased_subtype(context, argument, &kind, "java.lang.Throwable", 0)) {
            return Some(Some(argument));
        }
        if on_descendant(context, argument, "java.lang.Throwable", &["getMessage", "toString"], false) {
            return Some(argument.child_by_field_name("object"));
        }
    }
    None
}

fn fixable_constructor(context: &Context, creation: Node) -> bool {
    if children(creation).iter().any(|part| part.kind() == "class_body") || !arguments(creation).is_empty() {
        return false;
    }
    context.resolver.resolve_constructor(creation).is_some_and(|resolved| FIXABLE.contains(&resolved.declaring.as_str()) && resolved.method.parameters.is_empty())
}

pub fn flogger_with_cause(context: &Context, call: Node) {
    if !on_descendant(context, call, LOGGING_API, &["withCause"], false) {
        return;
    }
    let list = arguments(call);
    let [cause] = list.as_slice() else { return };
    if cause.kind() != "object_creation_expression" {
        return;
    }
    let found = throwable_argument(context, *cause);
    let throwable = found.flatten();
    if found.is_none() && !fixable_constructor(context, *cause) {
        return;
    }
    let Some(receiver) = call.child_by_field_name("object") else { return };
    let (start, end) = (receiver.end_byte(), call.end_byte());
    let fixes = match throwable {
        Some(throwable) => {
            let with_cause = format!(".withCause({})", context.text(throwable));
            vec![Fix::replace(start, end, with_cause.clone()), Fix::replace(start, end, format!(".withStackTrace(MEDIUM){with_cause}")).with_imports()]
        }
        None => vec![Fix::replace(start, end, ".withStackTrace(MEDIUM)").with_imports()],
    };
    let message = "Calling withCause(Throwable) with an inline allocated Throwable is discouraged. Consider using withStackTrace(StackSize) instead, and specifying a reduced stack size (e.g. SMALL, MEDIUM or LARGE) instead of FULL, to improve performance.";
    context.report_fixed("FloggerWithCause", call, preferred(context, call), message, &fixes);
}
