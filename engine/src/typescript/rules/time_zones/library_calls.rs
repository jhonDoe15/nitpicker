//! `library-calls.mts`: luxon, date-fns, dayjs and moment calls that read the server's zone, unless the call
//! names a zone or the chain after it settles one.
use super::bindings::{binding_of, library_path, property_name};
use super::date_calls::object_keys;
use super::tables::{
    CHAIN_READS, DATE_FNS_CALENDAR, DATE_FNS_PACKAGES, DAYJS_FACTORIES, DAYJS_PACKAGES, LOCAL_ZONE_NAMES, LUXON_FACTORIES, LUXON_PACKAGES,
    LUXON_ZONE_KEYS, Library, SUB_DAY_UNITS, WITH_OFFSET, ZONE_PACKAGES, ZONED_DATE_TYPES, luxon_option_position,
};
use super::{Env, Problem};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::testing_library::nodes::string_literal;

fn chained_method<'v>(call: Node<'v>) -> Option<(Option<String>, Node<'v>)> {
    let member = call.parent()?;
    let outer = member.parent()?;
    (member.is("MemberExpression") && member.node("object") == Some(call) && outer.is("CallExpression") && outer.node("callee") == Some(member))
        .then(|| (property_name(member), outer))
}

fn is_sub_day_comparison(call: Node) -> bool {
    let arguments = call.nodes("arguments");
    arguments.len() <= 1 || arguments.get(1).and_then(|unit| string_literal(Some(*unit))).is_some_and(|unit| SUB_DAY_UNITS.contains(&unit.as_str()))
}

fn reads_instant(call: Node) -> bool {
    let Some(member) = call.parent() else { return false };
    let name = property_name(member);
    member.is("MemberExpression")
        && member.node("object") == Some(call)
        && member.parent().is_some_and(|parent| !parent.is("CallExpression"))
        && name.is_some_and(|name| CHAIN_READS.contains(&name.as_str()))
}

fn is_local_zone(node: Option<Node>) -> bool {
    string_literal(node).is_some_and(|zone| LOCAL_ZONE_NAMES.contains(&zone.as_str()))
}

fn settles_zone(call: Node, library: Library) -> bool {
    if reads_instant(call) {
        return true;
    }
    let Some((name, next)) = chained_method(call) else { return false };
    let name = name.unwrap_or_default();
    if library.zone_setters().contains(&name.as_str()) {
        return !is_local_zone(next.nodes("arguments").first().copied());
    }
    library.instants().contains(&name.as_str()) || (library.comparisons().contains(&name.as_str()) && is_sub_day_comparison(next))
}

fn zone_option<'v>(call: Node<'v>, keys: &[&str]) -> Vec<Node<'v>> {
    let mut found = Vec::new();
    for options in call.nodes("arguments").into_iter().filter_map(|argument| object_keys(Some(argument))) {
        found.extend(keys.iter().filter_map(|key| options.get(*key).copied()));
    }
    found
}

fn has_unknown_options(call: Node, factory: &str) -> bool {
    let options = luxon_option_position(factory).and_then(|position| call.nodes("arguments").get(position).copied());
    options.is_some_and(|options| !options.is("Literal") && object_keys(Some(options)).is_none())
}

pub fn luxon_problem(env: &Env, call: Node) -> Option<Problem> {
    let path = library_path(env.scopes, call.node("callee")?, &LUXON_PACKAGES)?;
    let factory = path.strip_prefix("DateTime.").filter(|factory| LUXON_FACTORIES.contains(factory))?;
    let zones = zone_option(call, &LUXON_ZONE_KEYS);
    let explicit = (!zones.is_empty() && !zones.iter().any(|zone| is_local_zone(Some(*zone)))) || has_unknown_options(call, factory);
    (!(explicit || settles_zone(call, Library::Luxon))).then(|| Problem::LuxonLocal(format!("DateTime.{factory}")))
}

fn is_zoned_argument(env: &Env, node: Option<Node>) -> bool {
    let Some(node) = node else { return false };
    let value = if node.is("NewExpression") || node.is("CallExpression") { node.node("callee") } else { None };
    if value.is_some_and(|value| library_path(env.scopes, value, &ZONE_PACKAGES).is_some()) {
        return true;
    }
    let names = env.types.borrow_mut().zone_type_names(node.start(), node.end());
    names.iter().any(|name| name.as_deref().is_some_and(|name| ZONED_DATE_TYPES.contains(&name)))
}

fn is_offset_text(node: Option<Node>) -> bool {
    string_literal(node).is_some_and(|text| WITH_OFFSET.is_match(&text))
}

pub fn date_fns_problem(env: &Env, call: Node) -> Option<Problem> {
    let path = library_path(env.scopes, call.node("callee")?, &DATE_FNS_PACKAGES)?;
    let last = path.split('.').next_back().unwrap_or_default();
    let name = last.strip_suffix("WithOptions").unwrap_or(last);
    if !DATE_FNS_CALENDAR.is_match(name) {
        return None;
    }
    let first = call.nodes("arguments").first().copied();
    let zoned = !zone_option(call, &["in", "timeZone"]).is_empty() || is_zoned_argument(env, first) || is_offset_text(first);
    (!zoned).then(|| Problem::DateFnsLocal(name.to_string()))
}

pub fn dayjs_problem(env: &Env, call: Node) -> Option<Problem> {
    let callee = call.node("callee")?;
    let root = if callee.is("MemberExpression") { callee.node("object")? } else { callee };
    let binding = binding_of(env.scopes, root, &DAYJS_PACKAGES)?;
    let path = library_path(env.scopes, callee, &DAYJS_PACKAGES)?;
    if !DAYJS_FACTORIES.contains(&path.as_str()) {
        return None;
    }
    let library = if binding.source.starts_with("moment") { "moment" } else { "dayjs" };
    let name = if path.is_empty() { format!("{library}()") } else { format!("{library}.{path}()") };
    (!settles_zone(call, Library::Dayjs)).then_some(Problem::DayjsLocal(name))
}
