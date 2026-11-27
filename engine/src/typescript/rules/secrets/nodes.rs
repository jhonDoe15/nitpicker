//! `secret-nodes.mts`: the dotted names of expressions, the keys of members and properties, the string parts an
//! expression is built from, and the environment variable a value reads.
use crate::typescript::rules::signatures::unwrap;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::string_value;

const WRAPPERS: &[&str] =
    &["TSAsExpression", "TSSatisfiesExpression", "TSTypeAssertion", "TSNonNullExpression", "ChainExpression", "AwaitExpression"];
const TEXT_PRESERVING_METHODS: [&str; 5] = ["trim", "trimStart", "trimEnd", "toString", "normalize"];
const STRING_WRAPPERS: [&str; 2] = ["String", "Buffer.from"];
const ENV_OBJECTS: [&str; 4] = ["process.env", "import.meta.env", "Deno.env", "Bun.env"];

pub struct LiteralPart<'v> {
    pub node: Node<'v>,
    pub text: String,
}

/// `unwrapped`: under type assertions, `!`, optional chains and `await`.
pub fn unwrapped(node: Node) -> Node {
    let mut current = node;
    loop {
        let next = unwrap(current, &WRAPPERS[..5]);
        let next = if next.is("AwaitExpression") { next.node("argument").unwrap_or(next) } else { next };
        if next == current {
            return current;
        }
        current = next;
    }
}

fn name(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn base_name(inner: Node) -> Option<String> {
    match inner.kind() {
        "Identifier" => name(Some(inner)),
        "ThisExpression" => Some("this".to_string()),
        "MetaProperty" => Some(format!("{}.{}", name(inner.node("meta"))?, name(inner.node("property"))?)),
        _ => None,
    }
}

/// `dottedName`: `a.b.c` for a chain of plain members on a name, `this` or `import.meta`.
pub fn dotted_name(node: Node) -> Option<String> {
    let mut properties = Vec::new();
    let mut inner = unwrapped(node);
    while inner.is("MemberExpression") && !inner.flag("computed") {
        properties.push(name(inner.node("property")).unwrap_or_default());
        inner = unwrapped(inner.node("object")?);
    }
    let base = base_name(inner)?;
    properties.push(base);
    properties.reverse();
    Some(properties.join("."))
}

/// `stringKey`: a string literal or a template without placeholders.
pub fn string_key(node: Node) -> Option<String> {
    string_value(Some(node))
}

/// `memberName`: a plain property name, or the string a computed key holds.
pub fn member_name(member: Node) -> Option<String> {
    let property = member.node("property")?;
    if member.flag("computed") {
        return string_key(property);
    }
    if property.is("Identifier") { name(Some(property)) } else { None }
}

fn call_literal(call: Node) -> Option<Node> {
    let arguments = call.nodes("arguments");
    let callee = call.node("callee")?;
    if dotted_name(callee).is_some_and(|callee| STRING_WRAPPERS.contains(&callee.as_str())) && !arguments.is_empty() {
        return arguments.first().copied();
    }
    let method = callee.is("MemberExpression") && !callee.flag("computed");
    let preserving = method && name(callee.node("property")).is_some_and(|method| TEXT_PRESERVING_METHODS.contains(&method.as_str()));
    if preserving { callee.node("object") } else { None }
}

fn literal_children(inner: Node) -> Vec<Node> {
    let operator = inner.text("operator");
    let pair = || inner.node("left").into_iter().chain(inner.node("right")).collect();
    match inner.kind() {
        "BinaryExpression" if operator.as_deref() == Some("+") => pair(),
        "LogicalExpression" if operator.as_deref() != Some("&&") => pair(),
        "ConditionalExpression" => inner.node("consequent").into_iter().chain(inner.node("alternate")).collect(),
        "CallExpression" => call_literal(inner).into_iter().collect(),
        _ => Vec::new(),
    }
}

enum Task<'v> {
    Visit(Node<'v>),
    Combine(Node<'v>, usize),
}

fn combined<'v>(inner: Node<'v>, parts: Vec<LiteralPart<'v>>) -> Vec<LiteralPart<'v>> {
    if !inner.is("BinaryExpression") || parts.len() < 2 {
        return parts;
    }
    vec![LiteralPart { node: inner, text: parts.into_iter().map(|part| part.text).collect() }]
}

/// `literalParts`: the strings an expression is built from, a concatenation as one part.
pub fn literal_parts(node: Node) -> Vec<LiteralPart> {
    let mut results: Vec<Vec<LiteralPart>> = Vec::new();
    let mut tasks = vec![Task::Visit(unwrapped(node))];
    while let Some(task) = tasks.pop() {
        match task {
            Task::Visit(inner) => {
                if let Some(text) = string_key(inner) {
                    results.push(vec![LiteralPart { node: inner, text }]);
                    continue;
                }
                let children = literal_children(inner);
                tasks.push(Task::Combine(inner, children.len()));
                tasks.extend(children.into_iter().rev().map(|child| Task::Visit(unwrapped(child))));
            }
            Task::Combine(inner, count) => {
                let parts = results.split_off(results.len() - count).into_iter().flatten().collect();
                results.push(combined(inner, parts));
            }
        }
    }
    results.pop().unwrap_or_default()
}

/// `envKey`: the variable `process.env.NAME`, `import.meta.env.NAME` or `Deno.env.get("NAME")` reads.
pub fn env_key(node: Node) -> Option<String> {
    let inner = unwrapped(node);
    if inner.is("MemberExpression") {
        let object = dotted_name(inner.node("object")?)?;
        return if ENV_OBJECTS.contains(&object.as_str()) { member_name(inner) } else { None };
    }
    if !inner.is("CallExpression") || inner.node("callee").and_then(dotted_name).as_deref() != Some("Deno.env.get") {
        return None;
    }
    inner.list("arguments").first().copied().flatten().and_then(string_key)
}
