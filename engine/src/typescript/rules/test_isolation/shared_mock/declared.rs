//! `declared-mocks.mts`: the mocks a file or a suite body declares for its tests to share.
use super::sites::is_mock_creation;
use crate::typescript::rules::loop_repeats::names::pattern_identifiers;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::test_quality::test_calls::{callback_owner, chain_of, is_suite_call};
use crate::typescript::rules::test_runtime::runner_apis::Apis;
use oxc_semantic::SymbolId;

pub const FUNCTIONS: [&str; 3] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];

pub struct Shared<'v> {
    pub symbol: SymbolId,
    pub node: Node<'v>,
    pub kind: Option<&'static str>,
}

fn is_suite_body(parent: Node) -> bool {
    let owner = parent.parent().filter(|owner| FUNCTIONS.contains(&owner.kind()));
    parent.is("BlockStatement") && callback_owner(owner).is_some_and(is_suite_call)
}

/// `isSharedLevel(declarator.parent)`.
pub fn is_shared_level(declaration: Option<Node>) -> bool {
    let parent = declaration.and_then(|declaration| declaration.parent());
    let parent = if parent.is_some_and(|parent| parent.is("ExportNamedDeclaration")) { parent.and_then(|parent| parent.parent()) } else { parent };
    parent.is_some_and(|parent| parent.is("Program") || is_suite_body(parent))
}

fn called_member(node: Node) -> Option<Node> {
    node.node("callee").filter(|callee| node.is("CallExpression") && callee.is("MemberExpression"))
}

fn hoisted_mocks(apis: &Apis, declarator: Node) -> Vec<String> {
    let Some(init) = declarator.node("init") else { return Vec::new() };
    let runner = called_member(init).and_then(|callee| callee.node("object")).is_some_and(|object| apis.kind_of_object(object).is_some());
    let callback = init.list("arguments").first().copied().flatten().filter(|callback| runner && callback.is("ArrowFunctionExpression"));
    let Some(value) = callback.and_then(|callback| callback.node("body")).filter(|body| body.is("ObjectExpression")) else { return Vec::new() };
    value
        .nodes("properties")
        .into_iter()
        .filter(|property| property.is("Property") && is_mock_creation(apis, property.node("value")))
        .filter_map(|property| property.node("key").filter(|key| key.is("Identifier")).and_then(|key| key.name()).map(|name| name.into_owned()))
        .collect()
}

fn mock_kind(apis: &Apis, init: Option<Node>) -> Option<&'static str> {
    let calls = chain_of(init, |current| called_member(current).and_then(|callee| callee.node("object")));
    calls.into_iter().find_map(|call| called_member(call).and_then(|callee| callee.node("object")).and_then(|object| apis.kind_of_object(object)))
}

/// `declaredMocks`.
pub fn declared_mocks<'v>(scopes: &Scopes<'_, 'v>, apis: &Apis, declarator: Node<'v>) -> Vec<Shared<'v>> {
    let Some(id) = declarator.node("id") else { return Vec::new() };
    let variables: Vec<(Node, SymbolId)> = pattern_identifiers(Some(id))
        .into_iter()
        .filter_map(|identifier| scopes.variable_named(identifier).map(|symbol| (identifier, symbol)))
        .collect();
    if id.is("Identifier") {
        let init = declarator.node("init");
        let kind = if is_mock_creation(apis, init) { mock_kind(apis, init) } else { None };
        let Some(kind) = kind else { return Vec::new() };
        return variables.into_iter().map(|(_, symbol)| Shared { symbol, node: id, kind: Some(kind) }).collect();
    }
    let names = hoisted_mocks(apis, declarator);
    variables
        .into_iter()
        .filter(|(_, symbol)| names.iter().any(|name| name == scopes.name(*symbol)))
        .map(|(identifier, symbol)| {
            let node = scopes.defs(symbol).first().map(|definition| definition.name).unwrap_or(identifier);
            Shared { symbol, node, kind: Some("vitest") }
        })
        .collect()
}
