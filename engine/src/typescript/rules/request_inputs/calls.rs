//! `request-calls.mts`: schemas parsed from a request part, Hono validators and Fastify route schemas.
use super::bindings::{import_of, is_from_package};
use super::fields::libraries::library_call;
use super::fields::schema_problems;
use super::fields::shapes::{initializer, is_property_assignment, object_entries};
use super::tree::{is_pa, key_name, lookup, member_text, string_like, Tree, T};
use super::Located;
use crate::typescript::rules::support::view::Node;

const PARSE_METHODS: [&str; 5] = ["parse", "safeParse", "parseAsync", "safeParseAsync", "spa"];
const QUERY_STRING: &str = "query string";
const HEADERS: &str = "headers";
const REQUEST_FIELDS: [(&str, &str); 3] = [("query", QUERY_STRING), ("params", "path"), ("headers", HEADERS)];
const REQUEST_NAMES: [&str; 3] = ["req", "request", "ctx"];
const REQUEST_MEMBERS: [&str; 2] = ["req", "request"];
const HONO_ACCESSORS: [(&str, &str); 4] = [("query", QUERY_STRING), ("queries", QUERY_STRING), ("param", "path"), ("header", HEADERS)];
const HONO_VALIDATORS: [&str; 3] = ["@hono/zod-validator", "@hono/valibot-validator", "@hono/standard-validator"];
const HONO_TARGETS: [(&str, &str); 4] = [("query", QUERY_STRING), ("param", "path"), ("header", HEADERS), ("form", "multipart form")];
const FASTIFY_PARTS: [(&str, &str); 3] = [("querystring", QUERY_STRING), ("params", "path"), ("headers", HEADERS)];

/// `unwrapped`: through parentheses, `as` and `!`.
pub fn unwrapped<'v>(tree: &Tree<'v>, node: T<'v>) -> T<'v> {
    let mut current = node.inner();
    while matches!(current.node.kind(), "TSAsExpression" | "TSNonNullExpression") {
        match tree.field(current.node, "expression") {
            Some(inner) => current = inner.inner(),
            None => break,
        }
    }
    current
}

pub fn is_request(node: T) -> bool {
    let Some(node) = node.bare() else { return false };
    if node.is("Identifier") {
        return node.name().is_some_and(|name| REQUEST_NAMES.contains(&name.as_ref()));
    }
    is_pa(node) && member_text(node).is_some_and(|name| REQUEST_MEMBERS.contains(&name.as_str()))
}

fn hono_accessor(tree: &Tree, call: Node) -> Option<String> {
    let callee = tree.field(call, "callee")?.bare().filter(|callee| is_pa(*callee))?;
    let owner = tree.field(callee, "object")?.bare().filter(|owner| is_pa(*owner))?;
    let accessor = call.nodes("arguments").is_empty() && member_text(owner).as_deref() == Some("req");
    if accessor { lookup(&HONO_ACCESSORS, &member_text(callee)?) } else { None }
}

pub fn transport_source(tree: &Tree, expression: Option<T>) -> Option<String> {
    let node = unwrapped(tree, expression?).node;
    if is_pa(node) {
        return if is_request(tree.field(node, "object")?) { lookup(&REQUEST_FIELDS, &member_text(node)?) } else { None };
    }
    if node.is("CallExpression") { hono_accessor(tree, node) } else { None }
}

pub fn callee_name(tree: &Tree, call: Node) -> Option<String> {
    if !call.is("CallExpression") {
        return None;
    }
    let callee = tree.field(call, "callee")?.bare()?;
    if is_pa(callee) {
        return member_text(callee);
    }
    if callee.is("Identifier") { callee.name().map(|name| name.into_owned()) } else { None }
}

struct Binding<'v> {
    schema: Option<T<'v>>,
    source: Option<String>,
}

fn parsed<'v>(tree: &Tree<'v>, call: Node<'v>) -> Option<Binding<'v>> {
    if !callee_name(tree, call).is_some_and(|name| PARSE_METHODS.contains(&name.as_str())) {
        return None;
    }
    let arguments = tree.fields(call, "arguments");
    let argument = |index: usize| arguments.get(index).copied().flatten();
    if library_call(tree, T { node: call, level: 0 }).is_some() {
        return Some(Binding { schema: argument(0), source: transport_source(tree, argument(1)) });
    }
    let callee = tree.field(call, "callee")?.bare().filter(|callee| is_pa(*callee))?;
    Some(Binding { schema: tree.field(callee, "object"), source: transport_source(tree, argument(0)) })
}

fn hono_validator<'v>(tree: &Tree<'v>, call: Node<'v>) -> Option<Binding<'v>> {
    let callee = tree.field(call, "callee")?.bare().filter(|callee| callee.is("Identifier"))?;
    let arguments = tree.fields(call, "arguments");
    let target = string_like(arguments.first().copied().flatten())?;
    let source = HONO_TARGETS.iter().find(|(key, _)| *key == target)?.1;
    let schema = arguments.get(1).copied().flatten();
    (import_of(tree, callee).is_some() && is_from_package(tree, Some(callee), &HONO_VALIDATORS)).then(|| Binding { schema, source: Some(source.to_string()) })
}

fn located<'v>(tree: &Tree<'v>, binding: Option<Binding<'v>>) -> Vec<Located<'v>> {
    let Some(Binding { schema: Some(schema), source: Some(source) }) = binding else { return Vec::new() };
    schema_problems(tree, Some(schema)).unwrap_or_default().into_iter().map(|finding| Located { finding, source: source.clone() }).collect()
}

pub fn call_problems<'v>(tree: &Tree<'v>, call: Node<'v>) -> Vec<Located<'v>> {
    let binding = parsed(tree, call).or_else(|| hono_validator(tree, call));
    located(tree, binding)
}

pub fn route_schema_problems<'v>(tree: &Tree<'v>, property: Node<'v>) -> Vec<Located<'v>> {
    if key_name(tree, property).as_deref() != Some("schema") {
        return Vec::new();
    }
    let Some(parts) = initializer(tree, property).and_then(T::bare).and_then(object_entries) else { return Vec::new() };
    parts.into_iter().filter(|part| is_property_assignment(*part)).flat_map(|part| {
        let source = key_name(tree, part).and_then(|name| lookup(&FASTIFY_PARTS, &name));
        located(tree, Some(Binding { schema: initializer(tree, part), source }))
    }).collect()
}
