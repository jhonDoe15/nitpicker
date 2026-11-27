//! `arrays/array-sinks.mts`: the runtime array a query call expands into one bound parameter per element, as an
//! `in` list or as the rows of a multi-row insert.
use crate::typescript::rules::queries::chains::{chain_steps, query_chain, step_names};
use crate::typescript::rules::queries::libraries::{Library, QueryScope};
use crate::typescript::rules::security_values::{member_name, string_value, unwrapped};
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

#[derive(Clone, Copy, PartialEq)]
pub enum SinkKind {
    In,
    Insert,
}

const IN_OPERATORS: [&str; 2] = ["in", "not in"];
const KNEX_IN: [&str; 7] = ["whereIn", "whereNotIn", "orWhereIn", "orWhereNotIn", "andWhereIn", "havingIn", "havingNotIn"];
const ID_IN: [&str; 3] = ["whereInIds", "andWhereInIds", "orWhereInIds"];
const DRIZZLE_IN: [&str; 2] = ["inArray", "notInArray"];
const OPERATOR_ARGUMENTS: usize = 3;
const INSERT_ROOTS: [&str; 3] = ["insertInto", "insert", "replaceInto"];

static REPOSITORY_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)repo(?:sitory)?$").expect("pattern"));

fn step_name(call: Node) -> Option<String> {
    call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression")).and_then(member_name)
}

fn argument(call: Node, index: usize) -> Option<Node> {
    call.nodes("arguments").get(index).copied()
}

fn imported_as(scope: &QueryScope, call: Node, sources: fn(&str) -> bool, names: &[&str]) -> bool {
    let callee = call.node("callee").map(unwrapped).filter(|callee| callee.is("Identifier"));
    let binding = callee.and_then(|callee| callee.name()).and_then(|name| scope.module.binding(&name));
    binding.is_some_and(|binding| sources(&binding.source) && binding.imported.as_deref().is_some_and(|imported| names.contains(&imported)))
}

fn is_typeorm_module(source: &str) -> bool {
    source == "typeorm" || source == "@nestjs/typeorm"
}

fn is_drizzle_module(source: &str) -> bool {
    source == "drizzle-orm" || source.starts_with("drizzle-orm/")
}

fn operator_sink<'s>(scope: &QueryScope, call: Node<'s>) -> Option<Node<'s>> {
    let operator = string_value(argument(call, 1).map(unwrapped)).map(|text| text.to_lowercase());
    let in_operator = operator.is_some_and(|operator| IN_OPERATORS.contains(&operator.as_str()));
    let builder = scope.has(Library::Kysely) || scope.has(Library::Knex);
    if call.nodes("arguments").len() == OPERATOR_ARGUMENTS && in_operator && builder { argument(call, 2) } else { None }
}

fn builder_sink<'s>(scope: &QueryScope<'_, '_, 's>, call: Node<'s>) -> Option<Node<'s>> {
    let name = step_name(call);
    let name = name.as_deref();
    if name.is_some_and(|name| KNEX_IN.contains(&name)) && (scope.has(Library::Knex) || query_chain(scope, call).is_some_and(|chain| chain.library == Library::Knex)) {
        return argument(call, 1);
    }
    if name.is_some_and(|name| ID_IN.contains(&name)) && scope.has(Library::QueryBuilder) { argument(call, 0) } else { None }
}

fn function_sink<'s>(scope: &QueryScope, call: Node<'s>) -> Option<Node<'s>> {
    if imported_as(scope, call, is_typeorm_module, &["In"]) {
        return argument(call, 0);
    }
    if imported_as(scope, call, is_drizzle_module, &DRIZZLE_IN) { argument(call, 1) } else { None }
}

fn insert_sink<'s>(scope: &QueryScope<'_, '_, 's>, call: Node<'s>) -> Option<Node<'s>> {
    let name = step_name(call);
    let steps = chain_steps(call).steps;
    let names = step_names(steps.iter());
    if name.as_deref() == Some("values") && INSERT_ROOTS.iter().any(|root| names.iter().any(|name| name.as_deref() == Some(*root))) {
        return argument(call, 0);
    }
    if name.as_deref() != Some("insert") || steps.is_empty() {
        return None;
    }
    let chain = query_chain(scope, call);
    if chain.as_ref().is_some_and(|chain| chain.library == Library::Knex) {
        return argument(call, 0);
    }
    let receiver = call.node("callee").filter(|callee| callee.is("MemberExpression")).and_then(|callee| callee.node("object")).map(unwrapped);
    let receiver_name = match receiver {
        Some(receiver) if receiver.is("MemberExpression") => member_name(receiver),
        Some(receiver) => receiver.name().map(|name| name.into_owned()),
        None => None,
    };
    let named = REPOSITORY_NAME.is_match(&receiver_name.unwrap_or_default());
    let repository = scope.has(Library::QueryBuilder) && steps.len() == 1 && (named || chain.is_some());
    if repository { call.nodes("arguments").last().copied() } else { None }
}

/// `arraySink`: the array a query call expands, and how.
pub fn array_sink<'s>(scope: &QueryScope<'_, '_, 's>, call: Node<'s>) -> Option<(SinkKind, Node<'s>)> {
    if let Some(array) = operator_sink(scope, call).or_else(|| builder_sink(scope, call)).or_else(|| function_sink(scope, call)) {
        return Some((SinkKind::In, array));
    }
    let rows = if scope.libraries.is_empty() { None } else { insert_sink(scope, call) };
    rows.map(|array| (SinkKind::Insert, array))
}
