//! `isMemberDefinition`: a top-level statement that only fills in a function, class or object defined in this file.
use crate::typescript::rules::support::scope::{DefKind, ScopeKind, Scopes};
use crate::typescript::rules::support::view::Node;

const DESCRIPTOR_CALLS: [&str; 3] = ["assign", "defineProperty", "defineProperties"];

fn last_of<'v>(start: Node<'v>, next: impl Fn(Node<'v>) -> Option<Node<'v>>) -> Node<'v> {
    let mut current = start;
    while let Some(following) = next(current) {
        current = following;
    }
    current
}

fn is_static_chain(node: Node) -> bool {
    last_of(node, |current| if current.is("MemberExpression") && !current.flag("computed") { current.node("object") } else { None }).is("Identifier")
}

fn is_plain_key(property: Node) -> bool {
    let key = if property.is("Property") { property.node("key") } else { property.node("property") };
    !property.flag("computed") || key.is_some_and(|key| key.is("Literal") || key.is("Identifier") || is_static_chain(key))
}

fn member_root(node: Node) -> Option<Node> {
    let end = last_of(node, |current| if current.is("MemberExpression") && is_plain_key(current) { current.node("object") } else { None });
    end.is("Identifier").then_some(end)
}

fn assignment_chain(node: Node) -> Vec<Node> {
    let mut chain = vec![node];
    while let Some(last) = chain.last().copied().filter(|last| last.is("AssignmentExpression")).and_then(|last| last.node("right")) {
        chain.push(last);
    }
    chain
}

fn is_fresh_object(init: Node) -> bool {
    let value = *assignment_chain(init).last().unwrap_or(&init);
    if !value.is("CallExpression") {
        return matches!(value.kind(), "ObjectExpression" | "FunctionExpression" | "ArrowFunctionExpression" | "ClassExpression");
    }
    let Some(callee) = value.node("callee").filter(|callee| callee.is("MemberExpression")) else { return false };
    member_root(callee).and_then(|root| root.name()).as_deref() == Some("Object")
        && callee.node("property").is_some_and(|property| property.is("Identifier") && property.name().as_deref() == Some("create"))
}

fn is_local_definition(scopes: &Scopes, identifier: Node) -> bool {
    let Some(symbol) = scopes.variable_named(identifier) else { return false };
    let top_level = scopes.scope_of(symbol).is_some_and(|(kind, block)| block.is("Program") && matches!(kind, ScopeKind::Module | ScopeKind::Global));
    let defs = scopes.defs(symbol);
    let Some(definition) = defs.first() else { return false };
    if !top_level {
        return false;
    }
    match definition.kind {
        DefKind::FunctionName | DefKind::ClassName => true,
        DefKind::Variable => definition.node.node("init").is_some_and(is_fresh_object),
        _ => false,
    }
}

fn is_local_member(scopes: &Scopes, node: Node) -> bool {
    member_root(node).is_some_and(|root| is_local_definition(scopes, root))
}

fn nested_values(node: Node) -> Vec<Node> {
    if !node.is("ObjectExpression") {
        return Vec::new();
    }
    node.nodes("properties").into_iter().filter_map(|property| if property.is("Property") { property.node("value") } else { Some(property) }).collect()
}

fn is_definition_leaf(scopes: &Scopes, value: Node) -> bool {
    if value.is("Identifier") || value.is("MemberExpression") {
        return is_local_member(scopes, value);
    }
    matches!(value.kind(), "FunctionExpression" | "ArrowFunctionExpression" | "ClassExpression" | "Literal")
}

fn is_definition_part(scopes: &Scopes, node: Node) -> bool {
    if node.is("ObjectExpression") {
        return node.nodes("properties").into_iter().all(|property| property.is("Property") && is_plain_key(property));
    }
    is_definition_leaf(scopes, node)
}

fn is_definition_value(scopes: &Scopes, value: Node) -> bool {
    let mut pending = vec![value];
    while let Some(node) = pending.pop() {
        if !is_definition_part(scopes, node) {
            return false;
        }
        pending.extend(nested_values(node));
    }
    true
}

fn is_global_object(scopes: &Scopes, node: Node) -> bool {
    node.is("Identifier") && node.name().as_deref() == Some("Object") && scopes.variable_by_name("Object", node.start()).is_none_or(|symbol| scopes.defs(symbol).is_empty())
}

fn is_descriptor_call(scopes: &Scopes, call: Node) -> bool {
    let Some(callee) = call.node("callee").filter(|callee| callee.is("MemberExpression")) else { return false };
    let arguments = call.nodes("arguments");
    let Some((target, rest)) = arguments.split_first() else { return false };
    callee.node("object").is_some_and(|object| is_global_object(scopes, object))
        && callee.node("property").is_some_and(|property| property.is("Identifier") && property.name().is_some_and(|name| DESCRIPTOR_CALLS.contains(&name.as_ref())))
        && is_local_member(scopes, *target)
        && rest.iter().all(|argument| is_definition_value(scopes, *argument))
}

fn is_member_assignment_link(scopes: &Scopes, node: Node) -> bool {
    node.is("AssignmentExpression")
        && node.text("operator").as_deref() == Some("=")
        && node.node("left").is_some_and(|left| left.is("MemberExpression") && is_local_member(scopes, left))
}

pub fn is_member_definition(scopes: &Scopes, expression: Node) -> bool {
    if expression.is("CallExpression") {
        return is_descriptor_call(scopes, expression);
    }
    let chain = assignment_chain(expression);
    let Some((value, links)) = chain.split_last() else { return false };
    !links.is_empty() && links.iter().all(|link| is_member_assignment_link(scopes, *link)) && is_definition_value(scopes, *value)
}
