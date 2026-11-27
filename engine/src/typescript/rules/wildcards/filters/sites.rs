//! `filter-sites.mts`: the values that go into a LIKE, `contains`, `startsWith` or regex filter, and the name of
//! the filter, in Prisma, Mongo-style, Sequelize, Knex, Drizzle, TypeORM and SQL tagged templates.
use crate::typescript::rules::escaping::is_js_word;
use crate::typescript::rules::patterns::syntax::callee_name_of;
use crate::typescript::rules::security_values::static_key;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::{quasi_text, string_value};
use regex::Regex;
use std::sync::LazyLock;

pub struct Site<'v> {
    pub value: Node<'v>,
    pub operator: String,
}

const PRISMA_METHODS: [&str; 8] = ["findMany", "findFirst", "findFirstOrThrow", "count", "deleteMany", "updateMany", "aggregate", "groupBy"];
const PRISMA_OPERATORS: [&str; 3] = ["contains", "startsWith", "endsWith"];
const EXACT_OPERATORS: [&str; 2] = ["equals", "not"];
const LIKE_KEYS: [&str; 5] = ["$like", "$ilike", "$notLike", "$notILike", "$regex"];
const SEQUELIZE_OPERATORS: [&str; 4] = ["like", "iLike", "notLike", "notILike"];
const LIKE_FUNCTIONS: [&str; 4] = ["like", "ilike", "notLike", "notIlike"];
const LIKE_WRAPPERS: [&str; 2] = ["Like", "ILike"];
const WHERE_LIKE_METHODS: [&str; 4] = ["whereLike", "whereILike", "orWhereLike", "orWhereILike"];
const WHERE_METHODS: [&str; 4] = ["where", "andWhere", "orWhere", "having"];
const LIKE_COMPARATORS: [&str; 4] = ["like", "ilike", "not like", "not ilike"];
const SQL_TAGS: [&str; 3] = ["sql", "$queryRaw", "$executeRaw"];
const MAX_LEVELS: usize = 8;
const SPACE: &str = r"\t\n\x0B\x0C\r\p{Z}\x{FEFF}";
static LIKE_OPERAND: LazyLock<Regex> = LazyLock::new(|| Regex::new(&format!("^(?i)(?:not[{SPACE}]+)?i?like[{SPACE}]*$")).expect("pattern"));

fn key_of(node: Node) -> Option<String> {
    if !node.is("Property") {
        return None;
    }
    let key = node.node("key")?;
    if node.flag("computed") && key.is("MemberExpression") {
        key.node("object").filter(|object| object.is("Identifier") && object.name().as_deref() == Some("Op"))?;
        let property = key.node("property").filter(|property| property.is("Identifier"))?;
        return Some(format!("Op.{}", property.name()?));
    }
    static_key(node)
}

fn prisma_call_above(node: Node) -> bool {
    let mut current = node;
    let mut where_seen = false;
    for _ in 0..MAX_LEVELS {
        let Some(holder) = current.parent() else { return false };
        where_seen = where_seen || key_of(holder).as_deref() == Some("where");
        if holder.is("CallExpression") {
            let name = holder.node("callee").and_then(callee_name_of);
            return where_seen && name.is_some_and(|name| PRISMA_METHODS.contains(&name.as_str()));
        }
        current = holder;
    }
    false
}

fn is_insensitive(object: Node) -> bool {
    object.nodes("properties").into_iter().any(|property| {
        key_of(property).as_deref() == Some("mode") && property.has("value") && string_value(property.node("value")).as_deref() == Some("insensitive")
    })
}

/// `propertySite`: a filter operator written as an object key.
pub fn property_site(property: Node) -> Option<Site> {
    let key = key_of(property)?;
    let owner = property.parent().filter(|owner| owner.is("ObjectExpression"))?;
    let operator = PRISMA_OPERATORS.contains(&key.as_str()) || (EXACT_OPERATORS.contains(&key.as_str()) && is_insensitive(owner));
    let prisma = operator && prisma_call_above(owner);
    let named = LIKE_KEYS.contains(&key.as_str()) || key.strip_prefix("Op.").is_some_and(|rest| SEQUELIZE_OPERATORS.contains(&rest));
    if prisma || named { Some(Site { value: property.node("value")?, operator: key }) } else { None }
}

/// `LIKE_OPERAND`, with `\b` as `u` and `i` together define it.
fn is_like_operand(text: &str) -> bool {
    let mut before: Option<char> = None;
    for (offset, character) in text.char_indices() {
        let boundary = !before.is_some_and(|before| is_js_word(before as u32)) && is_js_word(character as u32);
        if boundary && LIKE_OPERAND.is_match(&text[offset..]) {
            return true;
        }
        before = Some(character);
    }
    false
}

/// `templateSites`: the placeholders of a SQL tagged template that follow `LIKE`.
pub fn template_sites(node: Node) -> Vec<Site> {
    let tag = node.node("tag").and_then(callee_name_of).unwrap_or_default();
    let Some(quasi) = node.node("quasi").filter(|_| SQL_TAGS.contains(&tag.as_str())) else { return Vec::new() };
    let operand = |index: usize| is_like_operand(&quasi_text(quasi, index));
    quasi.nodes("expressions").into_iter().enumerate().filter(|(index, _)| operand(*index)).map(|(_, value)| Site { value, operator: "LIKE".to_string() }).collect()
}

/// `callSites`: a LIKE filter written as a call.
pub fn call_sites<'v>(node: Node<'v>) -> Vec<Site<'v>> {
    let Some(callee) = node.node("callee") else { return Vec::new() };
    let name = callee_name_of(callee).unwrap_or_default();
    let arguments = node.nodes("arguments");
    let (first, second, third) = (arguments.first().copied(), arguments.get(1).copied(), arguments.get(2).copied());
    let member = callee.is("MemberExpression");
    let site = |value: Node<'v>, operator: String| vec![Site { value, operator }];
    match (member, second, third) {
        (true, Some(second), _) if WHERE_LIKE_METHODS.contains(&name.as_str()) => site(second, name),
        (true, Some(second), Some(third)) if WHERE_METHODS.contains(&name.as_str()) => {
            let comparator = string_value(Some(second)).map(|text| text.to_lowercase());
            match comparator.filter(|comparator| LIKE_COMPARATORS.contains(&comparator.as_str())) {
                Some(comparator) => site(third, comparator.to_uppercase()),
                None => Vec::new(),
            }
        }
        (false, Some(second), _) if LIKE_FUNCTIONS.contains(&name.as_str()) && arguments.len() == 2 => site(second, name),
        (false, _, _) if LIKE_WRAPPERS.contains(&name.as_str()) && arguments.len() == 1 => first.map_or_else(Vec::new, |first| site(first, name)),
        _ => Vec::new(),
    }
}
