//! `order/query-options.mts`: the page keys (`take`, `skip`, `cursor`, `limit`, `offset`) of a find call's
//! options, and of the relations it loads, that have no order key beside them.
use crate::typescript::rules::queries::libraries::{Library, QueryScope};
use crate::typescript::rules::security_values::{member_name, static_key, unwrapped};
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

const PAGE_KEYS: [&str; 5] = ["take", "skip", "cursor", "limit", "offset"];
const ORDER_KEYS: [&str; 2] = ["orderBy", "order"];
const NESTED_KEYS: [&str; 3] = ["include", "select", "with"];
const MAX_NESTING: usize = 3;
const ORM_FINDERS: [&str; 4] = ["find", "findAndCount", "findAll", "findAndCountAll"];

static ORM_MODULES: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:typeorm|@nestjs/typeorm|sequelize|sequelize-typescript|@sequelize/core|@nestjs/sequelize|@mikro-orm/[^\n\r\x{2028}\x{2029}]+)$").expect("pattern")
});

fn object(node: Option<Node>) -> Option<Node> {
    node.filter(|node| node.is("ObjectExpression"))
}

fn properties(object: Node) -> Vec<Node> {
    object.nodes("properties").into_iter().filter(|property| property.is("Property")).collect()
}

/// `unorderedPage`: the last property of the first page key, when the object has no order key and no spread.
fn unordered_page(object: Node) -> Option<Node> {
    if object.nodes("properties").iter().any(|property| !property.is("Property")) {
        return None;
    }
    let keyed: Vec<(String, Node)> = properties(object).into_iter().filter_map(|property| static_key(property).map(|key| (key, property))).collect();
    let mut keys: Vec<&str> = Vec::new();
    for (key, _) in &keyed {
        if !keys.contains(&key.as_str()) {
            keys.push(key);
        }
    }
    let page = keys.iter().find(|key| PAGE_KEYS.contains(key))?;
    if keys.iter().any(|key| ORDER_KEYS.contains(key)) {
        return None;
    }
    keyed.iter().rfind(|(key, _)| key == page).map(|(_, property)| *property)
}

fn nested_objects(object: Node) -> Vec<Node> {
    properties(object)
        .into_iter()
        .filter(|property| static_key(*property).is_some_and(|key| NESTED_KEYS.contains(&key.as_str())))
        .filter_map(|property| self::object(property.node("value").map(unwrapped)))
        .flat_map(properties)
        .filter_map(|relation| self::object(relation.node("value").map(unwrapped)))
        .collect()
}

fn relation_pages(object: Node) -> Vec<Node> {
    let mut pending: Vec<(Node, usize)> = nested_objects(object).into_iter().map(|relation| (relation, 0)).collect();
    let mut pages = Vec::new();
    let mut at = 0;
    while at < pending.len() {
        let (relation, depth) = pending[at];
        at += 1;
        pages.extend(unordered_page(relation));
        if depth < MAX_NESTING {
            pending.extend(nested_objects(relation).into_iter().map(|child| (child, depth + 1)));
        }
    }
    pages
}

fn uses_orm(scope: &QueryScope) -> bool {
    scope.module.sources().any(|source| ORM_MODULES.is_match(source)) || scope.has(Library::QueryBuilder)
}

/// `unorderedOptionPages`: the unordered page keys of a find call's option objects.
pub fn unordered_option_pages<'s>(scope: &QueryScope<'_, '_, 's>, call: Node<'s>) -> Vec<Node<'s>> {
    let callee = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression"));
    let name = callee.and_then(member_name);
    let name = name.as_deref();
    let top_level = name == Some("findMany") || (name.is_some_and(|name| ORM_FINDERS.contains(&name)) && uses_orm(scope));
    if !(top_level || name.is_some_and(|name| name.starts_with("find"))) {
        return Vec::new();
    }
    let objects = call.nodes("arguments").into_iter().filter_map(|argument| object(Some(unwrapped(argument))));
    objects.flat_map(|object| if top_level { unordered_page(object) } else { None }.into_iter().chain(relation_pages(object))).collect()
}
