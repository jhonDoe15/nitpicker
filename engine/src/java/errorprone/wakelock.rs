//! WakelockReleasedDangerously: releasing a wakelock acquired with a timeout, outside a `try` that catches `RuntimeException`.
use super::Context;
use super::call_match::instance_on_exact_class;
use super::consts::{Const, constant};
use super::fixes::Fix;
use super::positions::{arguments, preferred};
use super::symbol_key::same_declared_symbol;
use crate::engine::source::{ancestor, children, named_children, parent, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

const WAKELOCK: &str = "android.os.PowerManager.WakeLock";
const RUNTIME_EXCEPTION: &str = "java.lang.RuntimeException";

fn catches_runtime_exception(context: &Context, tried: Node) -> bool {
    let index = context.resolver.index;
    let caught = |kind: Node| match context.resolver.type_node(kind) {
        Some(Type::Class(name, _)) => name == RUNTIME_EXCEPTION || index.is_subtype(RUNTIME_EXCEPTION, &name),
        Some(_) => false,
        None => true,
    };
    children(tried).into_iter().filter(|part| part.kind() == "catch_clause").any(|clause| {
        let Some(parameter) = children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter") else { return false };
        let Some(types) = children(parameter).into_iter().find(|part| part.kind() == "catch_type") else { return false };
        named_children(types).into_iter().filter(|kind| !kind.kind().ends_with("comment")).any(caught)
    })
}

/// `getSymbol(first).equals(getSymbol(second))` for the receivers of two calls.
fn same_symbol(context: &Context, first: Node, second: Node) -> bool {
    match (first.kind(), second.kind()) {
        ("identifier" | "field_access", "identifier" | "field_access") => same_declared_symbol(context, first, second),
        ("method_invocation", "method_invocation") => {
            let named = |call: Node| call.child_by_field_name("name").map(|name| context.text(name));
            match (context.resolver.resolve_call(first), context.resolver.resolve_call(second)) {
                (Some(a), Some(b)) => a.declaring == b.declaring && named(first) == named(second) && a.method.parameters == b.method.parameters,
                _ => false,
            }
        }
        _ => false,
    }
}

fn top_level_class(node: Node) -> Option<Node> {
    let mut found = None;
    let mut current = parent(node);
    while let Some(at) = current {
        if at.kind() == "class_declaration" {
            found = Some(at);
        }
        current = parent(at);
    }
    found
}

fn may_throw(context: &Context, class: Node, wakelock: Node) -> bool {
    let mut timeout = false;
    let mut counted_off = false;
    walk(class, |part| {
        if part.kind() != "method_invocation" {
            return;
        }
        if !part.child_by_field_name("object").is_some_and(|receiver| same_symbol(context, wakelock, receiver)) {
            return;
        }
        let name = part.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
        let list = arguments(part);
        if name == "acquire" && list.len() == 1 {
            timeout = true;
        }
        if name == "setReferenceCounted" && list.first().is_some_and(|first| matches!(constant(context, *first), Some(Const::Bool(false)))) {
            counted_off = true;
        }
    });
    timeout && !counted_off
}

fn strip_parentheses(mut node: Node) -> Node {
    while node.kind() == "parenthesized_expression" {
        match node.named_child(0) {
            Some(inner) => node = inner,
            None => break,
        }
    }
    node
}

fn fix_for(context: &Context, call: Node, release: Node, wakelock: Node) -> Fix {
    let mut before = "\ntry {\n".to_string();
    let mut after = "\n} catch (RuntimeException unused) {\n// Ignore: already released by timeout.\n// TODO: Log this exception.\n}\n".to_string();
    let mut statement = release;
    if release.kind() == "lambda_expression" && release.child_by_field_name("body").is_some_and(|body| body.kind() != "block") {
        statement = release.child_by_field_name("body").unwrap_or(release);
        before = format!("{{{before}");
        after = format!(";{after}}}");
    }
    if let Some(enclosing) = ancestor(call, &["if_statement"]) {
        let condition = enclosing.child_by_field_name("condition").map(|condition| strip_parentheses(condition));
        let held = condition.filter(|condition| {
            enclosing.child_by_field_name("alternative").is_none()
                && instance_on_exact_class(context, *condition, WAKELOCK, &["isHeld"])
                && condition.child_by_field_name("object").is_some_and(|object| same_symbol(context, wakelock, object))
        });
        if let (Some(_), Some(then)) = (held, enclosing.child_by_field_name("consequence")) {
            let mut body = context.text(then).trim();
            body = body.strip_prefix('{').unwrap_or(body);
            body = body.strip_suffix('}').unwrap_or(body);
            let source = context.text(statement);
            let replaced = body.trim().replace(source, &format!("{before}{source}{after}"));
            return Fix::replace(enclosing.start_byte(), enclosing.end_byte(), replaced);
        }
    }
    Fix::new().insert(statement.start_byte(), before).insert(statement.end_byte(), after)
}

pub fn wakelock_released_dangerously(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || !context.resolver.index.android_compatible || !instance_on_exact_class(context, call, WAKELOCK, &["release"]) {
        return;
    }
    if ancestor(call, &["try_statement", "try_with_resources_statement"]).is_some_and(|tried| catches_runtime_exception(context, tried)) {
        return;
    }
    let Some(receiver) = call.child_by_field_name("object") else { return };
    let Some(class) = top_level_class(call) else { return };
    if !matches!(receiver.kind(), "identifier" | "field_access" | "method_invocation") || !may_throw(context, class, receiver) {
        return;
    }
    let Some(release) = parent(call) else { return };
    let message = "On Android versions < P, a wakelock acquired with a timeout may be released by the system before calling `release`, even after checking `isHeld()`. If so, it will throw a RuntimeException. Please wrap in a try/catch block.";
    let at = release.start_byte();
    context.report_fixed("WakelockReleasedDangerously", release, at, message, &[fix_for(context, call, release, receiver)]);
}
