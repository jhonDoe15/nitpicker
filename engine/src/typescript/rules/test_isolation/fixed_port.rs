//! `no-fixed-port-in-tests`: a test or hook that starts a server on a fixed port, through `.listen(port)`,
//! `.listen({ port })` or a WebSocket server created with `{ port }`.
use super::port_exemptions::is_exempt;
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_checks::fixed_sleep::numbers::constant_number;
use crate::typescript::rules::test_quality::test_calls::is_test_function_chain;

const RULE: &str = "no-fixed-port-in-tests";
const WEB_SOCKET_NAMESPACES: [&str; 3] = ["WebSocket", "ws", "WS"];
const TEST_HOOKS: [&str; 6] = ["beforeAll", "beforeEach", "afterAll", "afterEach", "before", "after"];

fn name_is(node: Option<Node>, wanted: &str) -> bool {
    node.and_then(|node| node.name()).as_deref() == Some(wanted)
}

fn is_runner_call(node: Node) -> bool {
    let Some(callee) = node.node("callee").filter(|_| node.is("CallExpression")) else { return false };
    is_test_function_chain(callee) || (callee.is("Identifier") && callee.name().is_some_and(|name| TEST_HOOKS.contains(&name.as_ref())))
}

fn fixed_port(scopes: &Scopes, node: Option<Node>) -> Option<f64> {
    constant_number(scopes, node).filter(|value| value.fract() == 0.0 && value.is_finite() && *value > 0.0)
}

/// `propertyKeyName(property) === 'port'`.
fn is_port_key(property: Node) -> bool {
    let Some(key) = property.node("key") else { return false };
    if key.is("Identifier") && !property.flag("computed") {
        return key.name().as_deref() == Some("port");
    }
    key.is("Literal") && matches!(key.get("value"), Value::Text(..)) && key.text("value").as_deref() == Some("port")
}

fn port_option(scopes: &Scopes, node: Option<Node>) -> Option<f64> {
    let object = node.filter(|node| node.is("ObjectExpression"))?;
    let property = object.nodes("properties").into_iter().find(|candidate| candidate.is("Property") && is_port_key(*candidate))?;
    fixed_port(scopes, property.node("value"))
}

fn listen_port(scopes: &Scopes, call: Node) -> Option<f64> {
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    if !name_is(callee.node("property"), "listen") {
        return None;
    }
    let first = call.list("arguments").first().copied().flatten();
    fixed_port(scopes, first).or_else(|| port_option(scopes, first))
}

fn is_web_socket_server(callee: Node) -> bool {
    if callee.is("Identifier") {
        return callee.name().as_deref() == Some("WebSocketServer");
    }
    callee.is("MemberExpression")
        && name_is(callee.node("property"), "Server")
        && callee.node("object").and_then(|object| object.name()).is_some_and(|name| WEB_SOCKET_NAMESPACES.contains(&name.as_ref()))
}

fn server_port(scopes: &Scopes, call: Node) -> Option<f64> {
    let callee = call.node("callee")?;
    is_web_socket_server(callee).then(|| port_option(scopes, call.list("arguments").first().copied().flatten())).flatten()
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let mut found = Vec::new();
    for node in view.nodes() {
        let port = match node.kind() {
            "CallExpression" => listen_port(scopes, node),
            "NewExpression" => server_port(scopes, node),
            _ => continue,
        };
        let Some(port) = port else { continue };
        let owners: Vec<Node> = node.ancestors().filter(|ancestor| is_runner_call(*ancestor)).collect();
        if !owners.is_empty() && !is_exempt(node, port, &owners) {
            found.push((node.start(), node.end(), port));
        }
    }
    for (start, end, port) in found {
        let message = format!(
            "This test starts a server on port {port}, so it fails when that port is taken: by parallel test workers, a second run of the suite, a running app or a socket of the previous test still closing. Listen on port 0 and read the port the server got (`server.address().port`)."
        );
        context.report_range(RULE, start, Some(end), message);
    }
}
