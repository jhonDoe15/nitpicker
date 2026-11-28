//! `no-disabled-tls-verification`: options, assignments and strings that turn TLS certificate verification off.
mod text;

use self::text::has_insecure_text;
use crate::typescript::rules::Context;
use crate::typescript::rules::database::options::is_test_expression;
use crate::typescript::rules::security_values::leaves::leaf_values;
use crate::typescript::rules::security_values::{is_function_node, is_true, member_name, property_named, static_key, unwrapped};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::urls::values::string_value;

const RULE: &str = "no-disabled-tls-verification";
const MESSAGE: &str = "Turning off TLS certificate verification lets anyone on the network pose as the server, and turning it off by environment ships the switch to production. Keep verification on in every environment and trust the certificate authority instead: `new https.Agent({ ca: readFileSync(caPath) })`, `tlsCAFile` for MongoDB, or set NODE_EXTRA_CA_CERTS for a private CA; for browser automation against a local certificate pin it with `--ignore-certificate-errors-spki-list=<hash>`. A server that asks for optional client certificates sets `requestCert: true` and checks `socket.authorized`. An exception fits only when a contained case cannot do that.";
const ENV_NAME: &str = "NODE_TLS_REJECT_UNAUTHORIZED";
const FALSE_DISABLES: [&str; 5] = ["rejectUnauthorized", "strictSSL", "strictSsl", "sslValidate", "checkServerIdentity"];
const TRUE_DISABLES: [&str; 7] = [
    "ignoreHTTPSErrors",
    "ignoreHttpsErrors",
    "acceptInsecureCerts",
    "allowInsecureCerts",
    "tlsAllowInvalidCertificates",
    "tlsAllowInvalidHostnames",
    "tlsInsecure",
];
const SERVER_FACTORIES: [&str; 3] = ["createServer", "createSecureServer", "Server"];
const CONDITION_OPERATORS: [&str; 4] = ["===", "!==", "==", "!="];

fn is_false(node: Node) -> bool {
    node.is("Literal") && node.get("value") == Value::Bool(false)
}

fn is_off_value(leaf: Node) -> bool {
    (leaf.is("Literal") && leaf.get("value") == Value::Number(0.0)) || string_value(Some(leaf)).as_deref() == Some("0")
}

fn returns_nothing(function: Node) -> bool {
    let Some(body) = function.node("body") else { return false };
    if !body.is("BlockStatement") {
        let body = unwrapped(body);
        return (body.is("Identifier") && body.name().as_deref() == Some("undefined")) || (body.is("Literal") && body.text("raw").as_deref() == Some("null"));
    }
    body.nodes("body").into_iter().all(|statement| {
        let argument = statement.node("argument");
        statement.is("ReturnStatement") && argument.is_none_or(|argument| argument.name().as_deref() == Some("undefined"))
    })
}

fn disables_named<'s>(scopes: &Scopes<'_, 's>, name: &str, value: Node<'s>) -> bool {
    let condition = |leaf: Node| is_test_expression(leaf, &CONDITION_OPERATORS);
    if name == "checkServerIdentity" {
        return leaf_values(scopes, Some(value)).into_iter().any(|leaf| is_function_node(leaf) && returns_nothing(leaf));
    }
    if name == ENV_NAME {
        return leaf_values(scopes, Some(value)).into_iter().any(is_off_value);
    }
    if TRUE_DISABLES.contains(&name) {
        return leaf_values(scopes, Some(value)).into_iter().any(|leaf| is_true(leaf) || condition(leaf));
    }
    FALSE_DISABLES.contains(&name) && leaf_values(scopes, Some(value)).into_iter().any(|leaf| is_false(leaf) || condition(leaf))
}

fn is_server_options<'s>(scopes: &Scopes<'_, 's>, property: Node<'s>) -> bool {
    let Some(object) = property.parent() else { return false };
    let request_cert = property_named(scopes, Some(object), "requestCert");
    if request_cert.is_some_and(|value| leaf_values(scopes, Some(value)).into_iter().all(is_true)) {
        return true;
    }
    let Some(call) = object.parent().filter(|call| call.is("CallExpression") || call.is("NewExpression")) else { return false };
    let Some(callee) = call.node("callee").map(unwrapped) else { return false };
    let name = if callee.is("MemberExpression") { member_name(callee) } else { callee.name().map(|name| name.into_owned()) };
    call.nodes("arguments").contains(&object) && name.is_some_and(|name| SERVER_FACTORIES.contains(&name.as_str()))
}

fn target_name(left: Node) -> Option<String> {
    let target = unwrapped(left);
    if target.is("MemberExpression") {
        return member_name(target);
    }
    if target.is("Identifier") { target.name().map(|name| name.into_owned()) } else { None }
}

fn disables<'s>(scopes: &Scopes<'_, 's>, name: Option<String>, value: Option<Node<'s>>) -> bool {
    let known = name.as_deref().is_some_and(|name| name == ENV_NAME || TRUE_DISABLES.contains(&name) || FALSE_DISABLES.contains(&name));
    known && value.is_some_and(|value| disables_named(scopes, name.as_deref().unwrap_or_default(), value))
}

fn is_reported(scopes: &Scopes, node: Node) -> bool {
    match node.kind() {
        "Property" => {
            let key = static_key(node);
            let server = key.as_deref() == Some("rejectUnauthorized") && is_server_options(scopes, node);
            !server && disables(scopes, key, node.node("value"))
        }
        "AssignmentExpression" => node.text("operator").as_deref() == Some("=") && disables(scopes, node.node("left").and_then(target_name), node.node("right")),
        "Literal" | "TemplateLiteral" => has_insecure_text(node),
        _ => false,
    }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let found: Vec<Node> = view.nodes().filter(|node| is_reported(scopes, *node)).collect();
    for node in found {
        context.report_range(RULE, node.start(), Some(node.end()), MESSAGE.to_string());
    }
}
