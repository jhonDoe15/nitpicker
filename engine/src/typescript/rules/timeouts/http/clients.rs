//! `http-clients.mts` and `http-modules.mts`: the outbound HTTP calls of fetch, node-fetch, undici, axios, got and
//! Node's `http`, and the options each reads its timeout from.
use super::super::config::{config_nodes, config_state, constant_of, is_callback, is_local_url, lacks_timeout};
use crate::typescript::rules::module_values::{Bindings, bindings_of, imported_function};
use crate::typescript::rules::security_values::{defs, member_name, unwrapped, variable_of};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

pub const AXIOS: &str = "axios";
const FETCH: &str = "fetch";
const GOT_METHODS: [&str; 7] = ["get", "post", "put", "patch", "delete", "head", "stream"];
const HTTP_METHODS: [&str; 2] = ["request", "get"];
const CHAINED_LISTENERS: [&str; 5] = ["on", "once", "prependListener", "setHeader", "setNoDelay"];
const GLOBAL_OBJECTS: [&str; 4] = ["globalThis", "window", "self", "global"];
const TIMEOUT_KEYS: [&str; 2] = ["timeout", "signal"];
const AXIOS_CALL_POSITIONS: [(&str, usize); 11] =
    [("request", 0), ("get", 1), ("delete", 1), ("head", 1), ("options", 1), ("post", 2), ("put", 2), ("patch", 2), ("postForm", 2), ("putForm", 2), ("patchForm", 2)];
static REQUEST_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("^(?:request|req)$").expect("request name"));

pub struct ClientScope<'c, 'a, 's> {
    pub scopes: &'c Scopes<'a, 's>,
    pub check_fetch: bool,
    pub node_fetch_timeout: bool,
    fetch_modules: Bindings,
    node_fetch: Bindings,
    pub undici: Bindings,
    axios: Bindings,
    got: Bindings,
    http: Bindings,
}

/// `Found`: the client, the call as the message names it, and for axios the owner and the created instance.
pub struct Found {
    pub client: &'static str,
    pub call: String,
    pub owner: Option<String>,
    pub instance: Option<String>,
}

fn found(client: &'static str, call: String) -> Option<Found> {
    Some(Found { client, call, owner: None, instance: None })
}

/// `axiosPosition`: where an axios method takes its config.
pub fn axios_position(method: Option<&str>) -> Option<usize> {
    AXIOS_CALL_POSITIONS.iter().find(|(name, _)| Some(*name) == method).map(|(_, position)| *position)
}

/// `createdInstance`: the name a `const x = axios.create()` declares.
pub fn created_instance(call: Node) -> Option<Node> {
    let holder = call.parent().filter(|holder| holder.is("VariableDeclarator") && holder.node("init") == Some(call))?;
    holder.node("id").filter(|id| id.is("Identifier"))
}

fn argument(call: Node, index: usize) -> Option<Node> {
    call.list("arguments").get(index).copied().flatten()
}

fn chained_listener(call: Node) -> Option<Node> {
    let owner = call.parent().filter(|owner| owner.is("MemberExpression") && owner.node("object") == Some(call))?;
    let listener = member_name(owner).is_some_and(|name| CHAINED_LISTENERS.contains(&name.as_str()));
    owner.parent().filter(|outer| listener && outer.is("CallExpression") && outer.node("callee") == Some(owner))
}

fn has_set_timeout_call<'s>(scopes: &Scopes<'_, 's>, call: Node<'s>) -> bool {
    let mut holder = call;
    while let Some(next) = chained_listener(holder) {
        holder = next;
    }
    let Some(owner) = holder.parent() else { return false };
    if owner.is("MemberExpression") && member_name(owner).as_deref() == Some("setTimeout") {
        return true;
    }
    let id = owner.node("id").filter(|id| owner.is("VariableDeclarator") && id.is("Identifier"));
    let variable = id.and_then(|id| variable_of(scopes, id));
    variable.is_some_and(|variable| {
        scopes.references(variable).iter().any(|reference| {
            reference.identifier.parent().is_some_and(|parent| parent.is("MemberExpression") && member_name(parent).as_deref() == Some("setTimeout"))
        })
    })
}

fn is_global_fetch<'s>(scopes: &Scopes<'_, 's>, callee: Node<'s>) -> bool {
    let Some(target) = constant_of(scopes, Some(callee)) else { return false };
    if target.is("MemberExpression") {
        let owner = target.node("object").map(unwrapped);
        let global = owner.is_some_and(|owner| owner.is("Identifier") && owner.name().is_some_and(|name| GLOBAL_OBJECTS.contains(&name.as_ref())));
        return global && member_name(target).as_deref() == Some(FETCH);
    }
    target.is("Identifier") && target.name().as_deref() == Some(FETCH) && defs(scopes, target).is_empty()
}

fn is_namespace(target: Node, bindings: &Bindings) -> bool {
    target.is("Identifier") && target.name().is_some_and(|name| bindings.namespaces.contains(name.as_ref()))
}

fn is_fetch_from<'s>(scopes: &Scopes<'_, 's>, callee: Node<'s>, bindings: &Bindings) -> bool {
    is_namespace(unwrapped(callee), bindings) || imported_function(scopes, callee, bindings).as_deref() == Some(FETCH)
}

fn axios_owner(callee: Node) -> Option<String> {
    let target = unwrapped(callee);
    let owner = if target.is("MemberExpression") { target.node("object").map(unwrapped)? } else { target };
    owner.is("Identifier").then(|| owner.name().map(|name| name.into_owned())).flatten()
}

fn is_request_value(node: Option<Node>) -> bool {
    let Some(target) = node.map(unwrapped) else { return false };
    (target.is("MemberExpression") && member_name(target).as_deref() == Some("request")) || (target.is("Identifier") && target.name().is_some_and(|name| REQUEST_NAME.is_match(&name)))
}

impl<'s> ClientScope<'_, '_, 's> {
    pub fn of<'c, 'a>(scopes: &'c Scopes<'a, 's>, program: Node<'s>, check_fetch: bool, node_fetch_timeout: bool) -> ClientScope<'c, 'a, 's> {
        ClientScope {
            scopes,
            check_fetch,
            node_fetch_timeout,
            fetch_modules: bindings_of(program, &["cross-fetch", "isomorphic-fetch", "isomorphic-unfetch"]),
            node_fetch: bindings_of(program, &["node-fetch"]),
            undici: bindings_of(program, &["undici"]),
            axios: bindings_of(program, &[AXIOS]),
            got: bindings_of(program, &["got"]),
            http: bindings_of(program, &["http", "node:http", "https", "node:https"]),
        }
    }

    fn fetch_client(&self, callee: Node<'s>) -> Option<&'static str> {
        if is_global_fetch(self.scopes, callee) || is_fetch_from(self.scopes, callee, &self.undici) {
            return Some(FETCH);
        }
        if is_fetch_from(self.scopes, callee, &self.node_fetch) {
            return Some("node-fetch");
        }
        is_fetch_from(self.scopes, callee, &self.fetch_modules).then_some("fetch-module")
    }

    fn check_axios(&self, node: Node<'s>, callee: Node<'s>) -> Option<Found> {
        let method = imported_function(self.scopes, callee, &self.axios);
        let arguments = node.list("arguments");
        let owner = axios_owner(callee);
        let axios = |call: String, instance: Option<String>| Some(Found { client: AXIOS, call, owner: owner.clone(), instance });
        if is_namespace(callee, &self.axios) {
            return if lacks_timeout(self.scopes, &config_nodes(self.scopes, &arguments), &TIMEOUT_KEYS) { axios("axios()".into(), None) } else { None };
        }
        if method.as_deref() == Some("create") {
            let instance = created_instance(node).and_then(|id| id.name()).map(|name| name.into_owned());
            return if lacks_timeout(self.scopes, &[argument(node, 0)], &TIMEOUT_KEYS) { axios("axios.create()".into(), instance) } else { None };
        }
        let method = method?;
        let position = axios_position(Some(&method))?;
        if lacks_timeout(self.scopes, &[arguments.get(position).copied().flatten()], &TIMEOUT_KEYS) { axios(format!("axios.{method}()"), None) } else { None }
    }

    fn check_got(&self, node: Node<'s>, callee: Node<'s>) -> Option<Found> {
        let method = imported_function(self.scopes, callee, &self.got);
        let known = method.as_deref().is_some_and(|method| GOT_METHODS.contains(&method) || method == "extend");
        if !is_namespace(callee, &self.got) && !known {
            return None;
        }
        let arguments = node.list("arguments");
        let config = if method.as_deref() == Some("extend") { vec![argument(node, 0)] } else { config_nodes(self.scopes, &arguments) };
        if lacks_timeout(self.scopes, &config, &TIMEOUT_KEYS) { found("got", "got()".into()) } else { None }
    }

    fn check_http(&self, node: Node<'s>) -> Option<Found> {
        let method = node.node("callee").and_then(|callee| imported_function(self.scopes, callee, &self.http)).filter(|method| HTTP_METHODS.contains(&method.as_str()))?;
        let arguments = node.list("arguments");
        let options: Vec<Option<Node>> = (0..arguments.len().min(2)).filter(|index| !is_callback(self.scopes, &arguments, *index)).map(|index| arguments[index]).collect();
        let missing = lacks_timeout(self.scopes, &options, &TIMEOUT_KEYS);
        if missing && !has_set_timeout_call(self.scopes, node) { found("http", format!("http.{method}()")) } else { None }
    }

    fn fetch_inits(&self, node: Node<'s>) -> Vec<Option<Node<'s>>> {
        let first = argument(node, 0);
        let init = argument(node, 1);
        let target = first.map(unwrapped);
        let request = target.filter(|target| target.is("NewExpression") && target.node("callee").and_then(|callee| callee.name()).as_deref() == Some("Request"));
        if let Some(request) = request {
            return vec![argument(request, 1), init];
        }
        if is_local_url(self.scopes, first) {
            return Vec::new();
        }
        if is_request_value(first) {
            return if init.is_none() { Vec::new() } else { vec![init] };
        }
        vec![init]
    }

    fn check_fetch(&self, node: Node<'s>) -> Option<Found> {
        let client = if self.check_fetch { node.node("callee").and_then(|callee| self.fetch_client(callee)) } else { None }?;
        let inits = self.fetch_inits(node);
        let timeout = client == "node-fetch" && self.node_fetch_timeout;
        let keys: &[&str] = if timeout { &["signal", "dispatcher", "timeout"] } else { &["signal", "dispatcher"] };
        if !inits.is_empty() && lacks_timeout(self.scopes, &inits, keys) { found(client, "fetch()".into()) } else { None }
    }

    /// `clientCall`: the HTTP call a call is, when it has no timeout.
    pub fn client_call(&self, node: Node<'s>) -> Option<Found> {
        let callee = unwrapped(node.node("callee")?);
        self.check_fetch(node).or_else(|| self.check_axios(node, callee)).or_else(|| self.check_got(node, callee)).or_else(|| self.check_http(node))
    }
}
