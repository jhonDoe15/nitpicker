//! FutureReturnValueIgnored: a future is dropped, nested in another future, or handed on as a plain `Object`.
use super::Context;
use super::hierarchy::super_methods;
use super::returns::referenced;
use super::unused::{dropped, exception_testing, function_returns_void, mocking, throwing_type};
use crate::engine::source::{children, named_children, parent};
use crate::java::types::index::TypeIndex;
use crate::java::types::model::{ClassInfo, Method, OBJECT, Type, flag};
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

const NAME: &str = "FutureReturnValueIgnored";
const SUMMARY: &str = "Return value of methods returning Future must be checked. Ignoring returned Futures suppresses exceptions thrown from the code that completes the Future.";
const FUTURE: &str = "java.util.concurrent.Future";
const EXEMPT: [&str; 6] = [
    "org.mockito.stubbing.Answer",
    "graphql.schema.DataFetcher",
    "org.jmock.lib.action.CustomAction",
    "net.sf.cglib.proxy.MethodInterceptor",
    "org.aopalliance.intercept.MethodInterceptor",
    "java.lang.reflect.InvocationHandler",
];
const NETTY: [&str; 8] =
    ["addListener", "addListeners", "removeListener", "removeListeners", "sync", "syncUninterruptibly", "await", "awaitUninterruptibly"];
const COMPLETABLE: [&str; 4] = ["exceptionally", "completeAsync", "orTimeout", "completeOnTimeout"];

/// A type the way javac prints it.
pub fn printed(kind: &Type) -> String {
    match kind {
        Type::Class(name, arguments) if !arguments.is_empty() => {
            format!("{name}<{}>", arguments.iter().map(printed).collect::<Vec<String>>().join(","))
        }
        Type::Array(element) => format!("{}[]", printed(element)),
        Type::Wildcard => "?".to_string(),
        other => other.name(),
    }
}

fn is_future(index: &TypeIndex, kind: &Type) -> bool {
    matches!(kind, Type::Class(..)) && index.is_subtype(&kind.erased().name(), FUTURE)
}

fn left_alone(index: &TypeIndex, receiver: &Type, method: &Method) -> bool {
    if method.is_static {
        return false;
    }
    let owner = receiver.erased().name();
    let under = |above: &str| index.is_subtype(&owner, above);
    let name = method.name.as_str();
    (name == "fork" && method.parameters.is_empty() && under("java.util.concurrent.ForkJoinTask"))
        || (name == "submit" && under("java.util.concurrent.CompletionService"))
        || (name == "executeOnPooledThread" && under("com.intellij.openapi.application.Application"))
        || (NETTY.contains(&name) && under("io.netty.util.concurrent.Future"))
        || (matches!(name, "setSuccess" | "setFailure") && under("io.netty.util.concurrent.Promise"))
        || (COMPLETABLE.contains(&name) && owner == "java.util.concurrent.CompletableFuture")
}

/// The method gives a future that the caller is expected to look at.
fn wanted(index: &TypeIndex, declaring: &ClassInfo, receiver: &Type, method: &Method) -> bool {
    if method.name == "<init>" || method.flags & flag::MAY_IGNORE != 0 {
        return false;
    }
    let passes = super_methods(index, declaring, method).iter().any(|(_, above)| above.flags & flag::MAY_IGNORE != 0 && is_future(index, &above.returns));
    !passes && !left_alone(index, receiver, method) && is_future(index, &method.returns)
}

/// What the function a lambda or method reference stands for gives back, as far as its target type says.
fn function_result(context: &Context, function: Node) -> Option<(Type, Type)> {
    let index = context.resolver.index;
    let target = context.resolver.type_of(function)?;
    let (class, method) = index.functional_method(&target.name())?;
    let result = match &target {
        Type::Class(_, arguments) if arguments.is_empty() => method.returns.clone(),
        _ => method.generic_returns.substitute(&index.member_map(&target, &class.name)),
    };
    Some((target, result))
}

fn gives_object(context: &Context, function: Node) -> Option<Type> {
    let (target, result) = function_result(context, function)?;
    (matches!(&result, Type::Class(name, _) if name == OBJECT) || result == Type::Wildcard).then_some(target)
}

fn exempt(context: &Context, class: &str) -> bool {
    EXEMPT.iter().any(|above| context.resolver.index.is_subtype(class, above))
}

fn object_lambda(context: &Context, lambda: Node) -> bool {
    gives_object(context, lambda).is_some_and(|target| !exempt(context, &target.name()))
}

fn nested(context: &Context, node: Node, at: usize, resolved: &crate::java::types::expr::Call) -> bool {
    let index = context.resolver.index;
    let method = &resolved.method;
    if !is_future(index, &method.returns) && !matches!(method.generic_returns, Type::Variable(_)) {
        return false;
    }
    let Some(result) = context.resolver.type_of(node) else { return false };
    let Some(arguments) = index.arguments_as(&result, FUTURE).filter(|arguments| !arguments.is_empty()) else { return false };
    if is_future(index, &arguments[0]) {
        context.report(NAME, node, at, &format!("Method returns a nested type, {}", printed(&result)));
        return true;
    }
    let Type::Class(_, direct) = &method.generic_returns else { return false };
    let map = context.resolver.call_map(resolved, node, true);
    for variable in &method.type_parameters {
        if !direct.iter().any(|argument| matches!(argument, Type::Variable(name) if name == variable)) {
            continue;
        }
        if let Some(made) = map.get(variable).filter(|made| is_future(index, made)) {
            let message = format!(
                "Invocation produces a nested type - Type variable {variable}, as part of return type {} resolved to {}.",
                printed(&method.generic_returns),
                printed(made)
            );
            context.report(NAME, node, at, &message);
            return true;
        }
    }
    false
}

fn call(context: &Context, node: Node) {
    let Some(at) = node.child_by_field_name("arguments").map(|list| list.start_byte()) else { return };
    let Some(resolved) = context.resolver.resolve_call(node) else { return };
    let index = context.resolver.index;
    let method = &resolved.method;
    let Some(declaring) = index.get(&resolved.declaring) else { return };
    let matched = wanted(index, declaring, &resolved.receiver, method);
    let allowed = || mocking(context, node) || exception_testing(context, node);
    if matched {
        if let Some(place) = dropped(node) {
            if (place.id() == node.id() || function_returns_void(context, place) == Some(true)) && !allowed() {
                context.report(NAME, node, at, SUMMARY);
                return;
            }
        }
    }
    if nested(context, node, at, &resolved) {
        return;
    }
    let lambda = parent(node).filter(|holder| holder.kind() == "lambda_expression" && holder.child_by_field_name("body").is_some_and(|body| body.id() == node.id()));
    if matched && lambda.is_some_and(|lambda| object_lambda(context, lambda)) && !allowed() {
        context.report(NAME, node, at, SUMMARY);
    }
}

fn reference(context: &Context, node: Node) {
    let parts = children(node);
    let (Some(qualifier), Some(last)) = (parts.first().copied(), parts.last().copied()) else { return };
    if last.kind() == "new" {
        return;
    }
    let index = context.resolver.index;
    let Some((target, result)) = function_result(context, node) else { return };
    let void = result == Type::Primitive("void");
    let object = matches!(&result, Type::Class(name, _) if name == OBJECT) || result == Type::Wildcard;
    if (!void && !object) || throwing_type(context, &target.name()) || (object && exempt(context, &target.name())) {
        return;
    }
    let Some((_, function)) = index.functional_method(&target.name()) else { return };
    let candidates = referenced(context, qualifier, context.text(last), function.parameters.len());
    let owner = context.resolver.type_of(qualifier).unwrap_or(Type::Null);
    let verdict = |(class, method): &(&ClassInfo, &Method)| wanted(index, class, &owner, method);
    if !candidates.is_empty() && candidates.iter().all(verdict) {
        context.report(NAME, node, node.start_byte(), SUMMARY);
    }
}

fn returned(context: &Context, node: Node) {
    let Some(value) = named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")) else { return };
    let around = std::iter::successors(parent(node), |at| parent(*at))
        .find(|at| matches!(at.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "lambda_expression"));
    let Some(around) = around else { return };
    let declared = match around.kind() {
        "lambda_expression" => "Object".to_string(),
        "method_declaration" => {
            let plain = around.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind));
            if !plain.is_some_and(|kind| matches!(&kind, Type::Class(name, _) if name == OBJECT)) {
                return;
            }
            OBJECT.to_string()
        }
        _ => return,
    };
    let index = context.resolver.index;
    let Some(result) = context.resolver.type_of(value).filter(|result| is_future(index, result)) else { return };
    let fits = match around.kind() {
        "lambda_expression" => object_lambda(context, around),
        _ => enclosing_type(context.file, context.resolver.scope, around).is_some_and(|class| !exempt(context, &class)),
    };
    if fits {
        let message = format!("Returning {} from method that returns {declared}. Errors from the returned future may be ignored.", printed(&result));
        context.report(NAME, node, node.start_byte(), &message);
    }
}

pub fn future_return_value_ignored(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => call(context, node),
        "method_reference" => reference(context, node),
        "return_statement" => returned(context, node),
        _ => {}
    }
}
