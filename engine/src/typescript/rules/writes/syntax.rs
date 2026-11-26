//! The syntax helpers the write and retry rules share: unwrapping, string values, member and property names,
//! constant initializers.
use crate::typescript::rules::signatures::unwrap;
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};

const TYPE_WRAPPERS: &[&str] = &["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "ChainExpression"];

/// `unwrapped`: the expression under type assertions and optional chains.
pub fn unwrapped(node: Node) -> Node {
    unwrap(node, TYPE_WRAPPERS)
}

/// `stringValue`: a string literal or a template without placeholders.
pub fn string_value(node: Option<Node>) -> Option<String> {
    let node = node?;
    if node.is("Literal") {
        return match node.get("value") {
            Value::Text(..) => node.text("value").map(|text| text.into_owned()),
            _ => None,
        };
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

/// `nameOf`: the `name` of an identifier-like node.
pub fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.text("name")).map(|name| name.into_owned())
}

/// `memberName`: a plain property name, or the string a computed key holds.
pub fn member_name(member: Node) -> Option<String> {
    let property = member.node("property")?;
    if member.flag("computed") {
        return string_value(Some(property));
    }
    property.is("Identifier").then(|| name_of(Some(property))).flatten()
}

/// `staticKey`: the key of a property or class field when it is known without running the code.
pub fn static_key(property: Node) -> Option<String> {
    if !property.is("Property") && !property.is("PropertyDefinition") {
        return None;
    }
    let key = property.node("key")?;
    if !property.flag("computed") && key.is("Identifier") {
        return name_of(Some(key));
    }
    if let Some(text) = string_value(Some(key)) {
        return Some(text);
    }
    if !key.is("Literal") {
        return None;
    }
    match key.get("value") {
        Value::Number(number) => Some(js_number(number)),
        Value::Bool(flag) => Some(flag.to_string()),
        _ if key.get("bigint") != Value::Null => key.text("bigint").map(|text| text.into_owned()),
        _ if key.get("regex") != Value::Null => key.text("raw").map(|raw| raw.into_owned()),
        _ => Some("null".to_string()),
    }
}

fn js_number(number: f64) -> String {
    if number.fract() == 0.0 && number.abs() < 1e21 { format!("{}", number as i64) } else { number.to_string() }
}

/// `constantInitializer`: the initializer of the `const` the identifier names (its first definition).
pub fn constant_initializer<'v>(scopes: &Scopes<'_, 'v>, identifier: Node<'v>) -> Option<Node<'v>> {
    let name = identifier.name()?;
    let variable = scopes.variable_by_name(&name, identifier.start())?;
    let definition = scopes.defs(variable).into_iter().next()?;
    let declaration = definition.node.parent()?;
    let constant = definition.kind == DefKind::Variable && declaration.text("kind").as_deref() == Some("const");
    if constant { definition.node.node("init") } else { None }
}
