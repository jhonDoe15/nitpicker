//! What the optimistic-lock rule reads from the syntax tree: loads, locks, field writes and saves.
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use oxc_semantic::SymbolId;
use std::collections::HashSet;

const WRAPPERS: [&str; 5] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "ChainExpression"];
const LOADERS: [&str; 9] = ["find", "findBy", "findOne", "findOneBy", "findOneOrFail", "findOneByOrFail", "findAll", "findByPk", "findAndCount"];
const SAVERS: [&str; 2] = ["save", "persistAndFlush"];
const OBJECT_SAVERS: [&str; 2] = ["save", "update"];
const LOCK_KEYS: [&str; 2] = ["lock", "lockMode"];
const FUNCTIONS: [&str; 3] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];

pub fn unwrapped(mut node: Node) -> Node {
    while WRAPPERS.contains(&node.kind()) {
        let Some(inner) = node.node("expression") else { break };
        node = inner;
    }
    node
}

fn string_value(node: Node) -> Option<String> {
    if node.is("Literal") {
        return node.text("value").map(|text| text.into_owned());
    }
    if node.is("TemplateLiteral") && node.nodes("expressions").is_empty() {
        return match node.nodes("quasis").into_iter().next()?.get("value") {
            Value::Node(index) => node.view.at(index).text("cooked").map(|text| text.into_owned()),
            _ => None,
        };
    }
    None
}

pub fn member_name(member: Node) -> Option<String> {
    let property = member.node("property")?;
    if !member.flag("computed") && property.is("Identifier") {
        return property.name().map(|name| name.into_owned());
    }
    if member.flag("computed") { string_value(property) } else { None }
}

fn static_key(property: Node) -> Option<String> {
    if !property.is("Property") && !property.is("PropertyDefinition") {
        return None;
    }
    let key = property.node("key")?;
    if !property.flag("computed") && key.is("Identifier") {
        return key.name().map(|name| name.into_owned());
    }
    string_value(key)
}

pub fn home_of(node: Node) -> Option<u32> {
    node.ancestors().find(|each| FUNCTIONS.contains(&each.kind())).map(|each| each.index)
}

fn is_locked(call: Node) -> bool {
    call.nodes("arguments").into_iter().any(|argument| {
        argument.is("ObjectExpression") && argument.nodes("properties").into_iter().any(|property| static_key(property).is_some_and(|key| LOCK_KEYS.contains(&key.as_str())))
    })
}

pub fn is_load(init: Option<Node>) -> bool {
    let Some(awaited) = init.map(unwrapped).filter(|awaited| awaited.is("AwaitExpression")) else { return false };
    let Some(call) = awaited.node("argument").map(unwrapped).filter(|call| call.is("CallExpression")) else { return false };
    let callee = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression"));
    callee.is_some_and(|callee| member_name(callee).is_some_and(|name| LOADERS.contains(&name.as_str()))) && !is_locked(call)
}

fn binding_names<'v>(pattern: Node<'v>, found: &mut Vec<Node<'v>>) {
    match pattern.kind() {
        "Identifier" => found.push(pattern),
        "ObjectPattern" => {
            for property in pattern.nodes("properties") {
                binding_names(if property.is("Property") { property.node("value").unwrap_or(property) } else { property }, found);
            }
        }
        "ArrayPattern" => pattern.nodes("elements").into_iter().for_each(|element| binding_names(element, found)),
        "AssignmentPattern" => pattern.node("left").into_iter().for_each(|left| binding_names(left, found)),
        "RestElement" => pattern.node("argument").into_iter().for_each(|argument| binding_names(argument, found)),
        _ => {}
    }
}

fn loop_variables(scopes: &Scopes, identifier: Node) -> Vec<SymbolId> {
    let Some(parent) = identifier.parent().filter(|parent| parent.is("ForOfStatement")) else { return Vec::new() };
    let Some(declaration) = parent.node("left").filter(|left| left.is("VariableDeclaration")) else { return Vec::new() };
    if parent.node("right") != Some(identifier) {
        return Vec::new();
    }
    let mut bound = Vec::new();
    for declarator in declaration.nodes("declarations") {
        declarator.node("id").into_iter().for_each(|id| binding_names(id, &mut bound));
    }
    bound.into_iter().filter_map(|name| scopes.variable_named(name)).collect()
}

pub fn names_of(scopes: &Scopes, variable: SymbolId) -> Vec<SymbolId> {
    let mut names = vec![variable];
    for reference in scopes.references(variable) {
        for element in loop_variables(scopes, reference.identifier) {
            if !names.contains(&element) {
                names.push(element);
            }
        }
    }
    names
}

fn is_field_write(identifier: Node) -> bool {
    let target = identifier.parent().filter(|parent| parent.is("TSNonNullExpression")).unwrap_or(identifier);
    let Some(member) = target.parent().filter(|member| member.is("MemberExpression") && member.node("object") == Some(target)) else { return false };
    let Some(outer) = member.parent() else { return false };
    (outer.is("AssignmentExpression") && outer.node("left") == Some(member)) || outer.is("UpdateExpression")
}

pub struct Names {
    pub identifiers: HashSet<u32>,
    pub changed: bool,
}

pub fn references_of(scopes: &Scopes, names: &[SymbolId]) -> Names {
    let mut identifiers = HashSet::new();
    let mut changed = false;
    for variable in names {
        for reference in scopes.references(*variable) {
            changed |= is_field_write(reference.identifier);
            identifiers.insert(reference.identifier.index);
        }
    }
    Names { identifiers, changed }
}

fn holds_any(names: &Names, node: Node) -> bool {
    node.is("Identifier") && names.identifiers.contains(&node.index)
}

pub fn is_saved_through(call: Node, names: &Names) -> bool {
    let Some(callee) = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression")) else { return false };
    let method = member_name(callee).unwrap_or_default();
    let Some(object) = callee.node("object").map(unwrapped) else { return false };
    (SAVERS.contains(&method.as_str()) && call.nodes("arguments").into_iter().any(|argument| holds_any(names, unwrapped(argument))))
        || (OBJECT_SAVERS.contains(&method.as_str()) && holds_any(names, object))
}

pub fn is_flush(call: Node) -> bool {
    call.node("callee").is_some_and(|callee| callee.is("MemberExpression") && member_name(callee).as_deref() == Some("flush"))
}
