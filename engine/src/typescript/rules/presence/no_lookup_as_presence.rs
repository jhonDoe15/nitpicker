//! `no-lookup-as-presence`: a stored `Map` value or record value is tested to decide whether its key is present,
//! though the value type allows an empty value that reads as missing.
use super::conditions::{enclosing_statement, presence_root, siblings_after, unwrapped};
use super::in_guards::{ends_with_throw, is_absent};
use super::map_lookups::{Lookup, only_stores_non_empty};
use super::{Facts, UNDEFINED, members};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::type_flags;
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-lookup-as-presence";
const NULLISH: u32 = UNDEFINED | type_flags::NULL;
const WIDE_FALSY: u32 = type_flags::STRING | type_flags::NUMBER | type_flags::BIG_INT;
const OWNERSHIP_CALLS: [&str; 3] = ["hasOwn", "hasOwnProperty", "has"];

static MISSING_REPORT: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)missing|required|not (?:provided|given|found|set)").expect("pattern"));

fn cache_message(map: &str, key: &str) -> String {
    format!(
        "`{map}.get({key})` is tested by its value to decide whether the key is stored, but this map can hold an empty value, \
         which reads as missing and is computed again. Test the key with `has`, then store with `set` when it is missing."
    )
}

const INDEX_MESSAGE: &str = "A record whose values are `unknown` can store `undefined`, so `record[key] !== undefined` cannot tell a missing key \
                             from a stored `undefined`. Test the key with `key in record` or `Object.hasOwn(record, key)`.";

#[derive(Clone, Copy, PartialEq)]
enum Kind {
    Truthy,
    Undefined,
    Nullish,
}

struct Test<'s> {
    operand: Node<'s>,
    kind: Kind,
    miss_when_true: bool,
}

fn comparison_test(node: Node) -> Option<Test> {
    let right = node.node("right")?;
    let absent = if right.is("Identifier") && right.name().as_deref() == Some("undefined") {
        "undefined"
    } else if is_absent(right) {
        "null"
    } else {
        return None;
    };
    let operator = node.text("operator")?;
    let strict = matches!(operator.as_ref(), "===" | "!==");
    let loose = matches!(operator.as_ref(), "==" | "!=");
    if !(strict || loose) || (strict && absent == "null") {
        return None;
    }
    Some(Test { operand: node.node("left")?, kind: if strict { Kind::Undefined } else { Kind::Nullish }, miss_when_true: operator.starts_with('=') })
}

fn test_of(node: Node) -> Option<Test> {
    let target = unwrapped(node);
    match target.kind() {
        "UnaryExpression" if target.text("operator").as_deref() == Some("!") => {
            Some(Test { operand: target.node("argument")?, kind: Kind::Truthy, miss_when_true: true })
        }
        "UnaryExpression" => None,
        "BinaryExpression" => comparison_test(target),
        _ => Some(Test { operand: target, kind: Kind::Truthy, miss_when_true: false }),
    }
}

fn is_falsy_literal(kind: &Type) -> bool {
    let value = kind.value.as_ref();
    if kind.flags & type_flags::STRING_LITERAL != 0 {
        return value.and_then(|value| value.as_str()) == Some("");
    }
    if kind.flags & type_flags::NUMBER_LITERAL != 0 {
        return value.and_then(serde_json::Value::as_f64) == Some(0.0);
    }
    kind.flags & type_flags::BOOLEAN_LITERAL != 0 && (kind.intrinsic_name.as_deref() == Some("false") || value.and_then(serde_json::Value::as_bool) == Some(false))
}

fn exits(branch: Node) -> bool {
    let last = if branch.is("BlockStatement") { branch.nodes("body").last().copied() } else { Some(branch) };
    last.is_some_and(|last| matches!(last.kind(), "ReturnStatement" | "ThrowStatement" | "ContinueStatement"))
}

fn miss_region<'s>(node: Node<'s>, test: &Test) -> Vec<Node<'s>> {
    let taken = node.node("consequent");
    if test.miss_when_true {
        return taken.into_iter().collect();
    }
    let after = if node.is("IfStatement") && taken.is_some_and(exits) { siblings_after(node) } else { Vec::new() };
    let mut region: Vec<Node> = node.node("alternate").into_iter().collect();
    region.extend(after);
    region
}

fn is_falsy_node(node: Node) -> bool {
    node.is("Literal")
        && match node.get("value") {
            Value::Number(number) => number == 0.0,
            Value::Bool(flag) => !flag,
            _ => node.text("value").is_some_and(|text| text.is_empty()),
        }
}

fn checks_key(root: Node) -> bool {
    root.descendants().into_iter().any(|node| {
        if node.is("BinaryExpression") {
            return node.text("operator").as_deref() == Some("in");
        }
        let callee = node.node("callee").filter(|_| node.is("CallExpression"));
        let named = callee.and_then(|callee| if callee.is("MemberExpression") { callee.node("property") } else { Some(callee) });
        named.and_then(|named| named.name()).is_some_and(|name| OWNERSHIP_CALLS.contains(&name.as_ref()))
    })
}

impl<'s> Facts<'_, '_, 's> {
    fn can_be_falsy(&self, kind: &Type) -> bool {
        let mut types = self.types.borrow_mut();
        members(&mut types, kind).iter().any(|part| {
            if part.flags & (NULLISH | type_flags::UNKNOWN | WIDE_FALSY) != 0 || is_falsy_literal(part) {
                return true;
            }
            if part.flags & type_flags::TYPE_PARAMETER == 0 {
                return false;
            }
            types.base_constraint(part).is_none_or(|constraint| constraint.flags & type_flags::UNKNOWN != 0)
        })
    }

    fn is_wide_primitive(&self, kind: &Type) -> bool {
        let mut types = self.types.borrow_mut();
        let literal = type_flags::STRING_LITERAL | type_flags::NUMBER_LITERAL;
        members(&mut types, kind).iter().all(|part| part.flags & WIDE_FALSY != 0 || (part.flags & literal != 0 && !is_falsy_literal(part)))
    }

    fn hides_stored_value(&self, kind: Kind, value_type: &Type) -> bool {
        let flags = match kind {
            Kind::Truthy => return self.can_be_falsy(value_type),
            Kind::Undefined => UNDEFINED | type_flags::UNKNOWN,
            Kind::Nullish => NULLISH | type_flags::UNKNOWN,
        };
        members(&mut self.types.borrow_mut(), value_type).iter().any(|part| part.flags & flags != 0)
    }

    fn stores_hidden_value(&self, kind: Kind, lookup: &Lookup<'s>, region: &[Node<'s>]) -> bool {
        let stores = self.store_calls(region, lookup);
        let never_empty = kind == Kind::Truthy && self.is_wide_primitive(&lookup.value_type) && only_stores_non_empty(&stores, region);
        !stores.is_empty() && !never_empty && self.hides_stored_value(kind, &lookup.value_type)
    }

    fn check_branch(&self, node: Node<'s>, found: &mut Vec<(Node<'s>, String)>) {
        let Some(test_node) = node.node("test") else { return };
        let Some(test) = test_of(test_node) else { return };
        let Some(lookup) = self.bound_lookup(test.operand) else { return };
        if self.stores_hidden_value(test.kind, &lookup, &miss_region(node, &test)) {
            found.push((test_node, self.cache_report(&lookup)));
        }
    }

    fn cache_report(&self, lookup: &Lookup) -> String {
        cache_message(&self.plain_text(lookup.receiver), &self.plain_text(lookup.key))
    }

    fn check_fallback(&self, node: Node<'s>, found: &mut Vec<(Node<'s>, String)>) {
        let operator = node.text("operator");
        let (Some(left), Some(right)) = (node.node("left"), node.node("right")) else { return };
        if operator.as_deref() == Some("&&") {
            return;
        }
        let Some(lookup) = self.lookup_of(left) else { return };
        if operator.as_deref() == Some("||") && is_falsy_node(right) {
            return;
        }
        let kind = if operator.as_deref() == Some("??") { Kind::Nullish } else { Kind::Truthy };
        let mut region = vec![right];
        region.extend(siblings_after(enclosing_statement(node)));
        if self.stores_hidden_value(kind, &lookup, &region) {
            found.push((node, self.cache_report(&lookup)));
        }
    }

    fn reports_missing(&self, root: Node) -> bool {
        let taken = root.parent().filter(|parent| parent.is("IfStatement") && parent.node("test") == Some(root)).and_then(|parent| parent.node("consequent"));
        let last = taken.and_then(|taken| if taken.is("BlockStatement") { taken.nodes("body").last().copied() } else { Some(taken) });
        let Some(last) = last else { return false };
        let reported = last.node("argument").filter(|_| last.is("ReturnStatement"));
        ends_with_throw(last) || reported.is_some_and(|argument| MISSING_REPORT.is_match(&self.text[argument.start() as usize..argument.end() as usize]))
    }

    fn is_unknown_index_test(&self, node: Node<'s>) -> bool {
        let operator = node.text("operator");
        let (Some(left), Some(right)) = (node.node("left"), node.node("right")) else { return false };
        let property = left.node("property");
        if !matches!(operator.as_deref(), Some("===" | "!==")) || !is_absent(right) || !left.is("MemberExpression") || !left.flag("computed") || property.is_none_or(|property| property.is("Literal")) {
            return false;
        }
        let Some(object) = left.node("object") else { return false };
        let indexed = {
            let mut types = self.types.borrow_mut();
            let Some(found) = types.type_at(object.start(), object.end()) else {
                types.refuse("no type for an indexed object");
                return false;
            };
            let Some(kind) = types.non_nullable(&found) else { return false };
            types.string_index_type(&kind)
        };
        let root = presence_root(node);
        indexed.is_some_and(|indexed| indexed.flags & type_flags::UNKNOWN != 0) && root.is_some_and(|root| !checks_key(root) && !self.reports_missing(root))
    }
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let facts = Facts { scopes, types, text: context.file.text };
    let mut found = Vec::new();
    for node in view.nodes() {
        match node.kind() {
            "IfStatement" | "ConditionalExpression" => facts.check_branch(node, &mut found),
            "LogicalExpression" => facts.check_fallback(node, &mut found),
            "BinaryExpression" if facts.is_unknown_index_test(node) => found.push((node, INDEX_MESSAGE.to_string())),
            _ => {}
        }
        if types.borrow().refused.is_some() {
            return;
        }
    }
    for (node, message) in found {
        context.report_range(RULE, node.start(), Some(node.end()), message);
    }
}
