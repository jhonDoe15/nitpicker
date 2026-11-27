//! `originQuery` and `isFetched`: the TypeORM query a loop's items come from (`find`, `findBy`, a query
//! builder's `getMany`), and whether that query already loads a relation (`relations`, a join).
use super::schema::typeorm_declaration;
use crate::typescript::rules::effects::views::At;
use crate::typescript::rules::held_scopes::estree_calls::{call_view, is_function};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::kind as k;

const FINDERS: [&str; 2] = ["find", "findAndCount"];
const WHERE_FINDERS: [&str; 2] = ["findBy", "findAndCountBy"];
const JOINS: [&str; 6] = ["leftJoinAndSelect", "leftJoinAndMapMany", "leftJoinAndMapOne", "innerJoinAndSelect", "innerJoinAndMapMany", "innerJoinAndMapOne"];

pub struct QueryOrigin<'v> {
    pub call: Node<'v>,
    pub method: String,
    pub label: String,
    pub options: usize,
}

fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn nearest_function(node: Node) -> Option<Node> {
    node.ancestors().find(|ancestor| is_function(*ancestor))
}

/// `awaited`: the argument of an `await`, or the node.
pub fn awaited(node: Node) -> Option<Node> {
    if node.is("AwaitExpression") { node.node("argument") } else { Some(node) }
}

fn constant_query<'v>(scopes: &Scopes<'_, 'v>, identifier: Node<'v>, lp: Node<'v>) -> Option<Node<'v>> {
    let name = identifier.name()?;
    let variable = scopes.variable_by_name(&name, identifier.start())?;
    let definition = scopes.defs(variable).into_iter().next()?;
    let constant = definition.kind == DefKind::Variable && definition.node.parent().and_then(|declaration| declaration.text("kind")).as_deref() == Some("const");
    if !constant || nearest_function(definition.node) != nearest_function(lp) {
        return None;
    }
    awaited(definition.node.node("init")?)
}

fn query_call<'v>(scopes: &Scopes<'_, 'v>, iterable: Node<'v>, lp: Node<'v>) -> Option<Node<'v>> {
    let value = awaited(iterable)?;
    if value.is("Identifier") { constant_query(scopes, value, lp) } else { Some(value) }
}

fn property_handle(types: &mut Types, property: Node) -> Option<At> {
    let kind = if property.is("PrivateIdentifier") { k::PRIVATE_IDENTIFIER } else { k::IDENTIFIER };
    let found = types.handle_at(Some(kind), property.start(), property.end()).and_then(|handle| At::of(types, &handle));
    if found.is_none() {
        types.refuse("the compiler has no node for a method name of the file");
    }
    found
}

/// `originQuery`; `None` also when the compiler refused (the caller checks).
pub fn origin_query<'v>(types: &mut Types, scopes: &Scopes<'_, 'v>, iterable: Node<'v>, lp: Node<'v>) -> Option<QueryOrigin<'v>> {
    let call = query_call(scopes, iterable, lp).filter(|call| call.is("CallExpression"))?;
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression") && !callee.flag("computed"))?;
    let property = callee.node("property")?;
    let method = name_of(Some(property)).unwrap_or_default();
    let known = FINDERS.contains(&method.as_str()) || WHERE_FINDERS.contains(&method.as_str()) || method == "getMany";
    if !known {
        return None;
    }
    let name = property_handle(types, property)?;
    let declaration = typeorm_declaration(types, &name)?;
    let owner = declaration.parent();
    let managed = owner.is_some_and(|owner| {
        matches!(owner.kind(), k::CLASS_DECLARATION | k::CLASS_EXPRESSION | k::INTERFACE_DECLARATION)
            && owner.child("name").and_then(|name| name.text()).as_deref() == Some("EntityManager")
    });
    let label = call_view(call)?.label;
    Some(QueryOrigin { call, method, label, options: usize::from(managed) })
}

fn literal_text(node: Node) -> Option<String> {
    match node.get("value") {
        Value::Text(..) => node.text("value").map(|text| text.into_owned()),
        _ => None,
    }
}

fn names_relation(element: Option<Node>, relation: &str) -> bool {
    let Some(element) = element.filter(|element| element.is("Literal")) else { return true };
    literal_text(element).is_some_and(|text| text == relation || text.starts_with(&format!("{relation}.")))
}

fn relations_fetch(relations: Node, relation: &str) -> bool {
    if relations.is("ArrayExpression") {
        return relations.list("elements").into_iter().any(|element| names_relation(element, relation));
    }
    if !relations.is("ObjectExpression") {
        return true;
    }
    relations.nodes("properties").into_iter().any(|property| !property.is("Property") || property.flag("computed") || name_of(property.node("key")).as_deref() == Some(relation))
}

fn options_fetch(options: Option<Node>, relation: &str) -> bool {
    let Some(options) = options.filter(|options| options.is("ObjectExpression")) else { return options.is_some() };
    let relations = options.nodes("properties").into_iter().find(|property| !property.is("Property") || name_of(property.node("key")).as_deref() == Some("relations"));
    relations.is_some_and(|relations| !relations.is("Property") || relations.node("value").is_some_and(|value| relations_fetch(value, relation)))
}

fn member_call(node: Node) -> Option<Node> {
    node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression"))
}

fn joins_relation(call: Node, relation: &str) -> bool {
    let joins = member_call(call).and_then(|callee| name_of(callee.node("property"))).is_some_and(|name| JOINS.contains(&name.as_str()));
    let path = call.list("arguments").into_iter().next().flatten();
    joins && path.filter(|path| path.is("Literal")).is_none_or(|path| literal_text(path).is_some_and(|text| text.ends_with(&format!(".{relation}"))))
}

fn builder_fetches(call: Node, relation: &str) -> bool {
    let mut links = Vec::new();
    let mut next = member_call(call).and_then(|callee| callee.node("object"));
    while let Some(node) = next {
        let Some(callee) = member_call(node) else { break };
        links.push(node);
        next = callee.node("object");
    }
    let created = links.last().and_then(|root| member_call(*root)).and_then(|callee| name_of(callee.node("property"))).as_deref() == Some("createQueryBuilder");
    !created || links.iter().any(|link| joins_relation(*link, relation))
}

/// `isFetched`.
pub fn is_fetched(origin: &QueryOrigin, relation: &str) -> bool {
    if WHERE_FINDERS.contains(&origin.method.as_str()) {
        return false;
    }
    if FINDERS.contains(&origin.method.as_str()) {
        return options_fetch(origin.call.list("arguments").get(origin.options).copied().flatten(), relation);
    }
    builder_fetches(origin.call, relation)
}
