//! The syntax questions of `no-blank-number-coercion`: whether the text was checked for blank, whether the number
//! was checked for NaN or bounded away from zero, and where the text came from.
use crate::typescript::rules::signatures::{Scope, is_function, name_of};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};
use regex::Regex;
use std::sync::LazyLock;

const BLANK_MEMBERS: [&str; 4] = ["trim", "trimStart", "trimEnd", "length"];
const CHECKS: [&str; 4] = ["isNaN", "isFinite", "isInteger", "isSafeInteger"];

static SHAPES: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"^process\.env\.",
        r"^import\.meta\.env\.",
        r"^(?:req|request|ctx)\.(?:query|params|body)(?-u:\b)",
        r"(?-u:\b)searchParams\.get\(",
        r"(?-u:\b)formData\.get\(",
        r"\.(?:getString|getOptionalString)\(",
    ]
    .iter()
    .map(|pattern| Regex::new(pattern).expect("pattern"))
    .collect()
});

pub fn is_js_space(character: char) -> bool {
    matches!(character, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

pub fn is_blank_text(text: &str) -> bool {
    text.chars().all(is_js_space)
}

pub fn has_input_shape(text: &str) -> bool {
    let plain = text.replace("?.", ".");
    SHAPES.iter().any(|shape| shape.is_match(&plain))
}

fn enclosing<'v>(node: Node<'v>) -> Node<'v> {
    node.ancestors().find(|ancestor| is_function(*ancestor)).unwrap_or_else(|| node.view.program())
}

fn is_empty_text(node: Node) -> bool {
    node.is("Literal") && matches!(node.get("value"), Value::Text(start, end, _) if start == end)
}

fn is_blank_test(scope: &Scope, node: Node, target: &str) -> bool {
    if scope.source(node).replace("?.", ".") != target {
        return false;
    }
    let Some(parent) = node.parent() else { return false };
    match parent.kind() {
        "UnaryExpression" => parent.text("operator").as_deref() == Some("!"),
        "LogicalExpression" => true,
        "IfStatement" | "ConditionalExpression" => parent.node("test") == Some(node),
        "MemberExpression" => parent.node("object") == Some(node) && BLANK_MEMBERS.contains(&name_of(parent.node("property")).unwrap_or_default().as_str()),
        "BinaryExpression" => [parent.node("left"), parent.node("right")].into_iter().flatten().any(is_empty_text),
        _ => false,
    }
}

pub fn is_blank_checked(scope: &Scope, coercion: Node, value: Node) -> bool {
    let target = scope.source(value).replace("?.", ".");
    enclosing(coercion).descendants().into_iter().any(|node| node != value && node.end() - node.start() >= target.len() as u32 && is_blank_test(scope, node, &target))
}

fn is_self_comparison(node: Node) -> bool {
    let operator = node.text("operator");
    matches!(operator.as_deref(), Some("!==" | "===")) && match (node.node("left"), node.node("right")) {
        (Some(left), Some(right)) => left.is("Identifier") && right.is("Identifier") && left.name() == right.name(),
        _ => false,
    }
}

fn callee_name(call: Node) -> Option<String> {
    let callee = call.node("callee")?;
    name_of(if callee.is("MemberExpression") { callee.node("property") } else { Some(callee) })
}

fn is_check_call(call: Node, argument: Node) -> bool {
    call.is("CallExpression")
        && call.list("arguments").first().copied().flatten() == Some(argument)
        && callee_name(call).is_some_and(|name| CHECKS.contains(&name.as_str()))
}

fn checked_by(identifier: Node) -> bool {
    let Some(parent) = identifier.parent() else { return false };
    if parent.is("BinaryExpression") {
        return is_self_comparison(parent);
    }
    is_check_call(parent, identifier)
}

fn literal_number(node: Option<Node>) -> Option<f64> {
    let node = node.filter(|node| node.is("Literal"))?;
    match node.get("value") {
        Value::Number(number) => Some(number),
        _ => None,
    }
}

fn excludes_zero(identifier: Node) -> bool {
    let Some(parent) = identifier.parent().filter(|parent| parent.is("BinaryExpression")) else { return false };
    let on_left = parent.node("left") == Some(identifier);
    let Some(bound) = literal_number(parent.node(if on_left { "right" } else { "left" })) else { return false };
    let operator = parent.text("operator").unwrap_or_default();
    let operator = match (on_left, operator.as_ref()) {
        (true, found) => found,
        (false, "<") => ">",
        (false, ">") => "<",
        (false, "<=") => ">=",
        (false, ">=") => "<=",
        _ => return false,
    };
    matches!((operator, bound), (">", 0.0) | (">=", 1.0) | ("<", 1.0) | ("<=", 0.0))
}

fn bindings<'v>(pattern: Node<'v>, found: &mut Vec<Node<'v>>) {
    match pattern.kind() {
        "Identifier" => found.push(pattern),
        "ArrayPattern" => pattern.nodes("elements").into_iter().for_each(|element| bindings(element, found)),
        "ObjectPattern" => pattern.nodes("properties").into_iter().for_each(|property| bindings(if property.is("Property") { property.node("value").unwrap_or(property) } else { property }, found)),
        "AssignmentPattern" => pattern.node("left").into_iter().for_each(|left| bindings(left, found)),
        "RestElement" => pattern.node("argument").into_iter().for_each(|argument| bindings(argument, found)),
        _ => {}
    }
}

/// `numberChecks`: whether the number is checked for NaN, and whether a comparison keeps it away from zero.
pub fn number_checks(scopes: &Scopes, coercion: Node) -> (bool, bool) {
    let Some(parent) = coercion.parent() else { return (false, false) };
    if parent.is("CallExpression") && parent.list("arguments").first().copied().flatten() == Some(coercion) {
        return (callee_name(parent).is_some_and(|name| CHECKS.contains(&name.as_str())), false);
    }
    if !parent.is("VariableDeclarator") || parent.node("init") != Some(coercion) {
        return (false, false);
    }
    let mut names = Vec::new();
    if let Some(id) = parent.node("id") {
        bindings(id, &mut names);
    }
    let declared = parent.node("id");
    let references: Vec<Node> = names
        .into_iter()
        .filter_map(|name| scopes.variable_named(name))
        .flat_map(|symbol| scopes.references(symbol))
        .map(|reference| reference.identifier)
        .filter(|identifier| Some(*identifier) != declared)
        .collect();
    (references.iter().any(|reference| checked_by(*reference)), references.iter().any(|reference| excludes_zero(*reference)))
}

fn is_split_element(scope: &Scope, identifier: Node) -> bool {
    let Some(symbol) = scope.scopes.variable_named(identifier) else { return false };
    let Some(definition) = scope.scopes.defs(symbol).into_iter().next().filter(|definition| definition.kind == DefKind::Variable) else { return false };
    let declarator = definition.node;
    let init = declarator.node("init").filter(|init| init.is("CallExpression"));
    declarator.node("id").is_some_and(|id| id.is("ArrayPattern"))
        && init.and_then(|init| init.node("callee")).is_some_and(|callee| callee.is("MemberExpression") && name_of(callee.node("property")).as_deref() == Some("split"))
}

pub fn is_split_part(scope: &Scope, value: Node) -> bool {
    value.descendants().into_iter().any(|node| node.is("Identifier") && is_split_element(scope, node))
}
