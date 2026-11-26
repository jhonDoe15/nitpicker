//! `constant-resolution.mts`, `security-values.mts` and the node views of the ESLint plugin, on the ESTree view.
use super::Env;
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::{Node, Value};

const TYPE_WRAPPERS: [&str; 5] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "ChainExpression"];
const MAX_RESOLVE_DEPTH: usize = 8;

pub fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

/// `unwrapped` of `security-values.mts`.
pub fn unwrapped(mut node: Node) -> Node {
    while TYPE_WRAPPERS.contains(&node.kind()) {
        match node.node("expression") {
            Some(inner) => node = inner,
            None => break,
        }
    }
    node
}

fn unwrap_types(mut node: Node) -> Node {
    while matches!(node.kind(), "TSAsExpression" | "TSSatisfiesExpression" | "TSNonNullExpression" | "TSTypeAssertion") {
        match node.node("expression") {
            Some(inner) => node = inner,
            None => break,
        }
    }
    node
}

pub fn is_function_node(node: Node) -> bool {
    matches!(node.kind(), "ArrowFunctionExpression" | "FunctionExpression" | "FunctionDeclaration")
}

pub fn is_call(node: Node) -> bool {
    matches!(node.kind(), "CallExpression" | "NewExpression")
}

pub fn string_value(node: Option<Node>) -> Option<String> {
    let node = node?;
    if node.is("Literal") {
        return node.text("value").map(|text| text.into_owned());
    }
    if node.is("TemplateLiteral") && node.nodes("expressions").is_empty() {
        let quasi = node.nodes("quasis").into_iter().next()?;
        return match quasi.get("value") {
            Value::Node(index) => node.view.at(index).text("cooked").map(|text| text.into_owned()),
            _ => None,
        };
    }
    None
}

/// `memberName` of `security-values.mts`.
pub fn member_name(member: Node) -> Option<String> {
    let property = member.node("property");
    if !member.flag("computed") {
        return property.filter(|property| property.is("Identifier")).and_then(|property| name_of(Some(property)));
    }
    string_value(property)
}

fn literal_text(node: Node) -> Option<String> {
    if let Some(text) = string_value(Some(node)) {
        return Some(text);
    }
    match node.get("value") {
        Value::Number(number) if number.fract() == 0.0 && number.abs() < 1e21 => Some(format!("{}", number as i128)),
        Value::Number(number) => Some(number.to_string()),
        Value::Bool(flag) => Some(flag.to_string()),
        Value::Null if !node.has("regex") && !node.has("bigint") => Some("null".to_string()),
        _ => None,
    }
}

/// `staticKey` of `security-values.mts`.
pub fn static_key(property: Node) -> Option<String> {
    if !property.is("Property") && !property.is("PropertyDefinition") {
        return None;
    }
    let key = property.node("key")?;
    if !property.flag("computed") && key.is("Identifier") {
        return name_of(Some(key));
    }
    string_value(Some(key)).or_else(|| if key.is("Literal") { literal_text(key) } else { None })
}

/// `resolveConstant`: follows `const` identifiers to their initializers, looking through type assertions.
pub fn resolve_constant<'a, 'v>(env: &Env<'a, 'v>, node: Option<Node<'v>>) -> Option<Node<'v>> {
    let mut chain = vec![unwrap_types(node?)];
    let mut index = 0;
    while index < chain.len() {
        if let Some(next) = constant_initializer(env, chain[index], index) {
            chain.push(unwrap_types(next));
        }
        index += 1;
    }
    chain.last().copied()
}

fn constant_initializer<'a, 'v>(env: &Env<'a, 'v>, node: Node<'v>, depth: usize) -> Option<Node<'v>> {
    if !node.is("Identifier") || depth > MAX_RESOLVE_DEPTH {
        return None;
    }
    let definitions = env.scopes.defs(env.scopes.variable_named(node)?);
    let [definition] = definitions.as_slice() else { return None };
    let declaration = definition.node.parent()?;
    let constant = definition.kind == DefKind::Variable
        && declaration.text("kind").as_deref() == Some("const")
        && definition.node.node("id").is_some_and(|id| id.is("Identifier"));
    if constant { definition.node.node("init") } else { None }
}

/// `resolveFunction`: the function an identifier names, declared once as a function or a `const` function.
pub fn resolve_function<'a, 'v>(env: &Env<'a, 'v>, node: Option<Node<'v>>) -> Option<Node<'v>> {
    let node = node.filter(|node| node.is("Identifier"))?;
    let definitions = env.scopes.defs(env.scopes.variable_named(node)?);
    let [definition] = definitions.as_slice() else { return None };
    match definition.kind {
        DefKind::FunctionName => Some(definition.node),
        DefKind::Variable if definition.node.parent()?.text("kind").as_deref() == Some("const") => {
            definition.node.node("init").filter(|init| is_function_node(*init))
        }
        _ => None,
    }
}
