//! `no-listing-order-in-assertions`: a directory listing or glob result compared with an ordered list.
use super::listing_calls::{ListingBindings, MOCKING_MODULES, is_listing_call, listing_bindings, mocks_listing, name_of};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_checks::is_expect_call;

const RULE: &str = "no-listing-order-in-assertions";
const MESSAGE: &str = "Directory listings and glob results come in the order the file system returns, which differs between file systems and machines, so this ordered comparison passes on one and fails on another. Sort the result first (`.sort()` or `.toSorted()`), or compare without order (`expect.arrayContaining` with a length check, or a `Set`).";
const ORDER_KEEPING: [&str; 2] = ["map", "filter"];
const REORDERING: [&str; 2] = ["sort", "reverse"];
const ORDERED_MATCHERS: [&str; 2] = ["toEqual", "toStrictEqual"];
const ORDERED_ASSERTS: [&str; 2] = ["deepEqual", "deepStrictEqual"];
const ASSERT_OWNERS: [&str; 2] = ["assert", "t"];
const MIN_EXPECTED: usize = 2;

fn unwrap(mut node: Node) -> Node {
    loop {
        let inner = match node.kind() {
            "AwaitExpression" => node.node("argument"),
            "TSAsExpression" | "TSNonNullExpression" | "TSTypeAssertion" | "ChainExpression" => node.node("expression"),
            _ => None,
        };
        let Some(inner) = inner else { return node };
        node = inner;
    }
}

fn named(node: Option<Node>, set: &[&str]) -> bool {
    name_of(node).is_some_and(|name| set.contains(&name.as_str()))
}

fn order_kept_source(value: Node) -> Option<Node> {
    let callee = value.node("callee").filter(|callee| value.is("CallExpression") && callee.is("MemberExpression"))?;
    if named(callee.node("property"), &ORDER_KEEPING) { callee.node("object") } else { None }
}

fn is_listing_value(scopes: &Scopes, bindings: &ListingBindings, node: Node) -> bool {
    let mut pending = vec![unwrap(node)];
    while let Some(value) = pending.pop() {
        if is_listing_call(scopes, bindings, value) {
            return true;
        }
        pending.extend(order_kept_source(value).map(unwrap));
    }
    false
}

fn is_ordered_list(node: Option<Node>) -> bool {
    let Some(node) = node.filter(|node| node.is("ArrayExpression")) else { return false };
    let elements = node.list("elements");
    elements.len() >= MIN_EXPECTED && elements.iter().all(|element| element.is_some_and(|element| !element.is("SpreadElement")))
}

fn first(call: Node) -> Option<Node> {
    call.list("arguments").first().copied().flatten()
}

fn actual_of(call: Node) -> Option<Node> {
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    let object = callee.node("object");
    if named(callee.node("property"), &ORDERED_MATCHERS) && is_expect_call(object) && is_ordered_list(first(call)) {
        return object.and_then(first);
    }
    let arguments = call.list("arguments");
    let owned = named(callee.node("property"), &ORDERED_ASSERTS) && named(object, &ASSERT_OWNERS);
    if owned && is_ordered_list(arguments.get(1).copied().flatten()) { first(call) } else { None }
}

fn is_reordered(identifier: Node) -> bool {
    let Some(parent) = identifier.parent() else { return false };
    if parent.is("MemberExpression") && parent.node("object") == Some(identifier) {
        return named(parent.node("property"), &REORDERING);
    }
    parent.is("CallExpression") && parent.nodes("arguments").contains(&identifier) && !is_expect_call(Some(parent))
}

fn holds_listing(scopes: &Scopes, bindings: &ListingBindings, node: Node) -> bool {
    let Some(symbol) = super::find_variable(scopes, node) else { return false };
    let defs = scopes.defs(symbol);
    let [definition] = defs.as_slice() else { return false };
    let sole = definition.kind == DefKind::Variable && definition.node.is("VariableDeclarator") && definition.node.node("id").is_some_and(|id| id.is("Identifier"));
    let Some(init) = definition.node.node("init").filter(|_| sole) else { return false };
    let references = scopes.references(symbol);
    let written = references.iter().any(|reference| super::is_write(reference) && reference.identifier != definition.name);
    !written && is_listing_value(scopes, bindings, init) && !references.iter().any(|reference| super::is_read(reference) && is_reordered(reference.identifier))
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let mut mocked = false;
    let mut actuals = Vec::new();
    for node in view.nodes() {
        if node.is("ImportDeclaration") {
            mocked |= node.node("source").and_then(|source| source.text("value")).is_some_and(|source| MOCKING_MODULES.contains(&source.as_ref()));
        }
        if node.is("CallExpression") {
            mocked |= mocks_listing(node);
            actuals.extend(actual_of(node).map(|actual| (node, actual)));
        }
    }
    if mocked || actuals.is_empty() {
        return;
    }
    let bindings = listing_bindings(view.program());
    let found: Vec<(u32, u32)> = actuals
        .into_iter()
        .filter(|(_, actual)| {
            let value = unwrap(*actual);
            if value.is("Identifier") { holds_listing(scopes, &bindings, value) } else { is_listing_value(scopes, &bindings, value) }
        })
        .map(|(call, _)| (call.start(), call.end()))
        .collect();
    for (start, end) in found {
        context.report_range(RULE, start, Some(end), MESSAGE.to_string());
    }
}
