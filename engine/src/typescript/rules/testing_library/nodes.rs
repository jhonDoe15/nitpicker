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

pub fn property_identifier(mut node: Option<Node>) -> Option<Node> {
    while let Some(current) = node {
        match current.kind() {
            "Identifier" => return Some(current),
            "MemberExpression" => node = current.node("object"),
            "CallExpression" => node = current.node("callee"),
            "ExpressionStatement" | "ChainExpression" => node = current.node("expression"),
            "AwaitExpression" => node = current.node("argument"),
            _ => return None,
        }
    }
    None
}

pub fn deepest_identifier(mut node: Option<Node>) -> Option<Node> {
    while let Some(current) = node {
        match current.kind() {
            "Identifier" => return Some(current),
            "ChainExpression" => node = current.node("expression"),
            "MemberExpression" => return identifier(current.node("property")),
            "CallExpression" => node = current.node("callee"),
            "AwaitExpression" => node = current.node("argument"),
            _ => return None,
        }
    }
    None
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

fn call_from(mut node: Option<Node>) -> Option<Node> {
    while let Some(current) = node {
        match current.kind() {
            "CallExpression" => return Some(current),
            "ChainExpression" => node = current.node("expression"),
            "AwaitExpression" => node = current.node("argument"),
            "AssignmentExpression" => node = current.node("right"),
            _ => return None,
        }
    }
    None
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
    let mut stack: Vec<Node<'v>> = pattern.into_iter().collect();
    while let Some(current) = stack.pop() {
        match current.kind() {
            "Identifier" => found.push(current),
            "ObjectPattern" => stack.extend(current.nodes("properties").into_iter().rev()),
            "Property" => stack.extend(current.node("value")),
            "ArrayPattern" => stack.extend(current.nodes("elements").into_iter().rev()),
            "RestElement" => stack.extend(current.node("argument")),
            "AssignmentPattern" => stack.extend(current.node("left")),
            _ => {}
        }
    }
}

/// The identifiers a declarator's pattern binds, in source order.
pub fn bindings(declarator: Node) -> Vec<Node> {
    let mut found = Vec::new();
    collect_bindings(declarator.node("id"), &mut found);
    found
}
