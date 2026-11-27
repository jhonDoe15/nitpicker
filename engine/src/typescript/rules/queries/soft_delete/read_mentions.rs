//! `read-mentions.mts`: the tables an ORM read names (its own and the joined ones), the soft-delete columns and
//! filter helpers the call mentions for each, and whether it reads deleted rows on purpose.
use super::columns::{COLUMN_NAMES, column_key, is_acknowledgement, is_column, is_helper_name, set_column};
use crate::typescript::rules::html_text::parts::{is_js_space, js_trim};
use crate::typescript::rules::orm_sites::table_names::table_key;
use crate::typescript::rules::orm_sites::{ChainStep, FoundSite, OrmKind, first_string, orm_site};
use crate::typescript::rules::queries::js_patterns::{Folded, js_pattern};
use crate::typescript::rules::urls::values::string_value;
use crate::typescript::rules::support::view::{Node, Value};
use regex::Regex;
use std::sync::LazyLock;

const JOINS: [&str; 6] = ["join", "innerJoin", "leftJoin", "rightJoin", "fullJoin", "leftOuterJoin"];
const RELATION_KEYS: [&str; 7] = ["include", "select", "relations", "join", "with", "populate", "orderBy"];

static ALIAS: LazyLock<Regex> = LazyLock::new(|| js_pattern(r"^\s*[\w.]+\s+(?:as\s+)?(\w+)\s*$", true));
static COLUMN_IN_TEXT: LazyLock<Regex> =
    LazyLock::new(|| js_pattern(&format!(r#"(?:["'`]?([a-z_]\w*)["'`]?\.)?["'`]?\b({COLUMN_NAMES})\b["'`]?(\s*(?:is\b|in\b|not\b|[=<>!]))?"#), true));

struct Mention {
    prefix: Option<String>,
    column: String,
}

/// `TableEntry`: a table the read names, its alias, and the filter columns and helpers it applies to it.
pub struct TableEntry {
    pub table: Option<String>,
    alias: Option<String>,
    pub columns: Vec<(String, String)>,
    pub helpers: Vec<String>,
}

pub struct Mentions {
    pub tables: Vec<TableEntry>,
    pub acknowledged: bool,
}

fn alias_of(text: Option<&str>) -> Option<String> {
    let folded = Folded::of(text.unwrap_or_default());
    let found = ALIAS.captures(&folded.text)?.get(1)?;
    Some(folded.slice(found.start(), found.end()).to_string())
}

fn entry(table: Option<String>, alias: Option<String>) -> TableEntry {
    TableEntry { table, alias, columns: Vec::new(), helpers: Vec::new() }
}

fn joined_table(step: &ChainStep) -> Option<TableEntry> {
    let args = step.args.as_ref();
    let first = args.and_then(|args| args.first().copied());
    let second = args.and_then(|args| args.get(1).copied());
    if let Some(text) = first_string(args) {
        let head: String = text.chars().take_while(|character| !is_js_space(*character)).collect();
        if head.contains('.') {
            return None;
        }
        return Some(entry(table_key(Some(&text)), alias_of(Some(&text)).or_else(|| string_value(second))));
    }
    let named = first.filter(|first| first.is("Identifier")).and_then(|first| first.name()).map(|name| name.into_owned())?;
    Some(entry(table_key(Some(&named)), Some(named)))
}

fn builder_alias(steps: &[ChainStep]) -> Option<String> {
    let args = steps.iter().find(|step| step.name.as_deref() == Some("createQueryBuilder")).and_then(|step| step.args.as_ref())?;
    string_value(args.first().copied()).or_else(|| string_value(args.get(1).copied()))
}

fn tables_of(found: &FoundSite) -> Vec<TableEntry> {
    let steps = &found.chain.steps;
    let alias = builder_alias(steps).or_else(|| alias_of(first_string(steps.iter().find(|step| step.args.is_some()).and_then(|step| step.args.as_ref())).as_deref()));
    let joined = steps.iter().filter(|step| step.name.as_deref().is_some_and(|name| JOINS.contains(&name))).filter_map(joined_table);
    std::iter::once(entry(found.site.table.clone(), alias)).chain(joined).collect()
}

fn name_of(node: Node) -> Option<String> {
    if node.is("Identifier") {
        return node.name().map(|name| name.into_owned());
    }
    if node.is("MemberExpression") && !node.flag("computed") {
        return node.node("property").and_then(|property| property.name()).map(|name| name.into_owned());
    }
    if node.is("Literal") { string_value(Some(node)) } else { None }
}

fn is_lone_column_argument(node: Node, text: &str) -> bool {
    let first = node.parent().is_some_and(|parent| parent.is("CallExpression") && parent.nodes("arguments").first() == Some(&node));
    first && is_column(Some(js_trim(text)))
}

fn template_raw(node: Node) -> String {
    let raws: Vec<String> = node
        .nodes("quasis")
        .into_iter()
        .map(|quasi| match quasi.get("value") {
            Value::Node(index) => quasi.view.at(index).text("raw").map(|raw| raw.into_owned()).unwrap_or_default(),
            _ => String::new(),
        })
        .collect();
    raws.join("?")
}

fn text_mentions(node: Node) -> Vec<Mention> {
    let text = string_value(Some(node)).or_else(|| node.is("TemplateLiteral").then(|| template_raw(node)));
    let Some(text) = text else { return Vec::new() };
    if is_lone_column_argument(node, &text) {
        return vec![Mention { prefix: None, column: js_trim(&text).to_string() }];
    }
    let folded = Folded::of(&text);
    COLUMN_IN_TEXT
        .captures_iter(&folded.text)
        .filter(|found| found.get(1).is_some() || found.get(3).is_some())
        .filter_map(|found| {
            let column = found.get(2)?;
            let prefix = found.get(1).map(|prefix| folded.slice(prefix.start(), prefix.end()).to_string());
            Some(Mention { prefix, column: folded.slice(column.start(), column.end()).to_string() })
        })
        .collect()
}

fn column_mentions(node: Node) -> Vec<Mention> {
    if node.is("Property") {
        let column = node.node("key").and_then(name_of);
        return column.filter(|column| is_column(Some(column))).map(|column| Mention { prefix: None, column }).into_iter().collect();
    }
    if node.is("MemberExpression") && !node.flag("computed") {
        let column = node.node("property").and_then(|property| property.name()).map(|name| name.into_owned());
        let prefix = node.node("object").and_then(name_of);
        return column.filter(|column| is_column(Some(column))).map(|column| Mention { prefix, column }).into_iter().collect();
    }
    Vec::new()
}

fn helper_names(node: Node) -> Vec<String> {
    if !node.is("CallExpression") {
        return Vec::new();
    }
    node.node("callee")
        .into_iter()
        .chain(node.nodes("arguments"))
        .filter(|callee| !callee.is("Literal"))
        .filter_map(name_of)
        .filter(|name| is_helper_name(Some(name)))
        .collect()
}

fn acknowledges(node: Node) -> bool {
    if node.is("Identifier") {
        return is_acknowledgement(node.name().as_deref());
    }
    node.is("Property") && is_acknowledgement(node.node("key").and_then(name_of).as_deref())
}

fn is_relation_key(node: Node) -> bool {
    node.is("Property") && node.node("key").and_then(name_of).is_some_and(|name| RELATION_KEYS.contains(&name.as_str()))
}

fn collect(root: Node) -> (Vec<Mention>, Vec<String>, bool) {
    let mut mentions = Vec::new();
    let mut helpers: Vec<String> = Vec::new();
    let mut acknowledged = false;
    let mut pending = vec![root];
    let mut index = 0;
    while index < pending.len() {
        let node = pending[index];
        index += 1;
        mentions.extend(text_mentions(node));
        if is_relation_key(node) {
            continue;
        }
        mentions.extend(column_mentions(node));
        for name in helper_names(node) {
            if !helpers.contains(&name) {
                helpers.push(name);
            }
        }
        acknowledged = acknowledged || acknowledges(node);
        pending.extend(node.children());
    }
    (mentions, helpers, acknowledged)
}

/// `readMentions`.
pub fn read_mentions(call: Node, orms: &[String]) -> Option<Mentions> {
    let found = orm_site(call, OrmKind::Read, orms)?;
    found.site.table.as_ref()?;
    let mut tables = tables_of(&found);
    let (mentions, helpers, acknowledged) = collect(call);
    for Mention { prefix, column } in mentions {
        let owner = match &prefix {
            None => tables.first_mut(),
            Some(prefix) => {
                let keyed = table_key(Some(prefix));
                tables.iter_mut().find(|each| each.alias.as_deref() == Some(prefix.as_str()) || each.table == keyed)
            }
        };
        if let Some(owner) = owner {
            set_column(&mut owner.columns, column_key(&column), column);
        }
    }
    if let Some(primary) = tables.first_mut() {
        primary.helpers = helpers;
    }
    Some(Mentions { tables, acknowledged })
}
