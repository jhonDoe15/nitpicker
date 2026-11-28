//! `require-http-timeout`: an outbound HTTP call with no timeout, its client's defaults and the project's
//! defaults left aside.
mod clients;

use self::clients::{AXIOS, ClientScope, Found, axios_position, created_instance};
use super::config::{Config, config_state, constant_of, is_absent};
use crate::typescript::rules::Context;
use crate::typescript::rules::module_values::imported_function;
use crate::typescript::rules::security_values::{member_name, static_key, unwrapped, variable_of};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use std::collections::HashSet;

const RULE: &str = "require-http-timeout";
const MESSAGE: &str = "{{call}} has no timeout, so a server that never answers hangs this code for good. Give it a deadline: `fetch(url, { signal: AbortSignal.timeout(10_000) })`, `axios.get(url, { timeout: 10_000 })` or `{ signal: AbortSignal.timeout(10_000) }`, `https.get(url, { timeout: 10_000 })`, `got(url, { timeout: { request: 10_000 } })`; or set it once for the client: `axios.create({ timeout: 10_000 })`, `axios.defaults.timeout = 10_000`, `got.extend({ timeout: { request: 10_000 } })`, undici `setGlobalDispatcher(new Agent({ headersTimeout: 10_000, bodyTimeout: 10_000 }))`. An exception fits only when this call is meant to wait without a limit.";
const DISPATCHER_TIMEOUTS: [&str; 3] = ["headersTimeout", "bodyTimeout", "connectTimeout"];

fn member_object<'s>(node: Option<Node<'s>>, name: &str) -> Option<Node<'s>> {
    let target = unwrapped(node?);
    (target.is("MemberExpression") && member_name(target).as_deref() == Some(name)).then(|| target.node("object").map(unwrapped)).flatten()
}

fn defaults_timeout_owner<'s>(scopes: &Scopes<'_, 's>, assignment: Node<'s>) -> Option<String> {
    let instance = member_object(member_object(assignment.node("left"), "timeout"), "defaults")?;
    (instance.is("Identifier") && !is_absent(scopes, assignment.node("right"))).then(|| instance.name().map(|name| name.into_owned())).flatten()
}

fn has_dispatcher_timeout<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> bool {
    let created = constant_of(scopes, node).filter(|created| created.is("NewExpression"));
    let options = created.and_then(|created| created.list("arguments").first().copied().flatten()).map(unwrapped);
    let entries = options.filter(|options| options.is("ObjectExpression")).map(|options| options.nodes("properties")).unwrap_or_default();
    entries.into_iter().any(|entry| {
        entry.is("Property") && static_key(entry).is_some_and(|key| DISPATCHER_TIMEOUTS.contains(&key.as_str())) && !is_absent(scopes, entry.node("value"))
    })
}

fn timed_instance_call<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> bool {
    let Some(member) = identifier.parent().filter(|member| member.is("MemberExpression") && member.node("object") == Some(identifier)) else { return false };
    let Some(call) = member.parent().filter(|call| call.is("CallExpression") && call.node("callee") == Some(member)) else { return false };
    let Some(position) = axios_position(member_name(member).as_deref()) else { return false };
    let options = call.list("arguments").get(position).copied().flatten();
    matches!(config_state(scopes, options, &["timeout", "signal"]), Config::Set | Config::Unknown)
}

fn every_instance_call_timed<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> bool {
    let Some(instance) = created_instance(call) else { return false };
    let Some(variable) = variable_of(scopes, instance) else { return false };
    let reads: Vec<Node> = scopes.references(variable).into_iter().filter(|reference| reference.identifier != instance).map(|reference| reference.identifier).collect();
    !reads.is_empty() && reads.into_iter().all(|identifier| timed_instance_call(scopes, identifier))
}

struct Defaults {
    axios: bool,
    fetch: bool,
    owners: HashSet<String>,
}

fn covered(found: &Found, defaults: &Defaults) -> bool {
    if found.client == "fetch" {
        return defaults.fetch;
    }
    let owned = |name: &Option<String>| name.as_ref().is_some_and(|name| defaults.owners.contains(name));
    found.client == AXIOS && (defaults.axios || owned(&found.owner) || owned(&found.instance))
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let off = |key: &str| context.setting(&format!("{RULE}.{key}")) == Some("false");
    let project = context.setting(&format!("{RULE}.project-defaults")).unwrap_or_default();
    let project: Vec<&str> = project.split(',').collect();
    let mut defaults = Defaults { axios: project.contains(&AXIOS), fetch: project.contains(&"fetch"), owners: HashSet::new() };
    let scope = ClientScope::of(scopes, view.program(), !off("fetch"), !off("node-fetch-timeout"));
    let mut pending: Vec<(Node, Found)> = Vec::new();
    for node in view.nodes() {
        if node.is("AssignmentExpression") {
            defaults.owners.extend(defaults_timeout_owner(scopes, node));
        } else if node.is("CallExpression") {
            let callee = node.node("callee");
            let sets = callee.is_some_and(|callee| imported_function(scopes, callee, &scope.undici).as_deref() == Some("setGlobalDispatcher"));
            defaults.fetch = defaults.fetch || (sets && has_dispatcher_timeout(scopes, node.list("arguments").first().copied().flatten()));
            pending.extend(scope.client_call(node).map(|found| (node, found)));
        }
    }
    let reported: Vec<(Node, String)> = pending
        .into_iter()
        .filter(|(node, found)| !(covered(found, &defaults) || (found.call == "axios.create()" && every_instance_call_timed(scopes, *node))))
        .map(|(node, found)| (node, found.call))
        .collect();
    for (node, call) in reported {
        context.report_range(RULE, node.start(), Some(node.end()), MESSAGE.replace("{{call}}", &call));
    }
}
