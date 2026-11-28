//! `no-uncleared-shared-mock`: a mock that the tests of a file share, whose calls a test counts, and that nothing
//! clears between the tests.
mod declared;
mod sites;
mod tests;

use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::{Reference, Scopes};
use crate::typescript::rules::support::view::{Node, View};
use crate::typescript::rules::test_quality::test_calls::{chain_has_property, test_callback};
use crate::typescript::rules::test_runtime::runner_apis::Apis;
use crate::typescript::rules::test_values::{find_variable, is_write};
use declared::{Shared, declared_mocks, is_shared_level};
use sites::{CountRead, clears_every_mock, cleared_mock, count_read, mocked_module, reset_call_for};
use std::collections::{HashMap, HashSet};
use tests::{IdentifierTokens, TestCall, enclosing_tests};

const RULE: &str = "no-uncleared-shared-mock";
const REPEATED_CASES: [&str; 2] = ["each", "for"];
const REPEATED_WEIGHT: usize = 2;

#[derive(Default)]
struct State<'v> {
    shared: Vec<Shared<'v>>,
    tests: Vec<TestCall<'v>>,
    reads: Vec<CountRead<'v>>,
    clears: Vec<(Option<String>, Node<'v>)>,
    mocked_sources: HashMap<String, Option<&'static str>>,
    imports: Vec<Node<'v>>,
    clears_all: bool,
}

fn weight_of(test: &TestCall) -> usize {
    let Some(callee) = test.call.node("callee") else { return 1 };
    if !REPEATED_CASES.iter().any(|name| chain_has_property(callee, name)) {
        return 1;
    }
    let cases = if callee.is("CallExpression") { callee.list("arguments").first().copied().flatten() } else { None };
    match cases.filter(|cases| cases.is("ArrayExpression")) {
        Some(cases) => cases.list("elements").len().min(REPEATED_WEIGHT),
        None => REPEATED_WEIGHT,
    }
}

fn visit<'v>(scopes: &Scopes<'_, 'v>, apis: &mut Apis, state: &mut State<'v>, node: Node<'v>) {
    apis.observe(node);
    match node.kind() {
        "ImportDeclaration" if node.text("importKind").as_deref() != Some("type") => state.imports.push(node),
        "VariableDeclarator" if is_shared_level(node.parent()) => state.shared.extend(declared_mocks(scopes, apis, node)),
        "CallExpression" => {
            if let Some(body) = test_callback(scopes, node) {
                state.tests.push(TestCall { call: node, body });
            }
            if let Some((source, kind)) = mocked_module(apis, node) {
                state.mocked_sources.insert(source, kind);
            }
            state.clears_all |= clears_every_mock(apis, node);
            if let Some(name) = cleared_mock(apis, node) {
                state.clears.push((name, node));
            }
        }
        "MemberExpression" => state.reads.extend(count_read(apis, node)),
        _ => {}
    }
}

fn imported_mocks<'v>(scopes: &Scopes<'_, 'v>, state: &State<'v>) -> Vec<Shared<'v>> {
    let mut found = Vec::new();
    for declaration in &state.imports {
        let Some(kind) = declaration.node("source").and_then(|source| source.text("value")).and_then(|source| state.mocked_sources.get(source.as_ref())) else { continue };
        for specifier in declaration.nodes("specifiers") {
            let Some(local) = specifier.node("local") else { continue };
            if let Some(symbol) = scopes.variable_named(local).or_else(|| find_variable(scopes, local)) {
                let node = scopes.defs(symbol).first().map(|definition| definition.name).unwrap_or(*declaration);
                found.push(Shared { symbol, node, kind: *kind });
            }
        }
    }
    found
}

/// A value use of a name that oxc leaves unresolved because the import binding is type-only (`import { type m }`);
/// the ESLint scope manager resolves it to that binding.
fn left_to_import(identifier: Node) -> Reference {
    let written = identifier.parent().is_some_and(|parent| {
        (parent.is("AssignmentExpression") && parent.node("left") == Some(identifier)) || parent.is("UpdateExpression")
    });
    Reference { identifier, read: !written, write: written, as_type: false }
}

/// The ESLint scope manager does not visit the type annotation of a `catch` parameter.
fn in_catch_parameter_type(identifier: Node) -> bool {
    identifier.ancestors().any(|ancestor| {
        ancestor.is("TSTypeAnnotation")
            && ancestor.parent().is_some_and(|parameter| parameter.parent().is_some_and(|clause| clause.is("CatchClause") && clause.node("param") == Some(parameter)))
    })
}

/// typescript-eslint references both parts of a namespaced element name (`<m:x />`) as variables.
fn namespaced_jsx_uses<'v>(view: &'v View, scopes: &Scopes<'_, 'v>, symbol: oxc_semantic::SymbolId) -> Vec<Reference<'v>> {
    let name = scopes.name(symbol);
    view.nodes()
        .filter(|node| node.is("JSXNamespacedName") && node.parent().is_some_and(|parent| parent.is("JSXOpeningElement") || parent.is("JSXClosingElement")))
        .flat_map(|node| [node.node("namespace"), node.node("name")])
        .flatten()
        .filter(|part| part.name().as_deref() == Some(name) && scopes.variable_by_name(name, part.start()) == Some(symbol))
        .map(|identifier| Reference { identifier, read: true, write: false, as_type: false })
        .collect()
}

struct Report {
    start: u32,
    end: u32,
    message: String,
}

fn report(context: &Context, view: &View, scopes: &Scopes, tokens: &mut IdentifierTokens, state: &State, cleared: &HashSet<String>, shared: &Shared) -> Option<Report> {
    let name = scopes.name(shared.symbol);
    let names: Vec<Node> = scopes.defs(shared.symbol).iter().map(|definition| definition.name).collect();
    let mut references: Vec<Reference> = scopes
        .references_with_types(shared.symbol)
        .into_iter()
        .filter(|reference| !(reference.write && !reference.read && names.contains(&reference.identifier)))
        .filter(|reference| !in_catch_parameter_type(reference.identifier))
        .collect();
    references.extend(namespaced_jsx_uses(view, scopes, shared.symbol));
    if scopes.scope_of(shared.symbol).is_some_and(|(_, block)| block.is("Program")) {
        references.extend(scopes.through(name).into_iter().map(left_to_import));
        references.sort_by_key(|reference| reference.identifier.start());
    }
    if references.iter().any(is_write) || cleared.contains(name) {
        return None;
    }
    let mut using: Vec<usize> = references.iter().flat_map(|reference| enclosing_tests(context, view, tokens, &state.tests, reference.identifier)).collect();
    using.sort_unstable();
    using.dedup();
    let weight: usize = using.iter().map(|at| weight_of(&state.tests[*at])).sum();
    let read = state.reads.iter().find(|each| {
        references.iter().any(|reference| each.node.contains(reference.identifier)) && state.tests.iter().any(|test| test.body.contains(each.node))
    });
    let read = read.filter(|_| weight >= 2)?;
    let message = format!(
        "`{name}` is shared by {weight} tests and keeps its calls between them, so `{}` also counts the calls of earlier tests and the result depends on test order. Clear it before each test (`beforeEach(() => {{ {}; }})`, or `clearMocks: true` in the runner config), or create the mock inside the test.",
        read.form,
        reset_call_for(shared.kind, name)
    );
    Some(Report { start: shared.node.start(), end: shared.node.end(), message })
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let mut apis = Apis::new();
    let mut state = State::default();
    for node in view.nodes() {
        visit(scopes, &mut apis, &mut state, node);
    }
    let mut candidates = std::mem::take(&mut state.shared);
    candidates.extend(imported_mocks(scopes, &state));
    let names: HashSet<&str> = candidates.iter().map(|shared| scopes.name(shared.symbol)).collect();
    let mut cleared = HashSet::new();
    for (name, node) in &state.clears {
        let in_test = state.tests.iter().any(|test| test.body.contains(*node));
        state.clears_all |= !in_test && name.as_ref().is_none_or(|name| !names.contains(name.as_str()));
        cleared.extend(name.clone());
    }
    if state.clears_all {
        return;
    }
    let mut tokens = IdentifierTokens::new();
    let found: Vec<Report> = candidates.iter().filter_map(|shared| report(context, view, scopes, &mut tokens, &state, &cleared, shared)).collect();
    for Report { start, end, message } in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
