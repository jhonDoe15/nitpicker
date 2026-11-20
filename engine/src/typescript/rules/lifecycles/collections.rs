use super::close_scopes::{is_function, literal_string, name_of, unwrap_expression};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use oxc_semantic::SymbolId;

pub struct Binding<'v> {
    pub name: Option<String>,
    pub node: Node<'v>,
    pub kind: String,
    pub variable: Option<SymbolId>,
}

pub enum Use<'v> {
    Read { call: Option<Node<'v>>, method: Option<String> },
    Add { call: Node<'v>, method: String, key: Option<Node<'v>> },
    Remove,
    Reassign,
    Escape,
}

const COLLECTION_TYPES: [&str; 4] = ["Map", "Set", "Array", "Record"];

fn collection_type(name: Option<String>) -> Option<String> {
    name.filter(|name| COLLECTION_TYPES.contains(&name.as_str()))
}

fn constructed(expression: Node) -> Option<String> {
    let value = unwrap_expression(expression);
    if value.is("NewExpression") && let Some(callee) = value.node("callee").filter(|callee| callee.is("Identifier")) {
        return collection_type(name_of(Some(callee)));
    }
    value.is("ArrayExpression").then(|| "Array".to_string())
}

fn annotated(annotation: Option<Node>) -> Option<String> {
    let written = annotation?.node("typeAnnotation")?;
    let name = written.is("TSTypeReference").then(|| name_of(written.node("typeName"))).flatten();
    collection_type(name).or_else(|| written.is("TSArrayType").then(|| "Array".to_string()))
}

fn is_constructor_assignment(node: Node) -> bool {
    let Some((left, right)) = node.is("AssignmentExpression").then(|| node.node("left").zip(node.node("right"))).flatten() else { return false };
    if !left.is("MemberExpression") || !left.node("object").is_some_and(|object| object.is("ThisExpression")) || constructed(right).is_none() {
        return false;
    }
    let method = node.ancestors().find(|ancestor| is_function(*ancestor)).and_then(|function| function.parent());
    method.is_some_and(|method| method.is("MethodDefinition") && method.text("kind").as_deref() == Some("constructor"))
}

fn field_bindings(body: Node) -> Vec<Binding> {
    let mut found = Vec::new();
    for member in body.nodes("body") {
        if member.is("PropertyDefinition") && !member.flag("computed") && !member.flag("static") {
            let kind = member.node("value").and_then(constructed).or_else(|| annotated(member.node("typeAnnotation")));
            found.extend(kind.map(|kind| Binding { name: name_of(member.node("key")), node: member, kind, variable: None }));
        }
    }
    for node in body.descendants().into_iter().filter(|node| is_constructor_assignment(*node)) {
        let kind = node.node("right").and_then(constructed);
        let name = name_of(node.node("left").and_then(|left| left.node("property")));
        found.extend(kind.map(|kind| Binding { name, node, kind, variable: None }));
    }
    found
}

fn variable_bindings<'v>(scopes: &Scopes<'_, 'v>, container: Node<'v>) -> Vec<Binding<'v>> {
    let mut found = Vec::new();
    for variable in scopes.acquired(container) {
        let definitions = scopes.defs(variable);
        let Some(definition) = definitions.first().filter(|definition| definition.kind == DefKind::Variable) else { continue };
        let kind = definition.node.node("init").and_then(constructed);
        found.extend(kind.map(|kind| Binding { name: Some(scopes.name(variable).to_string()), node: definition.node, kind, variable: Some(variable) }));
    }
    found
}

pub fn collections_of<'v>(scopes: &Scopes<'_, 'v>, container: Node<'v>) -> Vec<Binding<'v>> {
    if container.is("ClassBody") { field_bindings(container) } else { variable_bindings(scopes, container) }
}

pub fn uses_of<'v>(scopes: &Scopes<'_, 'v>, binding: &Binding<'v>, container: Node<'v>) -> Vec<Node<'v>> {
    if let Some(variable) = binding.variable {
        return scopes.references(variable).into_iter().map(|reference| reference.identifier).collect();
    }
    let named = |member: Node| {
        let Some(property) = member.node("property") else { return false };
        if member.flag("computed") { binding.name.is_some() && literal_string(property) == binding.name } else { name_of(Some(property)) == binding.name }
    };
    container
        .descendants()
        .into_iter()
        .filter(|node| node.is("MemberExpression") && node.node("object").is_some_and(|object| object.is("ThisExpression")) && named(*node))
        .collect()
}

fn outer(mut node: Node) -> Node {
    while let Some(parent) = node.parent().filter(|parent| matches!(parent.kind(), "TSNonNullExpression" | "ChainExpression")) {
        node = parent;
    }
    node
}

fn member_use(parent: Node) -> Use {
    let method = name_of(parent.node("property")).unwrap_or_default();
    let call = parent.parent();
    let called = call.filter(|call| call.is("CallExpression") && call.node("callee") == Some(parent));
    match (called, method.as_str()) {
        (Some(call), "set" | "add" | "push" | "unshift") => Use::Add { call, method, key: None },
        (Some(_), "delete" | "clear" | "splice" | "shift" | "pop") => Use::Remove,
        (_, "length") if call.is_some_and(|call| call.is("AssignmentExpression")) => Use::Remove,
        _ => Use::Read { call: called, method: Some(method) },
    }
}

fn indexed_use(parent: Node) -> Use {
    match parent.parent() {
        Some(holder) if holder.is("AssignmentExpression") && holder.node("left") == Some(parent) => {
            Use::Add { call: holder, method: "index".to_string(), key: parent.node("property") }
        }
        Some(holder) if holder.is("UnaryExpression") && holder.text("operator").as_deref() == Some("delete") => Use::Remove,
        _ => Use::Read { call: None, method: None },
    }
}

pub fn use_kind(used: Node) -> Use {
    let target = outer(used);
    match target.parent() {
        Some(parent) if parent.is("MemberExpression") && parent.node("object") == Some(target) => {
            if parent.flag("computed") { indexed_use(parent) } else { member_use(parent) }
        }
        Some(parent) if parent.is("AssignmentExpression") && parent.node("left") == Some(target) => Use::Reassign,
        _ => Use::Escape,
    }
}

pub fn destructured_from_this(body: Node, name: Option<&str>) -> bool {
    body.descendants().into_iter().any(|node| {
        node.is("VariableDeclarator")
            && node.node("init").is_some_and(|init| init.is("ThisExpression"))
            && node.node("id").filter(|id| id.is("ObjectPattern")).is_some_and(|id| {
                id.nodes("properties").into_iter().any(|property| property.is("Property") && name_of(property.node("key")).as_deref() == name)
            })
    })
}

/// `addedValue`: what an add stores.
pub fn added_value<'v>(call: Node<'v>, method: &str) -> Option<Node<'v>> {
    if call.is("AssignmentExpression") {
        return call.node("right");
    }
    call.nodes("arguments").get(if method == "set" { 1 } else { 0 }).copied()
}
