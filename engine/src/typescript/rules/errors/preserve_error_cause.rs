use super::caught_variables::{declared, reference_ranges, references_catch};
use super::wrapper_options::{Wrapper, argument, matching_wrapper, wrappers};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;

const RULE: &str = "preserve-error-cause";
const EXCEPTION_ROUTE: &str = " An exception fits only when the original failure is deliberately dropped.";
const LOST_CAUSE: &str = "Preserve the original cause when wrapping a caught failure: `new AppError(message, { cause: error })`.";
const BINDING_LESS: &str = "This catch has no binding, so the new failure loses the original cause. Bind it and pass it on: `catch (error) { throw new AppError(message, { cause: error }); }`.";

fn key_is_cause(key: Node) -> bool {
    match key.name() {
        Some(name) => name == "cause",
        None => key.is("Literal") && key.text("value").as_deref() == Some("cause"),
    }
}

fn has_cause_property(options: Option<Node>, caught: &[(u32, u32)]) -> bool {
    let Some(options) = options.filter(|options| options.is("ObjectExpression")) else { return false };
    options.nodes("properties").into_iter().any(|property| {
        property.is("Property")
            && property.node("key").is_some_and(key_is_cause)
            && property.node("value").is_some_and(|value| references_catch(caught, value))
    })
}

fn is_caught_value(argument: Node, caught: &[(u32, u32)]) -> bool {
    let values = if argument.is("ArrayExpression") { argument.list("elements") } else { vec![Some(argument)] };
    values.into_iter().flatten().any(|value| value.is("Identifier") && references_catch(caught, value))
}

fn preserves_cause(wrapper: &Wrapper, node: Node, caught: &[(u32, u32)]) -> bool {
    if let Some(position) = wrapper.options_index {
        return has_cause_property(argument(node, position), caught);
    }
    node.nodes("arguments").into_iter().any(|argument| has_cause_property(Some(argument), caught) || is_caught_value(argument, caught))
}

fn is_promise_reject(call: Node) -> bool {
    let Some(callee) = call.node("callee").filter(|callee| call.is("CallExpression") && callee.is("MemberExpression")) else { return false };
    let object = callee.node("object");
    !callee.flag("computed")
        && object.is_some_and(|object| object.is("Identifier") && object.name().as_deref() == Some("Promise"))
        && callee.node("property").and_then(|property| property.name()).as_deref() == Some("reject")
}

fn is_thrown_local(scopes: &Scopes, declarator: Node) -> bool {
    let Some(id) = declarator.node("id") else { return false };
    declared(scopes, id, declarator).into_iter().any(|symbol| {
        scopes.references(symbol).iter().any(|reference| reference.identifier.parent().is_some_and(|parent| parent.is("ThrowStatement")))
    })
}

fn is_thrown(scopes: &Scopes, node: Node) -> bool {
    let Some(parent) = node.parent() else { return false };
    if parent.is("ThrowStatement") {
        return true;
    }
    if is_promise_reject(parent) {
        return argument(parent, 0) == Some(node);
    }
    parent.is("VariableDeclarator") && parent.node("init") == Some(node) && is_thrown_local(scopes, parent)
}

fn cause_report(scopes: &Scopes, wrapper: &Wrapper, node: Node, handler: Node) -> Option<String> {
    let param = handler.node("param");
    let bound = param.map(|param| declared(scopes, param, handler)).unwrap_or_default();
    let caught = reference_ranges(scopes, &bound);
    let thrown = is_thrown(scopes, node);
    if thrown && param.is_none() {
        return Some(format!("{BINDING_LESS}{EXCEPTION_ROUTE}"));
    }
    let wraps_caught = wrapper.classification_index.is_some() || thrown || references_catch(&caught, node);
    (wraps_caught && !preserves_cause(wrapper, node, &caught)).then(|| format!("{LOST_CAUSE}{EXCEPTION_ROUTE}"))
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let configured = wrappers(context);
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("NewExpression")) {
        let Some(wrapper) = matching_wrapper(&configured, node) else { continue };
        let Some(handler) = node.ancestors().find(|ancestor| ancestor.is("CatchClause")) else { continue };
        if let Some(message) = cause_report(scopes, &wrapper, node, handler) {
            found.push((node.start(), node.end(), message));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
