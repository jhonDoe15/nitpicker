//! FutureTransformAsync: `transformAsync`, `callAsync` and `submitAsync` whose lambda only returns immediate futures.
use super::call_match::{instance_on_exact_class, static_on_class};
use super::fixes::Fix;
use super::optional_checks::rename_invocation;
use super::positions::{arguments, preferred};
use super::throws::thrown_by;
use super::Context;
use crate::engine::source::{children, named_children};
use tree_sitter::Node;

const FUTURES: &str = "com.google.common.util.concurrent.Futures";
const FLUENT: &str = "com.google.common.util.concurrent.FluentFuture";
const CLOSING: &str = "com.google.common.util.concurrent.ClosingFuture";
const COMBINER: &str = "com.google.common.util.concurrent.Futures.FutureCombiner";

struct Kind {
    fixed: &'static str,
    checked: bool,
}

fn kind_of(context: &Context, call: Node) -> Option<Kind> {
    if static_on_class(context, call, FUTURES, &["transformAsync"]) {
        return Some(Kind { fixed: "transform", checked: false });
    }
    for owner in [CLOSING, FLUENT] {
        if instance_on_exact_class(context, call, owner, &["transformAsync"]) {
            return Some(Kind { fixed: "transform", checked: false });
        }
    }
    if instance_on_exact_class(context, call, COMBINER, &["callAsync"]) {
        return Some(Kind { fixed: "call", checked: true });
    }
    if static_on_class(context, call, FUTURES, &["submitAsync"]) {
        return Some(Kind { fixed: "submit", checked: true });
    }
    None
}

fn throws_checked(context: &Context, body: Node) -> bool {
    let index = &context.resolver.index;
    match thrown_by(context, &[body]) {
        Some(thrown) => thrown.iter().any(|kind| {
            index.is_subtype(kind, "java.lang.Throwable") && !index.is_subtype(kind, "java.lang.RuntimeException") && !index.is_subtype(kind, "java.lang.Error")
        }),
        None => true,
    }
}

fn is_executor(context: &Context, lambda: Node) -> bool {
    context.resolver.lambda_target(lambda).is_some_and(|target| {
        let name = target.name();
        name == "java.util.concurrent.Executor" || context.resolver.index.is_subtype(&name, "java.util.concurrent.Executor")
    })
}

/// The returned expressions of a lambda body; `None` entries are `return;`.
fn returns<'t>(node: Node<'t>, found: &mut Vec<Option<Node<'t>>>) {
    for child in children(node) {
        match child.kind() {
            "lambda_expression" | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "class_body" => {}
            "return_statement" => found.push(named_children(child).into_iter().find(|part| !matches!(part.kind(), "line_comment" | "block_comment"))),
            _ => returns(child, found),
        }
    }
}

fn immediate<'t>(context: &Context, expression: Node<'t>) -> Option<&'static str> {
    for owner in [FUTURES, FLUENT, CLOSING] {
        if static_on_class(context, expression, owner, &["immediateFuture"]) {
            return Some("immediateFuture");
        }
        if static_on_class(context, expression, owner, &["immediateVoidFuture"]) {
            return Some("immediateVoidFuture");
        }
    }
    None
}

fn removal(context: &Context, call: Node, name: &str) -> Fix {
    let (type_argument, argument) = if name == "immediateFuture" {
        let arguments_node = call.child_by_field_name("type_arguments");
        let single = arguments_node.map(named_children).filter(|list| list.len() == 1).map(|list| context.text(list[0]).to_string());
        (single.unwrap_or_default(), arguments(call).first().map(|first| context.text(*first).to_string()).unwrap_or_default())
    } else {
        ("Void".to_string(), "null".to_string())
    };
    let text = if type_argument.is_empty() { argument } else { format!("({}) {}", type_argument, argument) };
    Fix::replace(call.start_byte(), call.end_byte(), text)
}

pub fn future_transform_async(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(name) = call.child_by_field_name("name") else { return };
    if !matches!(context.text(name), "transformAsync" | "callAsync" | "submitAsync") {
        return;
    }
    let Some(kind) = kind_of(context, call) else { return };
    let lambda = arguments(call).into_iter().find(|argument| {
        argument.kind() == "lambda_expression"
            && !is_executor(context, *argument)
            && (kind.checked || argument.child_by_field_name("body").is_some_and(|body| !throws_checked(context, body)))
    });
    let Some(lambda) = lambda else { return };
    let Some(body) = lambda.child_by_field_name("body") else { return };
    let mut found = Vec::new();
    if body.kind() == "block" {
        returns(body, &mut found);
    } else {
        found.push(Some(body));
    }
    let mut sites = Vec::new();
    for expression in &found {
        let Some(expression) = expression else { return };
        let Some(which) = immediate(context, *expression) else { return };
        sites.push((*expression, which));
    }
    let mut fix = rename_invocation(call, kind.fixed);
    if call.child_by_field_name("object").is_none() {
        fix = fix.with_imports();
    }
    for (expression, which) in sites {
        fix = fix.merged(removal(context, expression, which));
    }
    let message = "Use transform instead of transformAsync when all returns are an immediate future.";
    context.report_fixed("FutureTransformAsync", call, preferred(context, call), message, &[fix]);
}
