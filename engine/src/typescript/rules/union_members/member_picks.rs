//! `isMemberList` and `orderedPick`: a `.types` list of the compiler's unions read by place.
use super::unique_members::picks_at_most_one;
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use regex::Regex;

const PASS_THROUGH: [&str; 4] = ["filter", "map", "flatMap", "slice"];
const PICKS: [&str; 2] = ["find", "findLast"];
const FUNCTION_SCOPES: [&str; 4] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "Program"];
const WRAPPERS: [&str; 3] = ["ChainExpression", "TSNonNullExpression", "TSAsExpression"];
const EQUALITY: [&str; 4] = ["===", "!==", "==", "!="];

pub struct Pick<'v> {
    pub node: Node<'v>,
    pub form: String,
}

pub fn outermost(node: Node) -> Node {
    let mut current = node;
    while let Some(parent) = current.parent().filter(|parent| WRAPPERS.contains(&parent.kind())) {
        current = parent;
    }
    current
}

fn is_nullish(side: Node) -> bool {
    (side.is("Identifier") && side.name().as_deref() == Some("undefined")) || (side.is("Literal") && side.text("raw").as_deref() == Some("null"))
}

fn is_presence_use(parent: Node, value: Node) -> bool {
    let operator = parent.text("operator");
    match parent.kind() {
        "UnaryExpression" => operator.as_deref() == Some("!"),
        "IfStatement" | "ConditionalExpression" => parent.node("test") == Some(value),
        "LogicalExpression" => operator.as_deref() == Some("&&") && parent.node("left") == Some(value),
        "BinaryExpression" => operator.as_deref().is_some_and(|found| EQUALITY.contains(&found)) && [parent.node("left"), parent.node("right")].into_iter().flatten().any(is_nullish),
        "CallExpression" => parent.node("callee").is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("Boolean")) && parent.nodes("arguments").len() == 1,
        _ => false,
    }
}

fn is_presence_only(node: Node) -> bool {
    let value = outermost(node);
    value.parent().is_some_and(|parent| is_presence_use(parent, value))
}

struct Method<'v> {
    name: String,
    call: Node<'v>,
}

fn called_method(node: Node) -> Option<Method> {
    let value = outermost(node);
    let member = value.parent().filter(|member| member.is("MemberExpression") && member.node("object") == Some(value) && !member.flag("computed"))?;
    let property = member.node("property").filter(|property| property.is("Identifier"))?;
    let top = outermost(member);
    let call = top.parent().filter(|call| call.is("CallExpression") && call.node("callee") == Some(top))?;
    Some(Method { name: property.name()?.into_owned(), call })
}

fn is_edge_index(node: Option<Node>) -> bool {
    let Some(node) = node else { return false };
    match node.kind() {
        "Literal" => node.get("value") == crate::typescript::rules::support::view::Value::Number(0.0),
        "UnaryExpression" => {
            node.text("operator").as_deref() == Some("-")
                && node.node("argument").is_some_and(|argument| argument.is("Literal") && argument.get("value") == crate::typescript::rules::support::view::Value::Number(1.0))
        }
        _ => false,
    }
}

fn is_global_call(callee: Node, object: &str, property: &str) -> bool {
    callee.is("MemberExpression")
        && !callee.flag("computed")
        && callee.node("object").is_some_and(|found| found.is("Identifier") && found.name().as_deref() == Some(object))
        && callee.node("property").is_some_and(|found| found.is("Identifier") && found.name().as_deref() == Some(property))
}

fn built_from_entries(call: Node) -> Option<&'static str> {
    let top = outermost(call);
    let parent = top.parent()?;
    let first = parent.nodes("arguments").first().copied() == Some(top);
    if parent.is("NewExpression") {
        let callee = parent.node("callee")?;
        return (first && callee.is("Identifier") && callee.name().as_deref() == Some("Map")).then_some("`new Map(...)` over `.types.flatMap(...)`");
    }
    (parent.is("CallExpression") && first && parent.node("callee").is_some_and(|callee| is_global_call(callee, "Object", "fromEntries"))).then_some("`Object.fromEntries(...)` over `.types.flatMap(...)`")
}

fn syntax_pick(value: Node) -> Option<Pick> {
    let parent = value.parent()?;
    if parent.is("MemberExpression") && parent.node("object") == Some(value) && parent.flag("computed") && is_edge_index(parent.node("property")) {
        return (!is_presence_only(parent)).then(|| Pick { node: parent, form: "`.types[0]`".to_string() });
    }
    (parent.is("VariableDeclarator") && parent.node("init") == Some(value) && parent.node("id").is_some_and(|id| id.is("ArrayPattern")))
        .then(|| Pick { node: parent, form: "Destructuring the first item of `.types`".to_string() })
}

fn method_pick<'v>(name: &str, call: Node<'v>) -> Option<Pick<'v>> {
    if name == "at" && is_edge_index(call.nodes("arguments").first().copied()) {
        return (!is_presence_only(call)).then(|| Pick { node: call, form: "`.types.at(...)`".to_string() });
    }
    (PICKS.contains(&name) && !is_presence_only(call) && !picks_at_most_one(call.nodes("arguments").first().copied())).then(|| Pick { node: call, form: format!("`.types.{name}(...)`") })
}

fn pass_through_call(node: Node) -> Option<Method> {
    called_method(node).filter(|method| PASS_THROUGH.contains(&method.name.as_str()))
}

fn built_pick<'v>(calls: &[Method<'v>]) -> Option<Pick<'v>> {
    let first = calls.iter().position(|step| step.name == "flatMap")?;
    calls[first..].iter().find_map(|step| built_from_entries(step.call).map(|form| Pick { node: step.call, form: form.to_string() }))
}

fn pick_on(member: Node) -> Option<Pick> {
    let mut calls = Vec::new();
    let mut next = pass_through_call(member);
    while let Some(step) = next {
        next = pass_through_call(step.call);
        calls.push(step);
    }
    if let Some(built) = built_pick(&calls) {
        return Some(built);
    }
    let last = calls.last().map_or(member, |step| step.call);
    match called_method(last) {
        None => syntax_pick(outermost(last)),
        Some(method) => method_pick(&method.name, method.call),
    }
}

fn is_guarded_single_member(context: &Context, member: Node) -> bool {
    let current = member.ancestors().find(|ancestor| FUNCTION_SCOPES.contains(&ancestor.kind()));
    let Some(object) = member.node("object") else { return false };
    let owner = regex::escape(context.file.slice(object.start(), object.end()));
    let Ok(guard) = Regex::new(&format!(r"{owner}\.types\.length[\t\n\x0B\x0C\r\p{{Z}}\x{{FEFF}}]*[!=]==?[\t\n\x0B\x0C\r\p{{Z}}\x{{FEFF}}]*1(?-u:\b)")) else { return false };
    let scope = current.unwrap_or(member);
    guard.is_match(context.file.slice(scope.start(), scope.end()))
}

pub fn ordered_pick<'v>(context: &Context, member: Node<'v>) -> Option<Pick<'v>> {
    let pick = pick_on(member)?;
    (!is_guarded_single_member(context, member)).then_some(pick)
}
