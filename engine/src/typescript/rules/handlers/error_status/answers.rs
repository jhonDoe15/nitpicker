//! `error-answers.mts`: the response a call sends when its chain gives no status, whether its body only reports a
//! failure, and whether a status is set around the `catch` it sits in.
use super::super::walk::{any_inside, chain_of, first_def, is_function, name_of, named_member};
use crate::typescript::rules::escaping::is_valid_regex;
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};

const STATUS: &str = "status";
const RESPONSE_NAMES: [&str; 3] = ["res", "response", "reply"];
const CONTEXT_NAMES: [&str; 3] = ["c", "ctx", "context"];
const SENDERS: [&str; 2] = ["json", "send"];
const STATUS_CALLS: [&str; 4] = [STATUS, "sendStatus", "code", "writeHead"];
const STATUS_FIELDS: [&str; 2] = [STATUS, "statusCode"];
const ERROR_KEYS: [&str; 3] = ["error", "errors", "err"];
const OUTCOME_KEYS: [&str; 9] = [STATUS, "statusCode", "code", "success", "ok", "data", "result", "jsonrpc", "id"];
const STATIC_OWNERS: [&str; 2] = ["NextResponse", "Response"];
const TYPE_WRAPPERS: [&str; 5] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "ChainExpression"];

#[derive(Clone, Copy, PartialEq)]
pub enum Kind {
    Static,
    Response,
    Context,
}

pub struct Answer<'v> {
    pub body: Option<Node<'v>>,
    pub settings: Option<Node<'v>>,
    pub root: Node<'v>,
    pub kind: Kind,
}

fn chained_receiver(link: Node) -> Option<Node> {
    let callee = link.is("CallExpression").then(|| link.node("callee")).flatten()?;
    named_member(callee).and_then(|_| callee.node("object"))
}

fn is_static_owner(scopes: &Scopes, owner: Node) -> bool {
    let definition = first_def(scopes, owner);
    if name_of(Some(owner)).as_deref() == Some("Response") {
        return definition.is_none();
    }
    definition.is_some_and(|definition| {
        let declaration = definition.node.parent();
        definition.kind == DefKind::ImportBinding
            && declaration.is_some_and(|declaration| declaration.is("ImportDeclaration") && declaration.node("source").and_then(|source| source.text("value")).as_deref() == Some("next/server"))
    })
}

fn imports_hono(program: Node) -> bool {
    program.nodes("body").iter().any(|statement| {
        let source = statement.is("ImportDeclaration").then(|| statement.node("source").and_then(|source| source.text("value"))).flatten();
        source.is_some_and(|source| source == "hono" || source.starts_with("hono/") || source.starts_with("@hono/"))
    })
}

fn kind_of(scopes: &Scopes, program: Node, root: Node, chained: bool) -> Option<Kind> {
    let name = name_of(Some(root)).unwrap_or_default();
    if !chained && STATIC_OWNERS.contains(&name.as_str()) {
        return is_static_owner(scopes, root).then_some(Kind::Static);
    }
    if first_def(scopes, root).is_none_or(|definition| definition.kind != DefKind::Parameter) {
        return None;
    }
    if RESPONSE_NAMES.contains(&name.as_str()) {
        return Some(Kind::Response);
    }
    (!chained && CONTEXT_NAMES.contains(&name.as_str()) && imports_hono(program)).then_some(Kind::Context)
}

/// `answerOf`: the response a call sends when it gives no status of its own in the call chain.
pub fn answer_of<'v>(scopes: &Scopes<'_, 'v>, program: Node<'v>, call: Node<'v>) -> Option<Answer<'v>> {
    let callee = call.node("callee")?;
    let method = named_member(callee).filter(|name| SENDERS.contains(&name.as_str()))?;
    let links = chain_of(callee.node("object"), chained_receiver);
    let root = links.last().copied().filter(|root| root.is("Identifier"))?;
    let kind = kind_of(scopes, program, root, links.len() > 1)?;
    if kind != Kind::Response && method != "json" {
        return None;
    }
    let names = links.iter().filter(|link| link.is("CallExpression")).filter_map(|link| link.node("callee").and_then(named_member));
    if names.into_iter().any(|name| STATUS_CALLS.contains(&name.as_str())) {
        return None;
    }
    let arguments = call.list("arguments");
    Some(Answer { body: arguments.first().copied().flatten(), settings: arguments.get(1).copied().flatten(), root, kind })
}

/// `keyName` of the fix helpers: the key of a property written without brackets, as a string.
fn key_name(property: Node) -> Option<String> {
    if !property.is("Property") || property.flag("computed") {
        return None;
    }
    let key = property.node("key")?;
    if key.is("Identifier") {
        return name_of(Some(key));
    }
    Some(key.text("value").map_or_else(|| key.text("raw").unwrap_or_default().into_owned(), |text| text.into_owned()))
}

/// A regular expression literal Node cannot build has the value `null`.
fn is_unbuilt_regex(value: Node) -> bool {
    let Value::Node(at) = value.get("regex") else { return false };
    let regex = value.view.at(at);
    let (pattern, flags) = (regex.text("pattern").unwrap_or_default(), regex.text("flags").unwrap_or_default());
    !is_valid_regex(&pattern, &flags)
}

fn is_absent(value: Node) -> bool {
    let null = value.text("raw").as_deref() == Some("null") || is_unbuilt_regex(value);
    let literal = value.is("Literal") && (value.get("value") == Value::Bool(false) || null);
    literal
        || (value.is("Identifier") && name_of(Some(value)).as_deref() == Some("undefined"))
        || (value.is("ArrayExpression") && value.list("elements").is_empty())
}

fn unwrap_types(mut node: Node) -> Node {
    while let Some(inner) = TYPE_WRAPPERS.contains(&node.kind()).then(|| node.node("expression")).flatten() {
        node = inner;
    }
    node
}

/// `isErrorBody`: an object literal that only reports a failure, with no outcome field of its own.
pub fn is_error_body(body: Option<Node>) -> bool {
    let Some(literal) = body.map(unwrap_types).filter(|literal| literal.is("ObjectExpression")) else { return false };
    let properties = literal.nodes("properties");
    let keys: Vec<Option<String>> = properties.iter().map(|property| key_name(*property)).collect();
    keys.iter().all(|key| key.as_ref().is_some_and(|key| !OUTCOME_KEYS.contains(&key.as_str())))
        && properties.iter().zip(&keys).any(|(property, key)| {
            key.as_ref().is_some_and(|key| ERROR_KEYS.contains(&key.as_str())) && property.node("value").is_some_and(|value| !is_absent(value))
        })
}

/// `leavesStatus`: whether the second argument of a static `json` call leaves the status at its default.
pub fn leaves_status(settings: Option<Node>) -> bool {
    let Some(settings) = settings else { return true };
    settings.is("ObjectExpression")
        && settings.nodes("properties").iter().all(|property| key_name(*property).is_some_and(|key| !STATUS_FIELDS.contains(&key.as_str())))
}

fn sets_status(node: Node) -> bool {
    if node.is("CallExpression") {
        return node.node("callee").and_then(named_member).is_some_and(|name| STATUS_CALLS.contains(&name.as_str()));
    }
    node.is("AssignmentExpression") && node.node("left").and_then(named_member).is_some_and(|name| STATUS_FIELDS.contains(&name.as_str()))
}

fn is_bare_status(node: Node) -> bool {
    node.is("ExpressionStatement") && node.node("expression").is_some_and(sets_status)
}

fn hands_over(node: Node, name: &str) -> bool {
    node.is("CallExpression") && node.nodes("arguments").iter().any(|argument| argument.is("Identifier") && name_of(Some(*argument)).as_deref() == Some(name))
}

/// `statusSetAround`: the `catch` sets a status or hands the response on, or its function sets one as a statement.
pub fn status_set_around(clause: Node, name: &str) -> bool {
    let owner = clause.ancestors().find(|ancestor| is_function(*ancestor)).unwrap_or(clause);
    clause.node("body").is_some_and(|body| any_inside(body, |node| sets_status(node) || hands_over(node, name))) || any_inside(owner, is_bare_status)
}

/// `catchAround`: the `catch` clause whose block holds the node, in the same function.
pub fn catch_around(node: Node) -> Option<Node> {
    node.ancestors().take_while(|ancestor| !is_function(*ancestor)).find(|ancestor| ancestor.is("CatchClause"))
}
