//! `no-falsy-default`: a parameter or a member read that may be left out is replaced by a default through `||`
//! or a ternary, so `0`, `''` and `false` count as not given.
use super::member_defaults::{MemberDefault, is_intentional_member_default};
use super::operands::{
    BIGINT_CLASS, BOOLEAN_CLASS, NUMBER_CLASS, STRING_CLASS, is_absent_value, is_condition, is_logical, is_member_read, is_outer_chain,
    literal_class, or_operands,
};
use crate::typescript::rules::Context;
use crate::typescript::rules::signatures::is_function;
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::type_flags;
use std::collections::BTreeSet;

const RULE: &str = "no-falsy-default";
const NULLISH: u32 = type_flags::UNDEFINED | type_flags::NULL | type_flags::VOID;
const WIDE_CLASSES: &[(u32, &str)] = &[(type_flags::STRING, STRING_CLASS), (type_flags::NUMBER, NUMBER_CLASS), (type_flags::BIG_INT, BIGINT_CLASS)];

struct Scope<'c, 'a, 's> {
    scopes: &'c Scopes<'a, 's>,
    types: &'c std::cell::RefCell<Types>,
    text: &'a str,
}

fn message(name: &str) -> String {
    format!(
        "`{name}` is replaced by the default whenever it is falsy, so `0`, `''` and `false` count as not given. Default only \
         `undefined` with `??` (`limit ?? DEFAULT_LIMIT`), or test `limit === undefined`."
    )
}

fn falsy_class(part: &Type) -> Option<&'static str> {
    if let Some((_, class)) = WIDE_CLASSES.iter().find(|(flag, _)| part.flags & flag != 0) {
        return Some(class);
    }
    let value = part.value.as_ref();
    if part.flags & type_flags::BOOLEAN_LITERAL != 0 {
        let falsy = part.intrinsic_name.as_deref() == Some("false") || value.and_then(serde_json::Value::as_bool) == Some(false);
        return falsy.then_some(BOOLEAN_CLASS);
    }
    if part.flags & type_flags::STRING_LITERAL != 0 {
        return (value.and_then(|value| value.as_str()) == Some("")).then_some(STRING_CLASS);
    }
    let zero = value.and_then(serde_json::Value::as_f64) == Some(0.0);
    (part.flags & type_flags::NUMBER_LITERAL != 0 && zero).then_some(NUMBER_CLASS)
}

/// `falsyClasses`: the falsy classes of a union that also holds `undefined`, `null` or `void`.
fn falsy_classes(types: &mut Types, kind: &Type) -> BTreeSet<&'static str> {
    let parts = if kind.flags & type_flags::UNION != 0 { types.parts(kind).to_vec() } else { vec![kind.clone()] };
    if !parts.iter().any(|part| part.flags & NULLISH != 0) {
        return BTreeSet::new();
    }
    parts.iter().filter_map(falsy_class).collect()
}

fn is_parameter(scopes: &Scopes, identifier: Node) -> bool {
    let definition = scopes.variable_named(identifier).and_then(|symbol| scopes.defs(symbol).into_iter().next());
    definition.is_some_and(|definition| definition.kind == DefKind::Parameter && is_function(definition.node))
}

fn check_default<'v>(scope: &Scope<'_, '_, 'v>, report: Node<'v>, identifiers: &[Node<'v>], fallback: Node<'v>) -> Vec<Node<'v>> {
    let clears_value = is_absent_value(fallback);
    let final_class = literal_class(fallback);
    let mut found = Vec::new();
    for identifier in identifiers.iter().copied() {
        let member = is_member_read(identifier);
        let kept = if identifier.is("Identifier") { is_parameter(scope.scopes, identifier) } else { member };
        if !kept {
            continue;
        }
        let kind = scope.types.borrow_mut().type_at(identifier.start(), identifier.end());
        let classes = kind.map(|kind| falsy_classes(&mut scope.types.borrow_mut(), &kind)).unwrap_or_default();
        if scope.types.borrow().refused.is_some() {
            return Vec::new();
        }
        let flag_member = member && classes.len() == 1 && classes.contains(BOOLEAN_CLASS);
        if clears_value && !flag_member {
            continue;
        }
        let use_ = MemberDefault { member: identifier, fallback, classes: &classes, operands: identifiers.len() };
        if member && is_intentional_member_default(&use_) {
            continue;
        }
        let equal = classes.len() == 1 && final_class.is_some_and(|class| classes.contains(class));
        if !classes.is_empty() && !equal && !is_condition(report) {
            found.push(identifier);
        }
    }
    found
}

fn defaults_at<'v>(scope: &Scope<'_, '_, 'v>, node: Node<'v>) -> Vec<Node<'v>> {
    if is_logical(node, "||") && is_outer_chain(node) {
        let operands = or_operands(node);
        let Some((fallback, identifiers)) = operands.split_last() else { return Vec::new() };
        return check_default(scope, node, identifiers, *fallback);
    }
    let (Some(test), Some(consequent), Some(alternate)) = (node.node("test"), node.node("consequent"), node.node("alternate")) else {
        return Vec::new();
    };
    let source = |node: Node| &scope.text[node.start() as usize..node.end() as usize];
    let read = test.is("Identifier") || is_member_read(test);
    if node.is("ConditionalExpression") && read && source(test) == source(consequent) {
        return check_default(scope, node, &[test], alternate);
    }
    Vec::new()
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let scope = Scope { scopes, types, text: context.file.text };
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("LogicalExpression") || node.is("ConditionalExpression")) {
        found.extend(defaults_at(&scope, node));
        if types.borrow().refused.is_some() {
            return;
        }
    }
    for identifier in found {
        let name = &scope.text[identifier.start() as usize..identifier.end() as usize];
        context.report_range(RULE, identifier.start(), Some(identifier.end()), message(name));
    }
}
