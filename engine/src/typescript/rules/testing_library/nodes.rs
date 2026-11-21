//! The node helpers of eslint-plugin-testing-library 7.16.2 (`src/node-utils`), on the ESTree-shaped view.
use crate::typescript::rules::support::view::{Node, Value};

const VALID_LEFT_HAND_SIDES: [&str; 23] = [
    "CallExpression", "ClassExpression", "ClassDeclaration", "FunctionExpression", "Literal", "TemplateLiteral", "MemberExpression",
    "ArrayExpression", "ArrayPattern", "Identifier", "JSXElement", "JSXFragment", "JSXOpeningElement", "MetaProperty", "ObjectExpression",
    "ObjectPattern", "Super", "ThisExpression", "TSNullKeyword", "TaggedTemplateExpression", "TSNonNullExpression", "TSAsExpression",
    "ArrowFunctionExpression",
];

pub fn name(node: Node) -> String {
    node.name().map(|name| name.into_owned()).unwrap_or_default()
}

pub fn identifier(node: Option<Node>) -> Option<Node> {
    node.filter(|node| node.is("Identifier"))
}

pub fn identifier_name(node: Option<Node>) -> Option<String> {
    identifier(node).map(name)
}

pub fn is_named(node: Option<Node>, wanted: &str) -> bool {
    identifier(node).is_some_and(|node| node.name().as_deref() == Some(wanted))
}

pub fn is_kind(node: Option<Node>, kind: &str) -> bool {
    node.is_some_and(|node| node.is(kind))
}

pub fn is_function(node: Node) -> bool {
    matches!(node.kind(), "ArrowFunctionExpression" | "FunctionExpression" | "FunctionDeclaration")
}

pub fn string_literal(node: Option<Node>) -> Option<String> {
    node.filter(|node| node.is("Literal")).and_then(|node| node.text("value")).map(|value| value.into_owned())
}

fn quasi(node: Node, field: &str) -> Option<String> {
    let quasis = node.nodes("quasis");
    let [only] = quasis.as_slice() else { return None };
    match only.get("value") {
        Value::Node(index) => node.view.at(index).text(field).map(|text| text.into_owned()),
        _ => None,
    }
}

/// `isStringNode` with `getStringValue`: a string literal, or a template literal of one piece (its raw text).
pub fn string_node(node: Option<Node>) -> Option<String> {
    let node = node?;
    if node.is("TemplateLiteral") { quasi(node, "raw") } else { string_literal(Some(node)) }
}

/// `isSupportedAccessor` with `getAccessorValue`.
pub fn accessor(node: Option<Node>) -> Option<String> {
    identifier_name(node).or_else(|| string_node(node))
}

fn constant_text(node: Node) -> Option<String> {
    match node.kind() {
        "Literal" => string_literal(Some(node)).or_else(|| node.text("raw").map(|raw| raw.into_owned())),
        "TemplateLiteral" => quasi(node, "cooked"),
        _ => None,
    }
}

/// `getPropertyName` of eslint-utils without a scope, for a member expression, property, method or class field.
pub fn property_name(node: Node) -> Option<String> {
    let key = node.node(if node.is("MemberExpression") { "property" } else { "key" })?;
    if node.flag("computed") {
        return constant_text(key);
    }
    match key.kind() {
        "Literal" => constant_text(key),
        "PrivateIdentifier" => None,
        _ => key.name().map(|name| name.into_owned()),
    }
}

pub fn closest_call(node: Node, restricted: bool) -> Option<Node> {
    let mut current = node;
    loop {
        if current.is("CallExpression") {
            return Some(current);
        }
        let parent = current.parent()?;
        if restricted && !VALID_LEFT_HAND_SIDES.contains(&parent.kind()) {
            return None;
        }
        current = parent;
    }
}

pub fn closest_of<'v>(node: Node<'v>, wanted: fn(Node) -> bool) -> Option<Node<'v>> {
    std::iter::once(node).chain(node.ancestors()).find(|candidate| wanted(*candidate))
}

pub fn closest_declarator(node: Node) -> Option<Node> {
    closest_of(node, |candidate| candidate.is("VariableDeclarator"))
}

pub fn closest_function(node: Node) -> Option<Node> {
    closest_of(node, is_function)
}

/// `findClosestCallNode`: the root of the tree never counts.
pub fn closest_call_named<'v>(node: Node<'v>, wanted: &str) -> Option<Node<'v>> {
    let mut current = node;
    loop {
        let parent = current.parent()?;
        if current.is("CallExpression") && is_named(current.node("callee"), wanted) {
            return Some(current);
        }
        current = parent;
    }
}

pub fn property_identifier(node: Option<Node>) -> Option<Node> {
    let node = node?;
    match node.kind() {
        "Identifier" => Some(node),
        "MemberExpression" => property_identifier(node.node("object")),
        "CallExpression" => property_identifier(node.node("callee")),
        "ExpressionStatement" | "ChainExpression" => property_identifier(node.node("expression")),
        "AwaitExpression" => property_identifier(node.node("argument")),
        _ => None,
    }
}

pub fn deepest_identifier(node: Option<Node>) -> Option<Node> {
    let node = node?;
    match node.kind() {
        "Identifier" => Some(node),
        "ChainExpression" => deepest_identifier(node.node("expression")),
        "MemberExpression" => identifier(node.node("property")),
        "CallExpression" => deepest_identifier(node.node("callee")),
        "AwaitExpression" => deepest_identifier(node.node("argument")),
        _ => None,
    }
}

pub fn reference_node(node: Node) -> Node {
    let mut current = node;
    while let Some(parent) = current.parent().filter(|parent| matches!(parent.kind(), "MemberExpression" | "CallExpression")) {
        current = parent;
    }
    current
}

pub fn import_module_name(node: Node) -> Option<String> {
    match node.kind() {
        "ImportDeclaration" => string_literal(node.node("source")),
        "CallExpression" => string_literal(node.nodes("arguments").first().copied()),
        _ => None,
    }
}

fn call_from(node: Option<Node>) -> Option<Node> {
    let node = node?;
    match node.kind() {
        "CallExpression" => Some(node),
        "ChainExpression" => call_from(node.node("expression")),
        "AwaitExpression" => call_from(node.node("argument")),
        "AssignmentExpression" => call_from(node.node("right")),
        _ => None,
    }
}

pub fn statement_call(statement: Node) -> Option<Node> {
    match statement.kind() {
        "ExpressionStatement" => call_from(statement.node("expression")),
        "ReturnStatement" => call_from(statement.node("argument")),
        "VariableDeclaration" => call_from(statement.nodes("declarations").first().and_then(|declaration| declaration.node("init"))),
        _ => None,
    }
}

pub fn is_empty_function(node: Node) -> bool {
    is_function(node) && node.node("body").is_some_and(|body| body.is("BlockStatement") && body.nodes("body").is_empty())
}

fn collect_bindings<'v>(pattern: Option<Node<'v>>, found: &mut Vec<Node<'v>>) {
    let Some(pattern) = pattern else { return };
    match pattern.kind() {
        "Identifier" => found.push(pattern),
        "ObjectPattern" => pattern.nodes("properties").into_iter().for_each(|property| collect_bindings(Some(property), found)),
        "Property" => collect_bindings(pattern.node("value"), found),
        "ArrayPattern" => pattern.nodes("elements").into_iter().for_each(|element| collect_bindings(Some(element), found)),
        "RestElement" => collect_bindings(pattern.node("argument"), found),
        "AssignmentPattern" => collect_bindings(pattern.node("left"), found),
        _ => {}
    }
}

/// The identifiers a declarator's pattern binds, in source order.
pub fn bindings(declarator: Node) -> Vec<Node> {
    let mut found = Vec::new();
    collect_bindings(declarator.node("id"), &mut found);
    found
}
