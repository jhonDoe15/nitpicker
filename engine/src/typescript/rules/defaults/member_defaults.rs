//! `isIntentionalMemberDefault`: a member read whose default is how the code fills absent text or a flag on
//! purpose, so it is not reported.
use super::operands::{BOOLEAN_CLASS, STRING_CLASS, is_identifier_named, unwrapped};
use crate::typescript::rules::support::view::{Node, Value};
use regex::Regex;
use std::collections::BTreeSet;
use std::sync::LazyLock;

const FRESH_VALUES: &[&str] = &["CallExpression", "NewExpression", "AwaitExpression"];

static NAME_LIKE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)(?:name|title|label|url|uri|path|dir|host|mode|token|id|message|stack|file|slug|key|locale|scope|mime|type)$")
        .expect("pattern")
});

pub struct MemberDefault<'v, 'c> {
    pub member: Node<'v>,
    pub fallback: Node<'v>,
    pub classes: &'c BTreeSet<&'static str>,
    pub operands: usize,
}

fn member_name(node: Node) -> Option<String> {
    let target = unwrapped(node);
    if !target.is("MemberExpression") {
        return target.is("Identifier").then(|| target.name().map(|name| name.into_owned())).flatten();
    }
    if target.flag("computed") {
        return None;
    }
    target.node("property").and_then(|property| property.name()).map(|name| name.into_owned())
}

fn is_text_literal(node: Node) -> bool {
    (node.is("Literal") && matches!(node.get("value"), Value::Text(..))) || node.is("TemplateLiteral")
}

fn is_name_like(node: Node) -> bool {
    NAME_LIKE.is_match(&member_name(node).unwrap_or_default())
}

fn is_string_default_of_absent_text(use_: &MemberDefault) -> bool {
    is_text_literal(use_.fallback)
        || FRESH_VALUES.contains(&unwrapped(use_.fallback).kind())
        || is_name_like(use_.member)
        || is_name_like(use_.fallback)
}

fn is_flag_chain(use_: &MemberDefault) -> bool {
    let target = unwrapped(use_.fallback);
    let same_name = member_name(use_.member) == member_name(target);
    let absent = is_identifier_named(target, "undefined");
    use_.operands > 1 || (!target.is("Literal") && !absent && !same_name)
}

pub fn is_intentional_member_default(use_: &MemberDefault) -> bool {
    if use_.classes.len() != 1 {
        return false;
    }
    if use_.classes.contains(STRING_CLASS) {
        return is_string_default_of_absent_text(use_);
    }
    use_.classes.contains(BOOLEAN_CLASS) && is_flag_chain(use_)
}
