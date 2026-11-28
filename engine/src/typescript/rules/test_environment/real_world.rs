//! `no-real-time-random-or-network`: `new Date()`, `Date.now()` and `Math.random()` in a test file that never fakes
//! the clock or spies on `Math.random`, and, with the `network` option, a direct call into `fetch`, `http`, `https`,
//! `net` or `new WebSocket`. The option arrives as the `network` setting.
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::test_values::find_variable;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_quality::runner_words::runner_word;
use crate::typescript::rules::test_runtime::runner_apis::{Apis, sets_fake_clock, spied_pair};
use crate::typescript::rules::testing_library::nodes::string_literal;
use std::collections::HashMap;

const RULE: &str = "no-real-time-random-or-network";
const NETWORK: &str = "A unit test must not reach the network. Inject the client and fake it.";

struct Binding {
    allowed: &'static [&'static str],
    imported: Option<String>,
}

fn network_methods(source: &str) -> Option<&'static [&'static str]> {
    match source.strip_prefix("node:").unwrap_or(source) {
        "http" | "https" => Some(&["request", "get"]),
        "net" => Some(&["connect", "createConnection"]),
        _ => None,
    }
}

fn is_identifier(node: Option<Node>, name: &str) -> bool {
    node.is_some_and(|node| node.is("Identifier") && node.name().as_deref() == Some(name))
}

fn is_member_call(node: Node, object: &str, property: &str) -> bool {
    let Some(callee) = node.node("callee").filter(|callee| callee.is("MemberExpression") && !callee.flag("computed")) else { return false };
    is_identifier(callee.node("object"), object) && callee.node("property").and_then(|node| node.name()).as_deref() == Some(property)
}

fn is_random_spy(apis: &Apis, node: Node) -> bool {
    let Some((target, property)) = spied_pair(apis, node) else { return false };
    is_identifier(Some(target), "Math") && property.is("Literal") && matches!(property.get("value"), Value::Text(..)) && string_literal(Some(property)).as_deref() == Some("random")
}

fn track_import(bindings: &mut HashMap<String, Binding>, node: Node) {
    let Some(allowed) = string_literal(node.node("source")).and_then(|source| network_methods(&source)) else { return };
    for specifier in node.nodes("specifiers") {
        let imported = if specifier.is("ImportSpecifier") { specifier.node("imported").and_then(|imported| imported.name()).map(|name| name.into_owned()) } else { Some("*".into()) };
        if let Some(local) = specifier.node("local").and_then(|local| local.name()) {
            bindings.insert(local.into_owned(), Binding { allowed, imported });
        }
    }
}

/// A name typescript-eslint binds a value use to although oxc leaves the use unresolved: a type-only import or a
/// namespace that declares no values.
fn binds_value_use(scopes: &Scopes, callee: Node) -> bool {
    let Some(symbol) = find_variable(scopes, callee) else { return false };
    scopes.defs(symbol).iter().any(|def| def.kind == DefKind::ImportBinding || def.node.is("TSModuleDeclaration"))
}

/// Whether ESLint's `getScope(call)` holds the reference of its callee: not for a call in a decorator of a class or
/// parameter, a `switch` discriminant or a `with` object, which ESLint evaluates in the scope outside.
fn in_reference_scope(call: Node) -> bool {
    let mut child = call;
    let mut decorated: Option<Node> = None;
    for parent in call.ancestors() {
        match parent.kind() {
            "Decorator" => decorated = decorated.or(parent.parent()),
            "ClassDeclaration" | "ClassExpression" => return decorated != Some(parent),
            "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression" | "TSDeclareFunction" | "TSEmptyBodyFunctionExpression" => {
                return decorated.is_none_or(|owner| owner == parent);
            }
            "SwitchStatement" => return parent.node("discriminant") != Some(child),
            "WithStatement" => return parent.node("object") != Some(child),
            "PropertyDefinition" | "AccessorProperty" if parent.node("value") == Some(child) => return true,
            "BlockStatement" | "StaticBlock" | "ForStatement" | "ForInStatement" | "ForOfStatement" | "CatchClause" | "TSModuleBlock" | "Program" => {
                return true;
            }
            _ => {}
        }
        child = parent;
    }
    true
}

/// `fetch` that no declaration of the file binds.
fn is_global_fetch(scopes: &Scopes, callee: Node, call: Node) -> bool {
    let unbound = scopes.variable_named(callee).is_none_or(|symbol| scopes.defs(symbol).is_empty()) && !binds_value_use(scopes, callee);
    callee.name().as_deref() == Some("fetch") && unbound && in_reference_scope(call)
}

fn is_network_call(scopes: &Scopes, bindings: &HashMap<String, Binding>, node: Node) -> bool {
    let Some(callee) = node.node("callee") else { return false };
    if callee.is("Identifier") {
        let imported = callee.name().and_then(|name| bindings.get(name.as_ref()));
        return is_global_fetch(scopes, callee, node)
            || imported.is_some_and(|binding| binding.imported.as_deref().is_some_and(|name| binding.allowed.contains(&name)));
    }
    if !callee.is("MemberExpression") || callee.flag("computed") {
        return false;
    }
    let binding = callee.node("object").and_then(|object| object.name()).and_then(|object| bindings.get(object.as_ref()));
    let property = callee.node("property").and_then(|property| property.name());
    binding.zip(property).is_some_and(|(binding, property)| binding.allowed.contains(&property.as_ref()))
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let checks_network = context.setting(&format!("{RULE}.network")) == Some("true");
    let mut apis = Apis::new();
    let mut bindings: HashMap<String, Binding> = HashMap::new();
    let (mut clock_calls, mut random_calls, mut network_calls) = (Vec::new(), Vec::new(), Vec::new());
    let (mut fake_clock, mut random_spy) = (false, false);
    for node in view.nodes() {
        apis.observe(node);
        match node.kind() {
            "ImportDeclaration" => track_import(&mut bindings, node),
            "NewExpression" => {
                if is_identifier(node.node("callee"), "Date") && node.nodes("arguments").is_empty() {
                    clock_calls.push(node);
                }
                if checks_network && is_identifier(node.node("callee"), "WebSocket") {
                    network_calls.push(node);
                }
            }
            "CallExpression" => {
                if is_member_call(node, "Date", "now") {
                    clock_calls.push(node);
                }
                if is_member_call(node, "Math", "random") {
                    random_calls.push(node);
                }
                fake_clock = fake_clock || sets_fake_clock(&apis, node);
                random_spy = random_spy || is_random_spy(&apis, node);
                if checks_network && is_network_call(scopes, &bindings, node) {
                    network_calls.push(node);
                }
            }
            _ => {}
        }
    }
    for node in network_calls {
        context.report_range(RULE, node.start(), Some(node.end()), NETWORK.into());
    }
    let fake = runner_word(context, RULE, "fake-clock").to_string();
    let fix = runner_word(context, RULE, "fix-random").to_string();
    let clock = format!("The real clock makes the test depend on when it runs. Pass the time in, or fake it with {fake}.");
    let random = format!("Real randomness makes the test fail on some runs. Pass a seeded or fixed value in, or fix it with {fix}.");
    let unfaked = clock_calls.into_iter().filter(|_| !fake_clock).map(|node| (node, &clock));
    let reports: Vec<_> = unfaked.chain(random_calls.into_iter().filter(|_| !random_spy).map(|node| (node, &random))).collect();
    for (node, message) in reports {
        context.report_range(RULE, node.start(), Some(node.end()), message.clone());
    }
}
