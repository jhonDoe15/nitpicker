//! `sequelize-scopes.mts`: the default scope of a Sequelize model and the include it joins into every query.
use super::orm_bindings::{Orm, imported_name, imports_orm, object_of, properties_of, static_key_name};
use crate::typescript::rules::signatures::is_function;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::testing_library::nodes::string_literal;

const DEFAULT_SCOPE: &str = "defaultScope";

fn returned_values(body: Node) -> Vec<Option<Node>> {
    let mut pending = vec![body];
    let mut returned = Vec::new();
    let mut index = 0;
    while index < pending.len() {
        let node = pending[index];
        index += 1;
        if node.is("ReturnStatement") {
            returned.push(node.node("argument"));
        } else {
            pending.extend(node.children().into_iter().filter(|child| !is_function(*child)));
        }
    }
    returned
}

fn returned_objects<'s>(scopes: &Scopes<'_, 's>, scope: Option<Node<'s>>) -> Vec<Option<Node<'s>>> {
    let Some(function) = scope.filter(|scope| is_function(*scope)) else { return vec![object_of(scopes, scope)] };
    let Some(body) = function.node("body") else { return Vec::new() };
    if !body.is("BlockStatement") {
        return vec![object_of(scopes, Some(body))];
    }
    returned_values(body).into_iter().map(|value| object_of(scopes, value)).collect()
}

fn includes_associations(include: Node) -> bool {
    let Some(value) = include.node("value") else { return true };
    if value.is("Identifier") {
        return value.name().as_deref() != Some("undefined");
    }
    !value.is("ArrayExpression") || !value.list("elements").is_empty()
}

/// `eagerInclude`: the first `include` with associations in the objects a scope is or returns.
pub fn eager_include<'s>(scopes: &Scopes<'_, 's>, scope: Option<Node<'s>>) -> Option<Node<'s>> {
    returned_objects(scopes, scope).into_iter().filter_map(|object| properties_of(scopes, object).get("include")).find(|include| includes_associations(*include))
}

fn is_default_scope_call(call: Node) -> bool {
    let named = call.nodes("arguments").first().copied().filter(|name| name.is("Literal"));
    call.node("callee").is_some_and(|callee| callee.is("MemberExpression") && static_key_name(callee).as_deref() == Some("addScope"))
        && string_literal(named).as_deref() == Some(DEFAULT_SCOPE)
}

/// `defaultScopeOf`: the default scope a `defaultScope` property, `addScope('defaultScope', ...)` or a
/// `@DefaultScope(...)` decorator defines, in a file that imports Sequelize.
pub fn default_scope_of<'s>(scopes: &Scopes<'_, 's>, program: Node<'s>, node: Node<'s>) -> Option<Node<'s>> {
    if !imports_orm(program, Orm::Sequelize) {
        return None;
    }
    if node.is("Property") {
        return if static_key_name(node).as_deref() == Some(DEFAULT_SCOPE) { node.node("value") } else { None };
    }
    let arguments = call_arguments(node);
    if is_default_scope_call(node) {
        return arguments.get(1).copied().flatten();
    }
    let callee = node.node("callee")?;
    if imported_name(scopes, callee, Orm::Sequelize).as_deref() == Some("DefaultScope") { arguments.first().copied().flatten() } else { None }
}

fn call_arguments(call: Node) -> Vec<Option<Node>> {
    call.list("arguments")
}
