//! The source forms that list some members of a union: `===` comparisons, `includes` on a literal list,
//! `has` on a new `Set` of literals, and a `switch` that returns a boolean.
use crate::typescript::rules::signatures::unwrap;
use crate::typescript::rules::support::view::{Node, Value};

pub use crate::typescript::rules::typed::unions::Literal;

const MINIMUM_ELEMENTS: usize = 2;
const TYPE_ASSERTIONS: &[&str] = &["TSAsExpression", "TSSatisfiesExpression", "TSTypeAssertion"];

pub struct Comparison<'v> {
    pub subject: Node<'v>,
    pub value: Literal,
}

pub fn literal_value(node: Node) -> Option<Literal> {
    if !node.is("Literal") {
        return None;
    }
    match node.get("value") {
        Value::Text(..) => node.text("value").map(|text| Literal::Text(text.into_owned())),
        Value::Number(number) => Some(Literal::Number(number)),
        _ => None,
    }
}

pub fn is_plain_reference(node: Node) -> bool {
    let mut current = node;
    while current.is("MemberExpression") {
        if current.flag("computed") && !current.node("property").is_some_and(|property| literal_value(property).is_some()) {
            return false;
        }
        let Some(object) = current.node("object") else { return false };
        current = object;
    }
    current.is("Identifier") || current.is("ThisExpression")
}

fn literal_elements(node: Node) -> Option<Vec<Literal>> {
    let list = unwrap(node, TYPE_ASSERTIONS);
    let elements = list.list("elements");
    if !list.is("ArrayExpression") || elements.len() < MINIMUM_ELEMENTS {
        return None;
    }
    elements.into_iter().map(|element| element.and_then(literal_value)).collect()
}

fn is_new_set(node: Node) -> bool {
    node.is("NewExpression") && node.node("callee").is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("Set")) && node.nodes("arguments").len() == 1
}

fn listed_elements(callee: Node) -> Option<Vec<Literal>> {
    let receiver = unwrap(callee.node("object")?, TYPE_ASSERTIONS);
    let method = callee.node("property")?.name()?;
    if method == "includes" {
        return literal_elements(receiver);
    }
    if method != "has" || !is_new_set(receiver) {
        return None;
    }
    literal_elements(*receiver.nodes("arguments").first()?)
}

pub fn membership_comparisons(node: Node) -> Option<Vec<Comparison>> {
    if !node.is("CallExpression") || node.flag("optional") {
        return None;
    }
    let arguments = node.nodes("arguments");
    let [subject] = arguments.as_slice() else { return None };
    let callee = node.node("callee").filter(|callee| callee.is("MemberExpression") && !callee.flag("computed"))?;
    if !is_plain_reference(*subject) {
        return None;
    }
    let elements = listed_elements(callee)?;
    Some(elements.into_iter().map(|value| Comparison { subject: *subject, value }).collect())
}

#[derive(Clone, Copy, PartialEq)]
enum Returned {
    Bool(bool),
    FallsThrough,
    Other,
}

fn returned_boolean(statements: &[Node]) -> Returned {
    let body = match statements {
        [only] if only.is("BlockStatement") => only.nodes("body"),
        _ => statements.to_vec(),
    };
    match body.as_slice() {
        [] => Returned::FallsThrough,
        [only] if only.is("ReturnStatement") => match only.node("argument").filter(|argument| argument.is("Literal")).map(|argument| argument.get("value")) {
            Some(Value::Bool(value)) => Returned::Bool(value),
            _ => Returned::Other,
        },
        _ => Returned::Other,
    }
}

fn effective_values(values: &[Returned]) -> Vec<Returned> {
    (0..values.len()).map(|index| if values[index] == Returned::FallsThrough { values[index..].iter().copied().find(|later| *later != Returned::FallsThrough).unwrap_or(Returned::Other) } else { values[index] }).collect()
}

pub fn switch_comparisons(node: Node) -> Option<Vec<Comparison>> {
    let cases = node.nodes("cases");
    let own: Vec<Returned> = cases.iter().map(|entry| returned_boolean(&entry.nodes("consequent"))).collect();
    let values = effective_values(&own);
    let default_index = cases.iter().position(|entry| entry.node("test").is_none());
    let discriminant = node.node("discriminant")?;
    let Some(Returned::Bool(fallback)) = default_index.map(|index| own[index]) else { return None };
    if !is_plain_reference(discriminant) {
        return None;
    }
    let fallback = Returned::Bool(fallback);
    let listed: Vec<Node> = cases.iter().enumerate().filter(|(index, entry)| entry.node("test").is_some() && values[*index] != fallback).map(|(_, entry)| *entry).collect();
    let literals: Vec<Comparison> = listed.iter().filter_map(|entry| entry.node("test").and_then(literal_value)).map(|value| Comparison { subject: discriminant, value }).collect();
    let is_partial = listed.len() >= MINIMUM_ELEMENTS
        && values.iter().all(|value| matches!(value, Returned::Bool(_)))
        && own.iter().enumerate().all(|(index, value)| Some(index) == default_index || *value == Returned::FallsThrough || *value != fallback)
        && literals.len() == listed.len();
    is_partial.then_some(literals)
}

