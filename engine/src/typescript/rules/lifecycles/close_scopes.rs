use crate::typescript::rules::support::scope::{DefKind, ScopeKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};
use oxc_semantic::SymbolId;

const CLOSE_NAMES: [&str; 11] = [
    "close", "dispose", "destroy", "shutdown", "stop", "teardown", "disconnect", "end", "onModuleDestroy", "onApplicationShutdown",
    "beforeApplicationShutdown",
];

pub fn is_function(node: Node) -> bool {
    matches!(node.kind(), "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression")
}

pub fn unwrap_expression(mut node: Node) -> Node {
    while matches!(node.kind(), "TSAsExpression" | "TSSatisfiesExpression" | "TSNonNullExpression" | "ChainExpression") {
        match node.node("expression") {
            Some(inner) => node = inner,
            None => break,
        }
    }
    node
}

pub fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

pub fn literal_string(node: Node) -> Option<String> {
    if !node.is("Literal") {
        return None;
    }
    match node.get("value") {
        value @ Value::Text(..) => node.view.text(value).map(|text| text.into_owned()),
        _ => None,
    }
}

fn key_name(key: Node, computed: bool) -> Option<String> {
    if key.is("Identifier") && !computed {
        return name_of(Some(key));
    }
    if let Some(text) = literal_string(key) {
        return Some(text);
    }
    if key.is("MemberExpression") && name_of(key.node("object")).as_deref() == Some("Symbol") {
        return matches!(name_of(key.node("property")).as_deref(), Some("dispose" | "asyncDispose")).then(|| "dispose".to_string());
    }
    None
}

pub fn function_name(function: Node) -> Option<String> {
    if let Some(id) = function.node("id") {
        return name_of(Some(id));
    }
    let parent = function.parent()?;
    match parent.kind() {
        "MethodDefinition" | "Property" | "PropertyDefinition" => {
            (parent.node("value") == Some(function)).then(|| parent.node("key").and_then(|key| key_name(key, parent.flag("computed")))).flatten()
        }
        "VariableDeclarator" if parent.node("init") == Some(function) => name_of(parent.node("id")),
        "AssignmentExpression" if parent.node("right") == Some(function) => {
            let left = parent.node("left")?;
            name_of(Some(left)).or_else(|| left.is("MemberExpression").then(|| name_of(left.node("property"))).flatten())
        }
        _ => None,
    }
}

pub fn is_close_name(name: Option<&str>) -> bool {
    name.is_some_and(|name| CLOSE_NAMES.contains(&name))
}

pub fn long_lived_variable(scopes: &Scopes, at: Node) -> Option<SymbolId> {
    let variable = scopes.variable_named(at)?;
    let declared = scopes.defs(variable).iter().all(|definition| definition.kind == DefKind::Variable);
    let long = matches!(scopes.scope_of(variable)?.0, ScopeKind::Function | ScopeKind::Module | ScopeKind::Global);
    (declared && long).then_some(variable)
}

fn container_of(function: Node) -> Option<Node> {
    let parent = function.parent()?;
    if matches!(parent.kind(), "MethodDefinition" | "PropertyDefinition") {
        return parent.parent();
    }
    function.ancestors().find(|ancestor| is_function(*ancestor) || matches!(ancestor.kind(), "ClassBody" | "Program"))
}

fn walk<'v>(root: Node<'v>, found: &mut Vec<Node<'v>>) {
    found.push(root);
    let children = if root.is("Program") { root.nodes("body") } else { root.children() };
    for child in children {
        walk(child, found);
    }
}

pub fn closers_of(container: Node) -> Vec<Node> {
    let mut all = Vec::new();
    walk(container, &mut all);
    all.into_iter().filter(|node| is_function(*node) && is_close_name(function_name(*node).as_deref()) && container_of(*node) == Some(container)).collect()
}

pub fn root_identifier(expression: Node) -> Option<Node> {
    let mut current = unwrap_expression(expression);
    loop {
        let inner = unwrap_expression(current);
        match inner.is("MemberExpression").then(|| inner.node("object")).flatten() {
            Some(object) => current = object,
            None => break,
        }
    }
    Some(unwrap_expression(current)).filter(|node| node.is("Identifier"))
}

pub fn root_name(expression: Option<Node>) -> Option<String> {
    name_of(expression.and_then(root_identifier))
}
