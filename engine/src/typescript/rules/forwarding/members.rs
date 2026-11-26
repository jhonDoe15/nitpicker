//! The shape of a class method that forwards its parameters to another method of `this`, read from the tree.
use crate::typescript::rules::support::view::{Node, Value};
use std::collections::HashSet;

const PUBLISHED_NAMES: [&str; 2] = ["of", "from"];

pub fn key_name(member: Node) -> Option<String> {
    let key = member.node("key")?;
    match key.kind() {
        "PrivateIdentifier" => key.name().map(|name| format!("#{name}")),
        "Identifier" => key.name().map(|name| name.into_owned()),
        "Literal" if key.text("bigint").is_some() => key.text("bigint").map(|text| text.into_owned()),
        "Literal" => match key.get("value") {
            Value::Text(..) => key.text("value").map(|text| text.into_owned()),
            Value::Number(number) if number.fract() == 0.0 && number.abs() < 1e15 => Some(format!("{}", number as i64)),
            Value::Number(number) => Some(number.to_string()),
            Value::Bool(flag) => Some(flag.to_string()),
            _ => None,
        },
        _ => None,
    }
}

pub fn property_name(property: Node) -> String {
    let name = property.name().map(|name| name.into_owned()).unwrap_or_default();
    if property.is("PrivateIdentifier") { format!("#{name}") } else { name }
}

fn sole_statement(function: Node) -> Option<Node> {
    let body = function.node("body")?.nodes("body");
    (body.len() == 1).then(|| body[0])
}

pub fn forwarded_call(function: Node) -> Option<Node> {
    let statement = sole_statement(function)?;
    let value = match statement.kind() {
        "ReturnStatement" => statement.node("argument"),
        "ExpressionStatement" => statement.node("expression"),
        _ => None,
    }?;
    let awaited = value.is("AwaitExpression").then(|| value.node("argument")).flatten();
    if function.flag("async") && statement.is("ExpressionStatement") && awaited.is_none() {
        return None;
    }
    let call = if function.flag("async") { awaited.unwrap_or(value) } else { value };
    call.is("CallExpression").then_some(call)
}

fn is_passed_unchanged(parameter: Node, argument: Node) -> bool {
    let (rest, spread) = (parameter.is("RestElement"), argument.is("SpreadElement"));
    let own = if rest { parameter.node("argument") } else { Some(parameter) };
    let passed = if spread { argument.node("argument") } else { Some(argument) };
    let (Some(own), Some(passed)) = (own, passed) else { return false };
    rest == spread && own.is("Identifier") && own.name().as_deref() != Some("this") && passed.is("Identifier") && own.name() == passed.name()
}

fn forwards_own_parameters(function: Node, call: Node) -> bool {
    let (parameters, arguments) = (function.nodes("params"), call.nodes("arguments"));
    !parameters.is_empty() && parameters.len() == arguments.len() && parameters.iter().zip(&arguments).all(|(parameter, argument)| is_passed_unchanged(*parameter, *argument))
}

fn is_this_method_call(call: Node) -> bool {
    let Some(callee) = call.node("callee") else { return false };
    !call.flag("optional")
        && call.node("typeArguments").is_none()
        && call.node("typeParameters").is_none()
        && callee.is("MemberExpression")
        && !callee.flag("computed")
        && !callee.flag("optional")
        && callee.node("object").is_some_and(|object| object.is("ThisExpression"))
}

pub fn is_candidate(member: Node) -> bool {
    let Some(function) = member.node("value") else { return false };
    let name = key_name(member);
    member.text("kind").as_deref() == Some("method")
        && !member.flag("computed")
        && !member.flag("override")
        && member.nodes("decorators").is_empty()
        && !function.nodes("params").iter().any(|parameter| !parameter.nodes("decorators").is_empty())
        && name.as_deref().is_some_and(|name| !PUBLISHED_NAMES.contains(&name))
        && function.is("FunctionExpression")
        && !function.flag("generator")
        && function.node("typeParameters").is_none()
}

pub fn alias_call(member: Node) -> Option<Node> {
    let function = member.node("value")?;
    let call = forwarded_call(function)?;
    (is_this_method_call(call) && forwards_own_parameters(function, call)).then_some(call)
}

pub fn callee_name(call: Node) -> String {
    call.node("callee").and_then(|callee| callee.node("property")).map(property_name).unwrap_or_default()
}

pub fn methods_of(class: Node) -> Vec<Node> {
    class.node("body").map(|body| body.nodes("body")).unwrap_or_default().into_iter().filter(|element| element.is("MethodDefinition")).collect()
}

pub fn is_later_of_mutual(class: Node, member: Node, call: Node) -> bool {
    let target = callee_name(call);
    let back = methods_of(class).into_iter().find(|other| key_name(*other).as_deref() == Some(target.as_str()));
    let back_call = back.filter(|back| is_candidate(*back)).and_then(alias_call);
    match (back, back_call) {
        (Some(back), Some(back_call)) => callee_name(back_call).as_str() != key_name(member).unwrap_or_default() || back.start() < member.start(),
        _ => true,
    }
}

pub fn names_written_on_this(class: Node) -> HashSet<String> {
    let mut names = HashSet::new();
    for node in class.node("body").map(|body| body.descendants()).unwrap_or_default() {
        let Some(left) = node.is("AssignmentExpression").then(|| node.node("left")).flatten() else { continue };
        if left.is("MemberExpression") && left.node("object").is_some_and(|object| object.is("ThisExpression")) {
            names.insert(if left.flag("computed") { "[]".to_string() } else { left.node("property").map(property_name).unwrap_or_default() });
        }
    }
    names
}
