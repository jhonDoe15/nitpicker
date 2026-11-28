//! AsyncCallableReturnsNull, AsyncFunctionReturnsNull, DaggerProvidesNull and DangerousLiteralNull.
use super::Context;
use super::fixes::Fix;
use super::hierarchy::{declared_method, super_methods};
use super::null_branch::definitely_null;
use super::positions::{arguments, preferred};
use crate::engine::source::{ancestor, children, named_children, parent};
use crate::java::types::model::target;
use tree_sitter::Node;

fn provide_fix(node: Node, immediate: bool) -> Vec<super::fixes::Fix> {
    if immediate && node.kind() == "null_literal" {
        vec![Fix::replace(node.start_byte(), node.end_byte(), "immediateFuture(null)").with_imports()]
    } else {
        vec![Fix::new()]
    }
}

fn lambda_overrides(context: &Context, lambda: Node, async_class: &str) -> bool {
    let Some(target) = context.resolver.lambda_target(lambda) else { return false };
    let index = context.resolver.index;
    let Some((owner, method)) = index.functional_method(&target.name()) else { return false };
    owner.name == async_class || super_methods(index, owner, method).iter().any(|(above, _)| above.name == async_class)
}

fn method_overrides(context: &Context, method: Node, async_class: &str) -> bool {
    let Some((origin, declared)) = declared_method(context, method) else { return false };
    super_methods(context.resolver.index, origin, declared).iter().any(|(above, _)| above.name == async_class)
}

fn returned_expression(node: Node) -> Option<Node> {
    named_children(node).into_iter().find(|part| !part.kind().ends_with("comment"))
}

fn async_returns(context: &Context, node: Node, check: &'static str, async_class: &str, message: &str) {
    match node.kind() {
        "lambda_expression" => {
            let Some(body) = node.child_by_field_name("body").filter(|body| body.kind() != "block") else { return };
            if definitely_null(context, body, &[]) && lambda_overrides(context, node, async_class) {
                context.report_fixed(check, node, node.start_byte(), message, &provide_fix(body, async_class != LOADER));
            }
        }
        "return_statement" => {
            let Some(expression) = returned_expression(node) else { return };
            if !definitely_null(context, expression, &[]) {
                return;
            }
            let mut current = parent(node);
            while let Some(above) = current {
                let matched = match above.kind() {
                    "method_declaration" => Some(method_overrides(context, above, async_class)),
                    "lambda_expression" => Some(lambda_overrides(context, above, async_class)),
                    _ => None,
                };
                if let Some(matched) = matched {
                    if matched {
                        context.report_fixed(check, node, node.start_byte(), message, &provide_fix(expression, async_class != LOADER));
                    }
                    return;
                }
                current = parent(above);
            }
        }
        _ => {}
    }
}

const FUNCTION: &str = "com.google.common.util.concurrent.AsyncFunction";
const LOADER: &str = "com.google.common.cache.CacheLoader";
const CALLABLE: &str = "com.google.common.util.concurrent.AsyncCallable";

pub fn async_function_returns_null(context: &Context, node: Node) {
    async_returns(context, node, "AsyncFunctionReturnsNull", FUNCTION, "AsyncFunction should not return a null Future, only a Future whose result is null.");
}

pub fn async_callable_returns_null(context: &Context, node: Node) {
    async_returns(context, node, "AsyncCallableReturnsNull", CALLABLE, "AsyncCallable should not return a null Future, only a Future whose result is null.");
}

pub fn cache_loader_null(context: &Context, node: Node) {
    async_returns(context, node, "CacheLoaderNull", LOADER, "The result of CacheLoader#load must be non-null.");
}

/// Whether the method carries a declaration annotation whose simple name is `Nullable`.
fn nullable_method(context: &Context, method: Node) -> bool {
    let Some(modifiers) = crate::java::helpers::modifiers(method) else { return false };
    children(modifiers).into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).any(|annotation| {
        let Some(name) = annotation.child_by_field_name("name").map(|name| context.text(name)) else { return false };
        if name.rsplit('.').next() != Some("Nullable") {
            return false;
        }
        let resolved = context.resolver.class_name(annotation, name).and_then(|class| context.resolver.index.get(&class).and_then(|info| info.targets));
        resolved.is_none_or(|bits| bits & target::bit("METHOD") != 0 || bits & target::bit("TYPE_USE") == 0)
    })
}

pub fn dagger_provides_null(context: &Context, node: Node) {
    if node.kind() != "return_statement" || returned_expression(node).is_none_or(|expression| expression.kind() != "null_literal") {
        return;
    }
    let mut current = parent(node);
    let method = loop {
        match current {
            None => return,
            Some(above) if above.kind() == "lambda_expression" => return,
            Some(above) if matches!(above.kind(), "method_declaration" | "constructor_declaration") => break above,
            Some(above) => current = parent(above),
        }
    };
    if !context.resolver.annotation_names(method).iter().any(|name| name == "dagger.Provides") || nullable_method(context, method) {
        return;
    }
    let add_nullable = Fix::new().insert(method.start_byte(), "@Nullable\n").with_imports();
    let catch = ancestor(node, &["catch_clause"]);
    let replacement = match catch.and_then(|catch| children(catch).into_iter().find(|part| part.kind() == "catch_formal_parameter")).and_then(|parameter| parameter.child_by_field_name("name")) {
        Some(name) => format!("throw new RuntimeException({});", context.text(name)),
        None => "throw new RuntimeException();".to_string(),
    };
    let throw = Fix::replace(node.start_byte(), node.end_byte(), replacement);
    let fixes = if catch.is_none() { [add_nullable, throw] } else { [throw, add_nullable] };
    let message = "Dagger @Provides methods may not return null unless annotated with @Nullable";
    context.report_fixed("DaggerProvidesNull", node, node.start_byte(), message, &fixes);
}

pub fn dangerous_literal_null(context: &Context, node: Node) {
    if node.kind() != "null_literal" {
        return;
    }
    let Some(list) = parent(node).filter(|list| list.kind() == "argument_list") else { return };
    let Some(call) = parent(list).filter(|call| call.kind() == "method_invocation") else { return };
    if arguments(call).len() != 1 {
        return;
    }
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return };
    let body = match name {
        "orElseGet" => "orElse(null)",
        "orElseThrow" => "orElseThrow(NullPointerException::new)",
        _ => return,
    };
    let Some(receiver) = call.child_by_field_name("object") else { return };
    if context.resolver.resolve_call(call).is_none_or(|resolved| resolved.declaring != "java.util.Optional") {
        return;
    }
    let fix = Fix::replace(call.start_byte(), call.end_byte(), format!("{}.{body}", context.text(receiver)));
    let message = "This method is null-hostile: passing a null literal to it is always wrong";
    context.report_fixed("DangerousLiteralNull", call, preferred(context, call), message, &[fix]);
}
