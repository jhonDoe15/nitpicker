//! `require-client-timeout`: database clients (pg, postgres.js, TypeORM, Sequelize, Knex) without a statement
//! timeout and AWS SDK clients without a request timeout.
mod options;
mod orm;

use self::options::{Options, State, either, options_of, postgres_options_state, references_of_declared, text_state};
use self::orm::{orm_options_timeout, sequelize_url_timeout};
use crate::typescript::rules::Context;
use crate::typescript::rules::database::modules::{ModuleScope, OrmBinding, callee_label, constructed_name};
use crate::typescript::rules::security_values::{defs, member_name, resolved_value, static_key, unwrapped, variable_of};
use crate::typescript::rules::support::scope::{DefKind, ScopeKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::urls::values::string_value;
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "require-client-timeout";
const DATABASE: &str = "{{client}} has no statement timeout, so a stuck query holds this request and its pool connection for good. Set one where the client is built: `statement_timeout: 30_000` in the pg options, TypeORM `extra`, Sequelize `dialectOptions`, or the Knex and postgres.js `connection`. An exception fits only when this client is meant to wait without a limit, such as a migration runner, or when the database role sets the timeout.";
const AWS: &str = "{{client}} has no request timeout, so a call that never answers holds this code for good. Set it once for the client: `requestHandler: { connectionTimeout: 5_000, requestTimeout: 30_000, throwOnRequestTimeout: true }`. An exception fits only when this client is meant to wait without a limit.";
const PG_MODULES: [&str; 2] = ["pg", "pg-pool"];
const PG_CLASSES: [&str; 2] = ["Pool", "Client"];
const HANDLERS: [&str; 3] = ["NodeHttpHandler", "NodeHttp2Handler", "FetchHttpHandler"];

static AWS_MODULE: LazyLock<Regex> = LazyLock::new(|| Regex::new("^@aws-sdk/client-").expect("aws"));
static CLASS_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("^[A-Z]").expect("class"));
static NOT_CLIENT: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?:Command|Exception|Input|Output)$").expect("not client"));

/// `Timeout`: a database or AWS client, its name for the message, and what its options say.
pub struct Timeout {
    pub aws: bool,
    pub name: Option<String>,
    pub state: State,
}

struct Made {
    source: String,
    imported: Option<String>,
    name: Option<String>,
}

fn copied(binding: &OrmBinding) -> OrmBinding {
    OrmBinding { source: binding.source.clone(), imported: binding.imported.clone() }
}

fn module_binding<'s>(scope: &ModuleScope<'_, '_, 's>, target: Node<'s>) -> Option<OrmBinding> {
    let variable = variable_of(scope.scopes, target)?;
    let top = scope.scopes.scope_of(variable).is_some_and(|(kind, _)| matches!(kind, ScopeKind::Module | ScopeKind::Global));
    if !top {
        return None;
    }
    let name = target.name()?;
    let definition = defs(scope.scopes, target).into_iter().next();
    let declarator = definition.filter(|definition| definition.kind == DefKind::Variable).map(|definition| definition.node);
    let pattern = declarator.and_then(|declarator| declarator.node("id")).filter(|pattern| pattern.is("ObjectPattern"));
    let init = declarator.and_then(|declarator| declarator.node("init")).map(unwrapped).filter(|init| init.is("Identifier"));
    let namespace = init.and_then(|init| init.name()).and_then(|init| scope.binding(&init)).filter(|_| pattern.is_some());
    if let (Some(pattern), Some(namespace)) = (pattern, namespace.filter(|namespace| namespace.imported.as_deref() == Some("*"))) {
        let property = pattern.nodes("properties").into_iter().find(|entry| entry.is("Property") && entry.node("value").and_then(|value| value.name()).as_deref() == Some(name.as_ref()));
        return Some(OrmBinding { source: namespace.source.clone(), imported: property.and_then(static_key) });
    }
    scope.binding(&name).map(copied)
}

fn binding_of<'s>(scope: &ModuleScope<'_, '_, 's>, node: Node<'s>) -> Option<OrmBinding> {
    let target = unwrapped(node);
    if target.is("Identifier") { module_binding(scope, target) } else { None }
}

fn constructed<'s>(scope: &ModuleScope<'_, '_, 's>, callee: Node<'s>) -> Option<Made> {
    let target = unwrapped(callee);
    if target.is("Identifier") {
        return binding_of(scope, target).map(|binding| Made { name: binding.imported.clone(), source: binding.source, imported: binding.imported });
    }
    if !target.is("MemberExpression") {
        return None;
    }
    let object = unwrapped(target.node("object")?);
    let owner_node = if object.is("MemberExpression") && member_name(object).as_deref() == Some("native") { object.node("object")? } else { object };
    let owner = binding_of(scope, owner_node).filter(|owner| owner.imported.as_deref() == Some("*"))?;
    Some(Made { source: owner.source, imported: owner.imported, name: member_name(target) })
}

fn is_aws_client(made: &Made) -> bool {
    let name = made.name.as_deref().unwrap_or_default();
    AWS_MODULE.is_match(&made.source) && CLASS_NAME.is_match(name) && !NOT_CLIENT.is_match(name)
}

fn is_pg_client(made: &Made) -> bool {
    if made.source == "pg-pool" {
        return made.name.as_deref() == Some("*");
    }
    PG_MODULES.contains(&made.source.as_str()) && made.name.as_deref().is_some_and(|name| PG_CLASSES.contains(&name))
}

fn listens_on_connect<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    references_of_declared(scopes, node.parent()).iter().any(|reference| {
        let member = reference.identifier.parent().filter(|member| member.is("MemberExpression") && member_name(*member).as_deref() == Some("on"));
        let call = member.and_then(|member| member.parent()).filter(|call| call.is("CallExpression"));
        call.is_some_and(|call| string_value(call.list("arguments").first().copied().flatten()).as_deref() == Some("connect"))
    })
}

fn request_timeout_state<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> State {
    let Some(options) = options_of(scopes, node) else { return State::Unknown };
    either(&[options.key_state("requestTimeout"), options.key_state("socketTimeout")])
}

fn handler_state<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> State {
    let Some(value) = resolved_value(scopes, Some(node)) else { return State::Unknown };
    if value.is("ObjectExpression") {
        return request_timeout_state(scopes, Some(value));
    }
    let handler = |name: Option<String>| name.is_some_and(|name| HANDLERS.contains(&name.as_str()));
    let created = value.is("CallExpression") && handler(callee_label(value).map(|label| label.split('.').next().unwrap_or_default().to_string())) && constructed_name(value).as_deref() == Some("create");
    if !((value.is("NewExpression") && handler(constructed_name(value))) || created) {
        return State::Unknown;
    }
    let arguments = value.list("arguments");
    if arguments.is_empty() { State::Missing } else { request_timeout_state(scopes, arguments[0]) }
}

fn aws_state<'s>(scopes: &Scopes<'_, 's>, config: Option<Node<'s>>) -> State {
    if config.is_none() {
        return State::Missing;
    }
    let Some(options) = options_of(scopes, config) else { return State::Unknown };
    options.nested_state("requestHandler", handler_state)
}

fn connection_state<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> State {
    options_of(scopes, Some(node)).map_or(State::Unknown, |options: Options| options.key_state("statement_timeout"))
}

fn postgres_js_state<'s>(scopes: &Scopes<'_, 's>, arguments: &[Option<Node<'s>>]) -> State {
    let head = arguments.first().copied().flatten();
    let first = options_of(scopes, head);
    let url = if first.is_none() { head } else { None };
    let opened = first.is_none();
    let settings = if opened { options_of(scopes, arguments.get(1).copied().flatten()) } else { first };
    let url_state = if url.is_none() { State::Missing } else { text_state(scopes, url, State::Missing) };
    match settings {
        None if arguments.len() > 1 && opened => either(&[url_state, State::Unknown]),
        None => url_state,
        Some(settings) => either(&[url_state, settings.nested_state("connection", connection_state)]),
    }
}

fn client_timeout<'s>(scope: &ModuleScope<'_, '_, 's>, node: Node<'s>) -> Option<Timeout> {
    let made = constructed(scope, node.node("callee")?)?;
    let arguments = node.list("arguments");
    let config = arguments.first().copied().flatten();
    let constructs = node.is("NewExpression");
    if constructs && is_aws_client(&made) {
        return Some(Timeout { aws: true, name: made.name.clone(), state: aws_state(scope.scopes, config) });
    }
    if constructs && is_pg_client(&made) {
        let name = if made.name.as_deref() == Some("*") { Some("Pool".to_string()) } else { made.name.clone() };
        let state = if listens_on_connect(scope.scopes, node) { State::Unknown } else { postgres_options_state(scope.scopes, config) };
        return Some(Timeout { aws: false, name: Some(format!("pg {}", name.as_deref().unwrap_or("undefined"))), state });
    }
    let postgres = node.is("CallExpression") && made.source == "postgres" && made.name.as_deref() == Some("*");
    postgres.then(|| Timeout { aws: false, name: Some("postgres()".to_string()), state: postgres_js_state(scope.scopes, &arguments) })
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let scope = ModuleScope::of(view, scopes, context.file.text);
    let mut found: Vec<(Node, Timeout)> = Vec::new();
    for node in view.nodes() {
        let timeout = match node.kind() {
            "NewExpression" => client_timeout(&scope, node).or_else(|| sequelize_url_timeout(&scope, node)),
            "CallExpression" => client_timeout(&scope, node),
            "ObjectExpression" => orm_options_timeout(&scope, node),
            _ => None,
        };
        found.extend(timeout.filter(|timeout| timeout.state == State::Missing).map(|timeout| (node, timeout)));
    }
    for (node, timeout) in found {
        let message = if timeout.aws { AWS } else { DATABASE };
        let name = timeout.name.unwrap_or_else(|| "undefined".to_string());
        context.report_range(RULE, node.start(), Some(node.end()), message.replace("{{client}}", &name));
    }
}
