//! `lookups.mts`: whether a value reaches a search, filter or lookup: a lookup call's argument, a text or filter
//! key of a query object, or a parameter of SQL text.
use super::super::escaping::is_js_word;
use super::super::request_inputs::bindings::is_function_like;
use super::super::request_inputs::calls::callee_name;
use super::super::request_inputs::{is_literal_property, is_object_literal};
use super::super::request_inputs::tree::{is_pa, key_name, member_text, string_like, view_parent, Tree, T};
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

const WORD: &str = "[A-Za-z0-9_]";
const TEXT_KEYS: [&str; 5] = ["contains", "startsWith", "endsWith", "equals", "search"];
const FILTER_KEYS: [&str; 2] = ["where", "filter"];
const PASS_THROUGH: [&str; 4] = ["toLowerCase", "toUpperCase", "toString", "normalize"];

static IDENTIFIER_NAME: LazyLock<Regex> = LazyLock::new(|| {
    let suffix = "Id|Ids|Uuid|Guid|Key|Token|Code|Slug|Hash|Status|Type|Role|Kind";
    let whole = format!("{suffix}|Sort|Order|Page|Limit|Offset|Cursor").to_lowercase();
    Regex::new(&format!("(?:^|[a-z])(?:{suffix})$|^(?:{whole})$")).expect("identifier names")
});
static LOOKUP_CALL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!("^(?:Like|ILike|like|ilike|notLike|eq|ne|Equal|where|andWhere|orWhere|whereLike|whereILike|having|search{WORD}*|find{WORD}*By{WORD}*)$")).expect("lookup calls")
});
static FIND_BY: LazyLock<Regex> = LazyLock::new(|| Regex::new(&format!("^find{WORD}*By")).expect("find by"));
static FILTER_CALL: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(?:find|findOne|findAll|findBy|findOneBy|countBy|existsBy|exists|count|countDocuments)$").expect("filter calls"));
static SQL_CALL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(?:query|execute|raw|queryRaw|\$queryRaw|\$queryRawUnsafe|all|get|run)$").expect("sql calls"));
static SQL_WORD: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)^(?:where|like|having)").expect("sql words"));

pub fn is_identifier_name(name: Option<&str>) -> bool {
    name.is_some_and(|name| IDENTIFIER_NAME.is_match(name))
}

/// `/\b(?:where|like|having)\b/iu`: under `/iu` a word character is ASCII or U+017F or U+212A.
fn sql_text(text: &str) -> bool {
    let characters: Vec<(usize, char)> = text.char_indices().collect();
    characters.iter().enumerate().any(|(index, (at, _))| {
        let before = index.checked_sub(1).map(|previous| characters[previous].1);
        if before.is_some_and(|before| is_js_word(before as u32)) {
            return false;
        }
        let Some(found) = SQL_WORD.find(&text[*at..]) else { return false };
        text[*at + found.end()..].chars().next().is_none_or(|after| !is_js_word(after as u32))
    })
}

fn is_call(node: Node) -> bool {
    node.is("CallExpression") || node.is("ImportExpression")
}

fn is_pass_through_call(tree: &Tree, parent: Node, current: T) -> bool {
    if !parent.is("CallExpression") || current.level > 0 {
        return false;
    }
    let callee = tree.field(parent, "callee");
    callee == Some(current) && is_pa(current.node) && member_text(current.node).is_some_and(|name| PASS_THROUGH.contains(&name.as_str()))
}

fn is_assignment(node: Node) -> bool {
    node.is("AssignmentExpression") || (node.is("AssignmentPattern") && node.parent().is_some_and(|parent| !parent.is("Property") || !parent.flag("shorthand")) && super::super::request_inputs::order::is_assignment_pattern(node))
}

/// One step of `climbed`: the compiler's parent when it lets the value through, else none.
fn passes_through<'v>(tree: &Tree<'v>, current: T<'v>) -> Option<T<'v>> {
    let parent = tree.parent(current)?;
    if parent.node == current.node {
        return Some(parent);
    }
    let parent = parent.node;
    let child = current.node;
    let first = |key: &str| tree.field(parent, key) == Some(current);
    let passes = match parent.kind() {
        "TSAsExpression" | "TSNonNullExpression" | "TemplateLiteral" => true,
        "BinaryExpression" | "LogicalExpression" => first("left") || parent.text("operator").as_deref() == Some("+"),
        "AssignmentExpression" => first("left"),
        "AssignmentPattern" => is_assignment(parent) && first("left"),
        "SequenceExpression" => parent.nodes("expressions").first() == Some(&child),
        "ConditionalExpression" => !first("test"),
        "MemberExpression" => {
            let through = is_pa(parent) && first("object") && member_text(parent).is_some_and(|name| PASS_THROUGH.contains(&name.as_str()));
            through && tree.parent(T { node: parent, level: 0 }).is_some_and(|above| above.level == 0 && above.node != parent && is_call(above.node))
        }
        "CallExpression" => is_pass_through_call(tree, parent, current),
        _ => false,
    };
    passes.then_some(T { node: parent, level: 0 })
}

fn climbed<'v>(tree: &Tree<'v>, node: T<'v>) -> T<'v> {
    let mut current = node;
    while let Some(parent) = passes_through(tree, current) {
        current = parent;
    }
    current
}

fn in_call_argument(tree: &Tree, call: Node, node: T) -> bool {
    let Some(name) = callee_name(tree, call) else { return false };
    if !tree.fields(call, "arguments").contains(&Some(node)) {
        return false;
    }
    LOOKUP_CALL.is_match(&name) && !is_identifier_name(Some(&FIND_BY.replace(&name, "")))
}

fn filter_keys<'v>(tree: &Tree<'v>, node: Node<'v>) -> (Vec<Option<String>>, Option<Node<'v>>) {
    let mut keys = Vec::new();
    for current in node.ancestors() {
        if current.is("Property") && is_literal_property(current) {
            keys.push(key_name(tree, current));
        }
        if is_call(current) || is_function_like(current) {
            return (keys, is_call(current).then_some(current));
        }
    }
    (keys, None)
}

fn in_filter_object(tree: &Tree, property: Node, key: Option<&str>) -> bool {
    if is_identifier_name(key) {
        return false;
    }
    if key.is_some_and(|key| TEXT_KEYS.contains(&key)) {
        return true;
    }
    let (keys, call) = filter_keys(tree, property);
    let direct = keys.is_empty() && call.is_some_and(|call| FILTER_CALL.is_match(&callee_name(tree, call).unwrap_or_default()));
    direct || keys.iter().any(|outer| outer.as_deref().is_some_and(|outer| FILTER_KEYS.contains(&outer)))
}

fn in_sql(tree: &Tree, node: T) -> bool {
    let Some(array) = tree.parent(node).filter(|array| array.node != node.node && array.is("ArrayExpression")) else { return false };
    let Some(call) = tree.parent(array).filter(|call| call.node != array.node && call.is("CallExpression")) else { return false };
    if !tree.fields(call.node, "arguments").contains(&Some(array)) {
        return false;
    }
    let first = tree.fields(call.node, "arguments").first().copied().flatten();
    SQL_CALL.is_match(&callee_name(tree, call.node).unwrap_or_default()) && string_like(first).is_some_and(|text| sql_text(&text))
}

/// The shorthand property a name stands in, in the compiler's tree: `{ name }` or a target's `{ name = value }`.
fn shorthand_of(node: Node) -> Option<Node> {
    let parent = view_parent(node)?;
    let defaulted = parent.is("AssignmentPattern") && (parent.node("left") == Some(node) || parent.node("right") == Some(node));
    let property = if defaulted { parent.parent()? } else { parent };
    let held = property.is("Property") && property.flag("shorthand") && property.parent().is_some_and(is_object_literal);
    held.then_some(property)
}

pub fn reaches_lookup(tree: &Tree, expression: T) -> bool {
    let node = climbed(tree, expression);
    if let Some(property) = shorthand_of(node.node) {
        return in_filter_object(tree, property, property.node("key").and_then(|key| key.name()).as_deref());
    }
    let Some(parent) = tree.parent(node).filter(|parent| parent.node != node.node) else { return in_sql(tree, node) };
    if is_call(parent.node) {
        return parent.node.is("CallExpression") && in_call_argument(tree, parent.node, node);
    }
    if parent.node.is("Property") && is_literal_property(parent.node) && tree.field(parent.node, "value") == Some(node) {
        return in_filter_object(tree, parent.node, key_name(tree, parent.node).as_deref());
    }
    in_sql(tree, node)
}
