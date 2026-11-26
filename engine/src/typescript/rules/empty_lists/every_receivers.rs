//! The syntax questions of `no-empty-every-signal`: which receivers are lists a caller may leave empty, and whether
//! the function already checks the list for items.
use crate::typescript::rules::signatures::{Scope, is_function, name_of};
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::Node;

const GUARD_CALLS: [&str; 4] = ["some", "find", "findIndex", "at"];
const GUARD_FUNCTIONS: [&str; 5] = ["isNonEmpty", "isEmpty", "nonEmpty", "hasItems", "hasAny"];

fn is_filter_call(node: Node) -> bool {
    node.is("CallExpression")
        && node.node("callee").is_some_and(|callee| callee.is("MemberExpression") && name_of(callee.node("property")).as_deref() == Some("filter"))
}

fn first_definition<'v>(scope: &Scope<'_, '_, 'v>, identifier: Node) -> Option<crate::typescript::rules::support::scope::Def<'v>> {
    let symbol = scope.scopes.variable_named(identifier)?;
    scope.scopes.defs(symbol).into_iter().next()
}

fn is_parameter(scope: &Scope, identifier: Node) -> bool {
    first_definition(scope, identifier).is_some_and(|definition| definition.kind == DefKind::Parameter)
}

fn is_filtered_variable(scope: &Scope, identifier: Node) -> bool {
    let Some(definition) = first_definition(scope, identifier).filter(|definition| definition.kind == DefKind::Variable) else { return false };
    definition.node.node("init").is_some_and(is_filter_call)
}

pub fn is_tracked_receiver(scope: &Scope, receiver: Node) -> bool {
    match receiver.kind() {
        "CallExpression" => is_filter_call(receiver),
        "Identifier" => is_parameter(scope, receiver) || is_filtered_variable(scope, receiver),
        "MemberExpression" => !receiver.flag("computed"),
        _ => false,
    }
}

fn property_name(node: Node) -> Option<String> {
    if node.flag("computed") { None } else { name_of(node.node("property")) }
}

fn is_guard(scope: &Scope, node: Node, target: &str) -> bool {
    if node.is("MemberExpression") && node.node("object").is_some_and(|object| scope.source(object) == target) {
        return property_name(node).as_deref() == Some("length") || (node.flag("computed") && node.node("property").is_some_and(|property| scope.source(property) == "0"));
    }
    if !node.is("CallExpression") {
        return false;
    }
    let Some(callee) = node.node("callee") else { return false };
    if callee.is("MemberExpression") {
        let on_target = callee.node("object").is_some_and(|object| scope.source(object) == target);
        return on_target && GUARD_CALLS.contains(&property_name(callee).unwrap_or_default().as_str());
    }
    GUARD_FUNCTIONS.contains(&name_of(Some(callee)).unwrap_or_default().as_str()) && node.nodes("arguments").into_iter().any(|argument| scope.source(argument) == target)
}

pub fn is_guarded_against_empty(scope: &Scope, call: Node, receiver: Node) -> bool {
    let target = scope.source(receiver);
    let holder = call.ancestors().find(|ancestor| is_function(*ancestor)).unwrap_or_else(|| call.view.program());
    holder.descendants().into_iter().any(|node| is_guard(scope, node, target))
}
