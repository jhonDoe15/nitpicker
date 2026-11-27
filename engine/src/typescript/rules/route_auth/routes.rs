//! `handlers.mts` and `middleware-names.mts`: the routes an Express, Fastify, Koa, Restify or Hono router
//! registers in a file, and the auth middleware each runs, its own and its router's.
use super::shapes::is_auth_name;
use crate::typescript::rules::support::view::{Node, Value, View};
use crate::typescript::rules::writes::imports::ImportedBinding;
use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::sync::LazyLock;

const HTTP_METHODS: [&str; 8] = ["get", "post", "put", "patch", "delete", "all", "options", "head"];
const ROUTER_MODULES: [&str; 6] = ["express", "fastify", "koa-router", "@koa/router", "restify", "hono"];
const FACTORIES: [&str; 6] = ["express", "Router", "fastify", "Fastify", "Hono", "createServer"];
const FRAMEWORK_TYPES: [&str; 6] = ["Express", "Application", "Router", "IRouter", "FastifyInstance", "Hono"];
const FASTIFY_OPTIONS: [&str; 5] = ["preHandler", "onRequest", "preValidation", "preParsing", "beforeHandler"];
const WRAPPERS: [&str; 4] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "ChainExpression"];

static OPEN_PATH: LazyLock<Regex> = LazyLock::new(|| {
    let words = r"health\w*|ready\w*|live\w*|ping|metrics|status|login|signup|register|logout|callback|webhooks?|public|oauth\w*";
    Regex::new(&format!(r"(?:^|[/_-])(?:{})(?:$|[/_.-])", words.replace(r"\w", "[0-9A-Za-z_]"))).expect("open path")
});
static PATH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^(?:/|\*|$)").expect("path"));

pub struct Route<'v> {
    pub node: Node<'v>,
    pub shapes: Vec<String>,
    pub is_public: bool,
}

fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

/// `middlewareName`: the name a middleware is written with, through calls that build it.
pub fn middleware_name(node: Node) -> Option<String> {
    let mut current = node;
    loop {
        if current.is("Identifier") {
            return name_of(Some(current));
        }
        if current.is("MemberExpression") && !current.flag("computed") {
            return name_of(current.node("property"));
        }
        current = current.node("callee").filter(|_| current.is("CallExpression"))?;
    }
}

fn nested_items(item: Node) -> Option<Vec<Node>> {
    if item.is("ArrayExpression") {
        return Some(item.nodes("elements"));
    }
    if !item.is("ObjectExpression") {
        return None;
    }
    let options = item.nodes("properties").into_iter().filter(|property| property.is("Property") && name_of(property.node("key")).is_some_and(|key| FASTIFY_OPTIONS.contains(&key.as_str())));
    Some(options.filter_map(|property| property.node("value")).collect())
}

fn middleware_in(argument: Node) -> Vec<String> {
    let mut names = Vec::new();
    let mut pending = vec![argument];
    let mut at = 0;
    while at < pending.len() {
        let item = pending[at];
        at += 1;
        match nested_items(item) {
            Some(nested) => pending.extend(nested),
            None => names.extend(middleware_name(item)),
        }
    }
    names
}

fn unwrap_expression(node: Node) -> Node {
    let mut current = node;
    while WRAPPERS.contains(&current.kind()) {
        match current.node("expression") {
            Some(inner) => current = inner,
            None => break,
        }
    }
    current
}

fn root_identifier(expression: Node) -> Option<Node> {
    let mut current = unwrap_expression(expression);
    while let Some(object) = Some(unwrap_expression(current)).filter(|inner| inner.is("MemberExpression")).and_then(|inner| inner.node("object")) {
        current = object;
    }
    Some(unwrap_expression(current)).filter(|identifier| identifier.is("Identifier"))
}

fn is_framework_module(module: &str) -> bool {
    ROUTER_MODULES.contains(&module) || module.starts_with("@fastify/")
}

fn callee_leaf(callee: Node) -> Option<String> {
    if callee.is("MemberExpression") { name_of(callee.node("property")) } else { name_of(Some(callee)) }
}

fn is_router_factory(init: Option<Node>, bindings: &HashMap<String, ImportedBinding>) -> bool {
    let mut call = init;
    while let Some(inner) = call.filter(|node| node.is("TSAsExpression")) {
        call = inner.node("expression");
    }
    let Some(call) = call.filter(|call| call.is("CallExpression") || call.is("NewExpression")) else { return false };
    let Some(callee) = call.node("callee") else { return false };
    let module = root_identifier(callee).and_then(|root| root.name()).and_then(|root| bindings.get(root.as_ref())).map(|binding| binding.module.as_str());
    module.is_some_and(is_framework_module) && callee_leaf(callee).is_some_and(|leaf| FACTORIES.contains(&leaf.as_str()))
}

fn is_typed_receiver(node: Node) -> bool {
    let reference = node.node("typeAnnotation").filter(|_| node.is("Identifier")).and_then(|annotation| annotation.node("typeAnnotation"));
    reference.is_some_and(|reference| reference.is("TSTypeReference") && name_of(reference.node("typeName")).is_some_and(|name| FRAMEWORK_TYPES.contains(&name.as_str())))
}

fn receiver_name(callee: Node) -> Option<String> {
    callee.node("object").filter(|object| object.is("Identifier")).and_then(|object| name_of(Some(object)))
}

fn is_path(node: Option<Node>) -> bool {
    let text = node.filter(|node| node.is("Literal") && matches!(node.get("value"), Value::Text(..))).and_then(|node| node.text("value"));
    text.is_some_and(|text| PATH.is_match(&text))
}

fn registered_plugin(call: Node, receivers: &HashSet<String>) -> Option<String> {
    let callee = call.node("callee")?;
    let receiver = receiver_name(callee)?;
    let plugin = call.list("arguments").first().copied().flatten()?;
    let registers = name_of(callee.node("property")).as_deref() == Some("register") && receivers.contains(&receiver);
    let callback = plugin.is("ArrowFunctionExpression") || plugin.is("FunctionExpression");
    let parameter = plugin.list("params").first().copied().flatten().filter(|parameter| parameter.is("Identifier"));
    if registers && callback { name_of(parameter) } else { None }
}

fn is_open_path(node: Option<Node>) -> bool {
    node.filter(|node| node.is("Literal")).and_then(|node| node.text("value")).is_some_and(|text| OPEN_PATH.is_match(&text.to_lowercase()))
}

fn route_of<'v>(node: Node<'v>, receivers: &HashSet<String>, scoped: &mut HashMap<String, Vec<String>>) -> Option<Route<'v>> {
    let callee = node.node("callee")?;
    let receiver = receiver_name(callee);
    let method = name_of(callee.node("property")).unwrap_or_default();
    let arguments = node.list("arguments");
    let is_scope = method == "use" || method == "addHook";
    let handler = arguments.last().copied().flatten().is_some_and(|last| !last.is("Literal") && !last.is("ObjectExpression"));
    let is_route = HTTP_METHODS.contains(&method.as_str()) && arguments.len() >= 2 && is_path(arguments[0]) && handler;
    let receiver = receiver.filter(|receiver| receivers.contains(receiver) && (is_scope || is_route))?;
    let candidates = if is_scope { &arguments[..] } else { &arguments[..arguments.len() - 1] };
    let names: Vec<String> = candidates.iter().flatten().filter(|argument| !is_path(Some(**argument))).flat_map(|argument| middleware_in(*argument)).filter(|name| is_auth_name(Some(name))).collect();
    if is_scope {
        scoped.entry(receiver).or_default().extend(names);
        return None;
    }
    let mut shapes = names;
    shapes.extend(scoped.get(&receiver).cloned().unwrap_or_default());
    Some(Route { node, shapes, is_public: is_open_path(arguments[0]) })
}

/// `routeFacts(program).routes`.
pub fn routes<'v>(view: &'v View, bindings: &HashMap<String, ImportedBinding>) -> Vec<Route<'v>> {
    if !bindings.values().any(|binding| is_framework_module(&binding.module)) {
        return Vec::new();
    }
    let mut receivers: HashSet<String> = HashSet::new();
    let mut calls: Vec<Node> = Vec::new();
    for node in view.nodes() {
        let id = node.node("id").filter(|id| node.is("VariableDeclarator") && id.is("Identifier"));
        if let Some(id) = id.filter(|_| is_router_factory(node.node("init"), bindings)) {
            receivers.extend(name_of(Some(id)));
        }
        if is_typed_receiver(node) {
            receivers.extend(name_of(Some(node)));
        }
        if node.is("CallExpression") {
            calls.push(node);
        }
    }
    calls.sort_by_key(|call| call.start());
    let mut scoped = HashMap::new();
    let mut found = Vec::new();
    for node in calls.into_iter().filter(|call| call.node("callee").is_some_and(|callee| callee.is("MemberExpression") && !callee.flag("computed"))) {
        receivers.extend(registered_plugin(node, &receivers));
        found.extend(route_of(node, &receivers, &mut scoped));
    }
    found
}
