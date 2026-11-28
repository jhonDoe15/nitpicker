//! `picksAtMostOne`: a `find` callback that can match one member of a union only.
use crate::typescript::rules::signatures::unwrap;
use crate::typescript::rules::support::view::{Node, Value};

const SINGLETON_FLAGS: [&str; 11] = ["Any", "Unknown", "String", "Number", "BigInt", "ESSymbol", "Void", "Undefined", "Null", "Never", "NonPrimitive"];
const UNWRAPPED: [&str; 2] = ["TSAsExpression", "TSNonNullExpression"];

fn is_parameter(node: Node, parameter: &str) -> bool {
    let inner = unwrap(node, &UNWRAPPED);
    inner.is("Identifier") && inner.name().as_deref() == Some(parameter)
}

fn is_parameter_property(node: Node, parameter: &str, property: &str) -> bool {
    node.is("MemberExpression")
        && !node.flag("computed")
        && node.node("object").is_some_and(|object| is_parameter(object, parameter))
        && node.node("property").is_some_and(|name| name.is("Identifier") && name.name().as_deref() == Some(property))
}

fn mentions(node: Node, parameter: &str) -> bool {
    node.descendants().into_iter().any(|child| {
        is_parameter(child, parameter)
            && !child.parent().is_some_and(|parent| parent.is("MemberExpression") && !parent.flag("computed") && parent.node("property") == Some(child))
    })
}

fn is_singleton_flag(node: Node) -> bool {
    if !node.is("MemberExpression") || node.flag("computed") {
        return false;
    }
    let (Some(object), Some(property)) = (node.node("object"), node.node("property")) else { return false };
    let holder = if object.is("MemberExpression") {
        !object.flag("computed") && object.node("property").is_some_and(|name| name.is("Identifier") && name.name().as_deref() == Some("TypeFlags"))
    } else {
        object.is("Identifier") && object.name().as_deref() == Some("TypeFlags")
    };
    holder && property.is("Identifier") && property.name().is_some_and(|name| SINGLETON_FLAGS.contains(&&*name))
}

fn is_flag_mask(node: Node, parameter: &str) -> bool {
    if !node.is("BinaryExpression") || node.text("operator").as_deref() != Some("&") {
        return false;
    }
    let (Some(left), Some(right)) = (node.node("left"), node.node("right")) else { return false };
    (is_parameter_property(left, parameter, "flags") && is_singleton_flag(right)) || (is_parameter_property(right, parameter, "flags") && is_singleton_flag(left))
}

fn either_side(node: Node, test: impl Fn(Node, Node) -> bool) -> bool {
    let (Some(left), Some(right)) = (node.node("left"), node.node("right")) else { return false };
    test(left, right) || test(right, left)
}

fn matches_one_member(node: Node, parameter: &str) -> bool {
    if is_flag_mask(node, parameter) {
        return true;
    }
    if !node.is("BinaryExpression") {
        return false;
    }
    match node.text("operator").as_deref() {
        Some("!==" | "!=" | ">") => either_side(node, |side, other| is_flag_mask(side, parameter) && other.is("Literal") && other.get("value") == Value::Number(0.0)),
        Some("===" | "==") => either_side(node, |side, other| {
            (is_parameter(side, parameter) && !mentions(other, parameter))
                || (is_parameter_property(side, parameter, "flags") && is_singleton_flag(other))
                || (is_parameter_property(side, parameter, "value") && other.is("Literal"))
        }),
        _ => false,
    }
}

fn is_conjunction(node: Node) -> bool {
    node.is("LogicalExpression") && node.text("operator").as_deref() == Some("&&")
}

fn conjuncts(node: Node) -> Vec<Node> {
    let mut found = Vec::new();
    let mut pending = vec![node];
    while let Some(part) = pending.pop() {
        if is_conjunction(part) {
            pending.extend(part.node("right"));
            pending.extend(part.node("left"));
        } else {
            found.push(part);
        }
    }
    found
}

fn returned_value(callback: Node) -> Option<Node> {
    let body = callback.node("body")?;
    if !body.is("BlockStatement") {
        return Some(body);
    }
    let statements = body.nodes("body");
    match statements.as_slice() {
        [only] if only.is("ReturnStatement") => only.node("argument"),
        _ => None,
    }
}

pub fn picks_at_most_one(callback: Option<Node>) -> bool {
    let Some(callback) = callback.filter(|callback| callback.is("ArrowFunctionExpression") || callback.is("FunctionExpression")) else { return false };
    let Some(first) = callback.nodes("params").into_iter().next().filter(|first| first.is("Identifier")) else { return false };
    let Some(parameter) = first.name() else { return false };
    returned_value(callback).is_some_and(|value| conjuncts(value).into_iter().any(|part| matches_one_member(part, &parameter)))
}
