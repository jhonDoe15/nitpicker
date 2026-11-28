//! `mock-sites.mts`: where a test file creates, clears and counts the calls of its mocks.
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_quality::test_calls::chain_of;
use crate::typescript::rules::test_runtime::runner_apis::{Apis, member_name};

const CLEARING_METHODS: [&str; 4] = ["mockClear", "mockReset", "mockRestore", "resetCalls"];
const COUNT_MATCHERS: [&str; 5] = ["toHaveBeenCalledTimes", "toBeCalledTimes", "toHaveBeenCalledOnce", "toHaveBeenNthCalledWith", "nthCalledWith"];
const NEGATED_MATCHERS: [&str; 2] = ["toHaveBeenCalled", "toBeCalled"];
const CALL_RECORDS: [&str; 3] = ["calls", "results", "callCount"];
const TYPE_WRAPPERS: [&str; 4] = ["TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression", "TSTypeAssertion"];

#[derive(Clone, Copy)]
pub enum Lists {
    MockFactories,
    ModuleMocks,
    ClearingAll,
}

fn listed(lists: Lists, kind: &str, method: &str) -> bool {
    let methods: &[&str] = match (lists, kind) {
        (Lists::MockFactories, "vitest" | "jest") => &["fn", "spyOn"],
        (Lists::MockFactories, "node") => &["fn", "method", "getter", "setter"],
        (Lists::ModuleMocks, "vitest" | "jest") => &["mock", "doMock"],
        (Lists::ClearingAll, "vitest" | "jest") => &["clearAllMocks", "resetAllMocks", "restoreAllMocks"],
        (Lists::ClearingAll, "node") => &["reset", "restoreAll"],
        _ => &[],
    };
    methods.contains(&method)
}

fn runner_member(apis: &Apis, node: Node, lists: Lists) -> bool {
    if !node.is("MemberExpression") {
        return false;
    }
    let kind = node.node("object").and_then(|object| apis.kind_of_object(object));
    member_name(node).is_some_and(|method| listed(lists, kind.unwrap_or(""), &method))
}

pub fn runner_call(apis: &Apis, node: Node, lists: Lists) -> bool {
    node.is("CallExpression") && node.node("callee").is_some_and(|callee| runner_member(apis, callee, lists))
}

fn called_object(node: Node) -> Option<Node> {
    let callee = node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression"))?;
    callee.node("object")
}

fn chain_root(node: Node) -> Node {
    let links = chain_of(Some(node), |current| called_object(current).filter(|object| object.is("CallExpression")));
    links.last().copied().unwrap_or(node)
}

pub fn is_mock_creation(apis: &Apis, node: Option<Node>) -> bool {
    node.is_some_and(|node| runner_call(apis, chain_root(node), Lists::MockFactories))
}

/// `mockedModule`: the module a `vi.mock('module')` replaces, and the runner that replaces it.
pub fn mocked_module(apis: &Apis, call: Node) -> Option<(String, Option<&'static str>)> {
    let first = call.list("arguments").first().copied().flatten()?;
    if !runner_call(apis, call, Lists::ModuleMocks) || !first.is("Literal") {
        return None;
    }
    let source = match first.get("value") {
        crate::typescript::rules::support::view::Value::Text(..) => first.text("value")?.into_owned(),
        _ => return None,
    };
    Some((source, called_object(call).and_then(|object| apis.kind_of_object(object))))
}

pub fn clears_every_mock(apis: &Apis, call: Node) -> bool {
    runner_call(apis, call, Lists::ClearingAll) || call.nodes("arguments").into_iter().any(|argument| runner_member(apis, argument, Lists::ClearingAll))
}

fn without_types(node: Node) -> Node {
    let links = chain_of(Some(node), |current| if TYPE_WRAPPERS.contains(&current.kind()) { current.node("expression") } else { None });
    links.last().copied().unwrap_or(node)
}

fn unwrap_mocked<'v>(apis: &Apis, wrapped: Node<'v>) -> Node<'v> {
    let node = without_types(wrapped);
    let callee = node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression"));
    let first = node.list("arguments").first().copied().flatten();
    if let (Some(callee), Some(first)) = (callee, first)
        && member_name(callee).as_deref() == Some("mocked")
        && callee.node("object").and_then(|object| apis.kind_of_object(object)).is_some()
    {
        return without_types(first);
    }
    node
}

fn identifier_name(apis: &Apis, node: Option<Node>) -> Option<String> {
    let target = unwrap_mocked(apis, node?);
    if target.is("Identifier") { target.name().map(|name| name.into_owned()) } else { None }
}

/// `clearedMock`: a `mockClear()`-like call, with the name of the mock it clears when that is a plain name.
pub fn cleared_mock(apis: &Apis, call: Node) -> Option<Option<String>> {
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    if !member_name(callee).is_some_and(|method| CLEARING_METHODS.contains(&method.as_str())) {
        return None;
    }
    let object = callee.node("object")?;
    let on_mock = object.is("MemberExpression") && member_name(object).as_deref() == Some("mock");
    let target = if on_mock { object.node("object") } else { Some(object) };
    Some(identifier_name(apis, target))
}

pub struct CountRead<'v> {
    pub node: Node<'v>,
    pub form: String,
}

fn not_base(member: Node) -> (bool, Option<Node>) {
    let object = member.node("object");
    match object.filter(|object| object.is("MemberExpression") && member_name(*object).as_deref() == Some("not")) {
        Some(not) => (true, not.node("object")),
        None => (false, object),
    }
}

fn matcher_read<'v>(apis: &Apis, node: Node<'v>) -> Option<CountRead<'v>> {
    let name = member_name(node).unwrap_or_default();
    let (negated, base) = not_base(node);
    let counts = COUNT_MATCHERS.contains(&name.as_str()) || (negated && NEGATED_MATCHERS.contains(&name.as_str()));
    let base = base.filter(|base| counts && base.is("CallExpression"))?;
    base.node("callee").filter(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("expect"))?;
    identifier_name(apis, base.list("arguments").first().copied().flatten())?;
    Some(CountRead { node, form: if negated { format!("not.{name}") } else { name } })
}

fn record_read<'v>(apis: &Apis, node: Node<'v>) -> Option<CountRead<'v>> {
    let record = member_name(node).filter(|record| CALL_RECORDS.contains(&record.as_str()))?;
    let mock = node.node("object").filter(|mock| mock.is("MemberExpression") && member_name(*mock).as_deref() == Some("mock"))?;
    identifier_name(apis, mock.node("object"))?;
    Some(CountRead { node, form: format!("mock.{record}") })
}

/// `countRead`: a matcher or call record that reads how often a named mock was called.
pub fn count_read<'v>(apis: &Apis, node: Node<'v>) -> Option<CountRead<'v>> {
    matcher_read(apis, node).or_else(|| record_read(apis, node))
}

pub fn reset_call_for(kind: Option<&str>, name: &str) -> String {
    if kind == Some("node") { format!("{name}.mock.resetCalls()") } else { format!("{name}.mockClear()") }
}
