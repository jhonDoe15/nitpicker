//! `filter-tests.mts`: whether a filter callback compares the row's own columns, rather than testing membership in
//! a collection built from the same rows, a length or a type predicate.
use crate::typescript::rules::database::modules::root_name;
use crate::typescript::rules::queries::js_patterns::member_name;
use crate::typescript::rules::security_values::unwrapped;
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;

fn bound_names(params: &[Node]) -> Vec<String> {
    let mut names = Vec::new();
    for param in params {
        if param.is("Identifier") {
            names.extend(param.name().map(|name| name.into_owned()));
        } else if param.is("ObjectPattern") {
            for property in param.nodes("properties").into_iter().filter(|property| property.is("Property")) {
                names.extend(property.node("value").filter(|value| value.is("Identifier")).and_then(|value| value.name()).map(|name| name.into_owned()));
            }
        }
    }
    names
}

fn first_definition<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, name: &str) -> Option<Node<'s>> {
    let variable = scopes.variable_by_name(name, node.start())?;
    let mut definitions = scopes.defs(variable);
    definitions.sort_by_key(|definition| (definition.kind != DefKind::Parameter, definition.name.start()));
    definitions.into_iter().next().map(|definition| definition.node)
}

fn is_derived_from(scopes: &Scopes, collection: Node, source: Option<&str>) -> bool {
    let (Some(source), Some(name)) = (source, root_name(collection)) else { return false };
    if name == source {
        return true;
    }
    let definition = first_definition(scopes, collection, &name);
    let init = definition.filter(|definition| definition.is("VariableDeclarator")).and_then(|definition| definition.node("init"));
    init.is_some_and(|init| init.descendants().into_iter().any(|node| node.is("Identifier") && node.name().as_deref() == Some(source)))
}

fn is_closure_membership(scopes: &Scopes, node: Node, rows: &[String], source: Option<&str>) -> bool {
    let Some(callee) = node.node("callee").filter(|_| node.is("CallExpression")).map(unwrapped).filter(|callee| callee.is("MemberExpression")) else { return false };
    let Some(object) = callee.node("object") else { return false };
    let method = member_name(callee);
    let root = root_name(object).unwrap_or_default();
    let membership = matches!(method.as_deref(), Some("has" | "includes"));
    membership && !rows.contains(&root) && is_derived_from(scopes, object, source)
}

fn is_length_read(node: Node) -> bool {
    node.is("MemberExpression") && member_name(node).as_deref() == Some("length")
}

/// `isColumnComparison`.
pub fn is_column_comparison(scopes: &Scopes, callback: Option<Node>, receiver: Node) -> bool {
    let Some(function) = callback.map(unwrapped).filter(|function| function.is("ArrowFunctionExpression") || function.is("FunctionExpression")) else { return true };
    let predicate = function.node("returnType").and_then(|annotation| annotation.node("typeAnnotation")).is_some_and(|annotation| annotation.is("TSTypePredicate"));
    if predicate {
        return false;
    }
    let rows = bound_names(&function.nodes("params"));
    let source = root_name(receiver);
    let Some(body) = function.node("body") else { return true };
    !body.descendants().into_iter().any(|node| is_length_read(node) || is_closure_membership(scopes, node, &rows, source.as_deref()))
}
