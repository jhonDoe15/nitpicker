//! `no-in-presence-check`: `'key' in object` is true for a key stored as `undefined`, and the type of the object
//! allows that.
use super::conditions::condition_root;
use super::in_guards::InCheck;
use super::{Facts, UNDEFINED, members};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::Type;

const RULE: &str = "no-in-presence-check";

fn message(key: &str, object: &str) -> String {
    format!(
        "`'{key}' in {object}` is true when the key exists with the value `undefined`, and this type allows that. Test \
         `{object}.{key} !== undefined` (or `!= null`), or add `Object.hasOwn({object}, '{key}') && ...` when both are meant."
    )
}

fn key_of(node: Node) -> Option<String> {
    let left = node.node("left").filter(|left| left.is("Literal"))?;
    left.text("value").map(|value| value.into_owned())
}

fn declared_value_type(types: &mut Types, part: &Type, key: &str, at: Node) -> Option<Type> {
    match types.property(part, key) {
        Some(property) => types.symbol_type_at(&property, at.start(), at.end()),
        None => types.string_index_type(part),
    }
}

fn can_hold_undefined(types: &mut Types, node: Node, key: &str) -> bool {
    let Some(right) = node.node("right") else { return false };
    let Some(found) = types.type_at(right.start(), right.end()) else {
        types.refuse("no type for the object of an in check");
        return false;
    };
    let Some(kind) = types.non_nullable(&found) else {
        types.refuse("no non-nullable type for the object of an in check");
        return false;
    };
    let mut values = Vec::new();
    for part in members(types, &kind) {
        let part = types.base_constraint(&part).unwrap_or(part);
        values.push(declared_value_type(types, &part, key, right));
    }
    let mut flags = Vec::new();
    for value in &values {
        flags.push(value.as_ref().map(|value| members(types, value).iter().map(|part| part.flags & UNDEFINED != 0).collect::<Vec<_>>()));
    }
    !flags.is_empty()
        && flags.iter().all(|parts| parts.as_ref().is_some_and(|parts| !parts.iter().all(|has| *has)))
        && flags.iter().any(|parts| parts.as_ref().is_some_and(|parts| parts.iter().any(|has| *has)))
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let facts = Facts { scopes, types, text: context.file.text };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("BinaryExpression") && node.text("operator").as_deref() == Some("in")) {
        let Some(key) = key_of(node) else { continue };
        let Some(root) = condition_root(node) else { continue };
        if facts.is_value_handled(&InCheck { node, root, key: &key }) {
            continue;
        }
        let hit = can_hold_undefined(&mut types.borrow_mut(), node, &key);
        if types.borrow().refused.is_some() {
            return;
        }
        if hit {
            found.push((node, key));
        }
    }
    for (node, key) in found {
        let object = node.node("right").map(|right| facts.plain_text(right)).unwrap_or_default();
        context.report_range(RULE, node.start(), Some(node.end()), message(&key, &object));
    }
}
