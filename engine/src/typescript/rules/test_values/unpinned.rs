//! `no-unpinned-assertion`: `node:assert`, Chai and Sinon assertions that pass for many values, for any failure or
//! for a call with any arguments.
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_assertions::unowned_async::nodes::property_name;
use crate::typescript::rules::test_checks::is_expect_call;
use crate::typescript::rules::test_quality::test_calls::chain_of;
use crate::typescript::rules::writes::syntax::js_number;
use std::collections::HashMap;

const RULE: &str = "no-unpinned-assertion";
const ASSERT: &str = "assert";
const EXCEPTION_ROUTE: &str = "An exception fits only when the value cannot be pinned.";
const ASSERT_EXACT: &str = "`assert.strictEqual` or `assert.deepStrictEqual`";
const CHAI_EXACT: &str = "`expect(...).to.equal(...)` or `expect(...).to.deep.equal(...)`";
const ASSERT_TRUTHY: [&str; 4] = ["ok", "isOk", "notOk", "isNotOk"];
const ASSERT_DEFINED: [&str; 4] = ["exists", "isNotNull", "isDefined", "isNotUndefined"];
const ASSERT_THROWS: [&str; 4] = ["throws", "rejects", "throw", "Throw"];
const NOT_A_SUBJECT_MORE: [&str; 3] = ["fail", "doesNotThrow", "doesNotReject"];
const NEGATED_ONLY: [&str; 2] = ["null", "undefined"];
const ASSERT_MODULES: [&str; 4] = [ASSERT, "node:assert", "assert/strict", "node:assert/strict"];

enum Verdict {
    Unpinned(String, &'static str),
    UnpinnedFailure(String),
    LiteralSubject(String),
    BareCall(&'static str),
}

fn message(verdict: Verdict) -> String {
    match verdict {
        Verdict::Unpinned(form, exact) => format!("`{form}` passes for many values. Assert the exact value with {exact}. {EXCEPTION_ROUTE}"),
        Verdict::UnpinnedFailure(form) => format!(
            "`{form}` without the expected error passes for any failure. Pass the error class or message: `assert.throws(run, {{ message: '...' }})`, `expect(run).to.throw(SpecificError, '...')` or `.rejectedWith(SpecificError, '...')`. {EXCEPTION_ROUTE}"
        ),
        Verdict::LiteralSubject(form) => format!(
            "A literal passed as the value under test can never fail. Pass the value the code under test returns as the first argument of `{form}`. {EXCEPTION_ROUTE}"
        ),
        Verdict::BareCall(form) => format!(
            "A bare `{form}` check passes for a call with any arguments. Assert them with `calledWith(...)`: `sinon.assert.calledWith(spy, ...)` or `expect(spy).to.have.been.calledWith(...)`. An exception fits only when the arguments cannot be pinned."
        ),
    }
}

type Bindings = HashMap<String, String>;

fn text_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name().or_else(|| node.text("value"))).map(|text| text.into_owned())
}

fn remember_import(bindings: &mut Bindings, statement: Node) {
    let source = statement.node("source").and_then(|source| source.text("value")).unwrap_or_default();
    for specifier in statement.nodes("specifiers") {
        let name = if specifier.is("ImportSpecifier") { text_of(specifier.node("imported")).unwrap_or_default() } else { "default".to_string() };
        let Some(local) = specifier.node("local").and_then(|local| local.name()).map(|local| local.into_owned()) else { continue };
        if ASSERT_MODULES.contains(&source.as_ref()) {
            let method = if name == "default" || name == "strict" { "ok".to_string() } else { name };
            bindings.insert(local, method);
        } else if source == "chai" && name == ASSERT {
            bindings.insert(local, "ok".to_string());
        }
    }
}

fn required_module(init: Option<Node>) -> Option<String> {
    let call = init.filter(|init| init.is("CallExpression"))?;
    call.node("callee").filter(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("require"))?;
    let first = call.list("arguments").first().copied().flatten().filter(|first| first.is("Literal"))?;
    matches!(first.get("value"), Value::Text(..)).then(|| first.text("value").map(|value| value.into_owned())).flatten()
}

fn property_key(key: Option<Node>) -> Option<String> {
    let key = key?;
    if key.is("Identifier") {
        return key.name().map(|name| name.into_owned());
    }
    if !key.is("Literal") {
        return None;
    }
    match key.get("value") {
        Value::Text(..) => key.text("value").map(|value| value.into_owned()),
        Value::Number(number) => Some(js_number(number)),
        Value::Bool(value) => Some(value.to_string()),
        Value::Null => key.text("bigint").map(|digits| digits.into_owned()).or_else(|| Some("null".to_string())),
        _ => None,
    }
}

fn remember_require(bindings: &mut Bindings, declarator: Node) {
    if !required_module(declarator.node("init")).is_some_and(|source| ASSERT_MODULES.contains(&source.as_str())) {
        return;
    }
    let Some(id) = declarator.node("id") else { return };
    if id.is("Identifier") {
        bindings.extend(id.name().map(|name| (name.into_owned(), "ok".to_string())));
        return;
    }
    let properties = if id.is("ObjectPattern") { id.nodes("properties") } else { Vec::new() };
    for property in properties.into_iter().filter(|property| property.is("Property")) {
        let value = property.node("value").filter(|value| value.is("Identifier"));
        if let (Some(value), Some(key)) = (value.and_then(|value| value.name()), property_key(property.node("key"))) {
            bindings.insert(value.into_owned(), key);
        }
    }
}

fn is_assert_namespace(bindings: &Bindings, node: Node) -> bool {
    let target = if node.is("MemberExpression") && property_name(Some(node)).as_deref() == Some("strict") { node.node("object") } else { Some(node) };
    let Some(target) = target else { return false };
    if target.is("Identifier") {
        let name = target.name().unwrap_or_default();
        return name == ASSERT || bindings.get(name.as_ref()).is_some_and(|method| method == "ok");
    }
    property_name(Some(target)).as_deref() == Some(ASSERT)
}

fn assert_method(bindings: &Bindings, callee: Node) -> Option<String> {
    if callee.is("Identifier") {
        let name = callee.name()?;
        return if name == ASSERT { Some("ok".to_string()) } else { bindings.get(name.as_ref()).cloned() };
    }
    let owned = callee.is("MemberExpression") && callee.node("object").is_some_and(|object| is_assert_namespace(bindings, object));
    if owned { property_name(Some(callee)) } else { None }
}

fn unwrapped(node: Node) -> Option<Node> {
    match node.kind() {
        "TSNonNullExpression" | "ChainExpression" => node.node("expression"),
        "UnaryExpression" if node.text("operator").as_deref() == Some("!") => node.node("argument"),
        _ => None,
    }
}

fn is_vague(argument: Option<Node>) -> bool {
    chain_of(argument, unwrapped).last().is_some_and(|layer| matches!(layer.kind(), "Identifier" | "MemberExpression"))
}

fn assert_verdict(bindings: &Bindings, call: Node) -> Option<Verdict> {
    let method = assert_method(bindings, call.node("callee")?)?;
    let arguments = call.list("arguments");
    let first = arguments.first().copied().flatten();
    let not_a_subject = ASSERT_THROWS.contains(&method.as_str()) || NOT_A_SUBJECT_MORE.contains(&method.as_str());
    if !not_a_subject && first.is_some_and(|first| first.is("Literal")) {
        return Some(Verdict::LiteralSubject(method));
    }
    if (ASSERT_TRUTHY.contains(&method.as_str()) && is_vague(first)) || ASSERT_DEFINED.contains(&method.as_str()) {
        return Some(Verdict::Unpinned(format!("assert.{method}"), ASSERT_EXACT));
    }
    if ASSERT_THROWS.contains(&method.as_str()) && arguments.len() < 2 {
        return Some(Verdict::UnpinnedFailure(format!("assert.{method}")));
    }
    (method == "called").then_some(Verdict::BareCall("assert.called"))
}

fn chai_links(node: Option<Node>) -> Option<Vec<Option<String>>> {
    let chain = chain_of(node, |link| if link.is("MemberExpression") { link.node("object") } else { None });
    is_expect_call(chain.last().copied()).then(|| chain.iter().map(|link| property_name(Some(*link))).collect())
}

fn chai_property_verdict(name: Option<String>, links: &[Option<String>]) -> Option<Verdict> {
    let negated = links.iter().any(|link| link.as_deref() == Some("not"));
    let name = name?;
    if name == "ok" || (name == "exist" && !negated) || (NEGATED_ONLY.contains(&name.as_str()) && negated) {
        let form = format!(".{}{name}", if negated { "not." } else { "" });
        return Some(Verdict::Unpinned(form, CHAI_EXACT));
    }
    if name == "rejected" && !negated {
        return Some(Verdict::UnpinnedFailure(".rejected".to_string()));
    }
    (name == "called" && !negated).then_some(Verdict::BareCall(".called"))
}

fn is_terminal(node: Node) -> bool {
    let Some(parent) = node.parent() else { return true };
    !((parent.is("MemberExpression") && parent.node("object") == Some(node)) || (parent.is("CallExpression") && parent.node("callee") == Some(node)))
}

fn call_verdict<'v>(bindings: &Bindings, call: Node<'v>) -> Option<(Node<'v>, Verdict)> {
    let callee = call.node("callee")?;
    let chai = callee.is("MemberExpression") && !callee.node("object").is_some_and(|object| is_assert_namespace(bindings, object));
    if !chai {
        return assert_verdict(bindings, call).map(|verdict| (call, verdict));
    }
    let links = chai_links(callee.node("object"))?;
    let name = property_name(Some(callee))?;
    let pins_nothing = ASSERT_THROWS.contains(&name.as_str()) && call.list("arguments").is_empty();
    let negated = links.iter().any(|link| link.as_deref() == Some("not"));
    let property = callee.node("property").filter(|_| pins_nothing && !negated)?;
    Some((property, Verdict::UnpinnedFailure(format!(".{name}()"))))
}

fn member_verdict(member: Node) -> Option<(Node, Verdict)> {
    if !is_terminal(member) {
        return None;
    }
    let links = chai_links(member.node("object"))?;
    let verdict = chai_property_verdict(property_name(Some(member)), &links)?;
    Some((member.node("property")?, verdict))
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let mut bindings = Bindings::new();
    let mut found: Vec<(u32, u32, String)> = Vec::new();
    for node in view.nodes() {
        let reported = match node.kind() {
            "ImportDeclaration" => {
                remember_import(&mut bindings, node);
                None
            }
            "VariableDeclarator" => {
                remember_require(&mut bindings, node);
                None
            }
            "CallExpression" => call_verdict(&bindings, node),
            "MemberExpression" => member_verdict(node),
            _ => None,
        };
        if let Some((at, verdict)) = reported {
            found.push((at.start(), at.end(), message(verdict)));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
