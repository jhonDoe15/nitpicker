//! `worker-state.mts`: the calls and writes in a test that change state the whole worker shares.
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_quality::test_calls::chain_of;
use crate::typescript::rules::test_runtime::runner_apis::{Apis, member_name};
use crate::typescript::rules::test_values::find_variable;

const RUNNER_KINDS: [&str; 2] = ["vitest", "jest"];
const MOCK_SETTERS: [&str; 8] = [
    "mockImplementation", "mockImplementationOnce", "mockReturnValue", "mockReturnValueOnce", "mockResolvedValue",
    "mockResolvedValueOnce", "mockRejectedValue", "mockRejectedValueOnce",
];
/// The members of `Object.prototype` that `method in WORKER_CALLS` also finds; the message then shows the
/// function as text.
const PROTOTYPE_METHODS: [&str; 11] = [
    "constructor", "hasOwnProperty", "isPrototypeOf", "propertyIsEnumerable", "toLocaleString", "toString", "valueOf",
    "__defineGetter__", "__defineSetter__", "__lookupGetter__", "__lookupSetter__",
];

fn worker_call(method: &str) -> Option<String> {
    let what = match method {
        "useFakeTimers" => "fake timers",
        "setSystemTime" => "the fake clock",
        "spyOn" => "a spy",
        "stubGlobal" => "a stubbed global",
        "stubEnv" => "a stubbed environment variable",
        "__proto__" => "[object Object]",
        _ if PROTOTYPE_METHODS.contains(&method) => {
            let name = if method == "constructor" { "Object" } else { method };
            return Some(format!("function {name}() {{ [native code] }}"));
        }
        _ => return None,
    };
    Some(what.to_string())
}

fn first_definition<'v>(scopes: &Scopes<'_, 'v>, identifier: Node<'v>) -> Option<Node<'v>> {
    let symbol = find_variable(scopes, identifier)?;
    scopes.defs(symbol).first().map(|definition| definition.name)
}

fn is_process_member(scopes: &Scopes, node: Option<Node>, name: &str) -> bool {
    let Some(node) = node.filter(|node| node.is("MemberExpression")) else { return false };
    let Some(object) = node.node("object").filter(|object| object.is("Identifier") && object.name().as_deref() == Some("process")) else {
        return false;
    };
    first_definition(scopes, object).is_none() && member_name(node).as_deref() == Some(name)
}

/// `envWrite`: an assignment target or `delete` operand inside `process.env`.
pub fn env_write(scopes: &Scopes, target: Option<Node>) -> bool {
    target.is_some_and(|target| {
        target.is("MemberExpression") && (is_process_member(scopes, target.node("object"), "env") || is_process_member(scopes, Some(target), "env"))
    })
}

fn declared_outside(scopes: &Scopes, identifier: Node, owner: Node) -> bool {
    first_definition(scopes, identifier).is_some_and(|name| !owner.contains(name))
}

fn shared_mock_setter(scopes: &Scopes, callee: Node, owner: Node) -> bool {
    let setter = member_name(callee).is_some_and(|method| MOCK_SETTERS.contains(&method.as_str()));
    let object = callee.node("object").filter(|object| setter && object.is("Identifier"));
    object.is_some_and(|object| declared_outside(scopes, object, owner))
}

fn member_root(start: Node) -> Node {
    let chain = chain_of(Some(start), |link| if link.is("MemberExpression") { link.node("object") } else { None });
    chain.last().copied().unwrap_or(start)
}

fn spies_on_local_object(scopes: &Scopes, call: Node, owner: Node) -> bool {
    let target = call.list("arguments").first().copied().flatten();
    let Some(root) = target.map(member_root).filter(|root| root.is("Identifier")) else { return true };
    first_definition(scopes, root).is_some_and(|name| owner.contains(name))
}

/// `workerStateCall`: what a call in a test or hook changes for the whole worker.
pub fn worker_state_call(apis: &Apis, scopes: &Scopes, call: Node, owner: Node) -> Option<String> {
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    let method = member_name(callee).unwrap_or_default();
    let runner = callee.node("object").and_then(|object| apis.kind_of_object(object)).is_some_and(|kind| RUNNER_KINDS.contains(&kind));
    if let Some(what) = worker_call(&method).filter(|_| runner) {
        return if method == "spyOn" && spies_on_local_object(scopes, call, owner) { None } else { Some(what) };
    }
    if is_process_member(scopes, Some(callee), "chdir") {
        return Some("the working directory change".to_string());
    }
    shared_mock_setter(scopes, callee, owner).then(|| "the implementation set on a mock declared outside the test".to_string())
}
