use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::{DefKind, Def, Scopes};
use crate::typescript::rules::support::view::{Node, View};
use oxc_semantic::SymbolId;
use std::collections::HashSet;

const RULE: &str = "no-self-recursion";
const EXCEPTION_ROUTE: &str = " An exception fits only when the recursion is bounded and deliberate.";
const FUNCTIONS: [&str; 3] = ["ArrowFunctionExpression", "FunctionExpression", "FunctionDeclaration"];
const ITERATION_METHODS: [&str; 12] =
    ["map", "flatMap", "forEach", "filter", "reduce", "reduceRight", "some", "every", "find", "findIndex", "toSorted", "sort"];
const DEFERRING_CALLEES: [&str; 13] = [
    "setTimeout", "setInterval", "setImmediate", "queueMicrotask", "requestAnimationFrame", "requestIdleCallback", "nextTick", "on",
    "once", "addEventListener", "addListener", "prependListener", "subscribe",
];

#[derive(Clone, Copy)]
struct Edge {
    source: u32,
    target: u32,
    node: u32,
}

fn is_function(node: Node) -> bool {
    FUNCTIONS.contains(&node.kind())
}

fn bound_function<'v>(definition: &Def<'v>) -> Option<Node<'v>> {
    match definition.kind {
        DefKind::FunctionName => Some(definition.node),
        DefKind::Variable => definition.node.node("init").filter(|init| is_function(*init)),
        _ => None,
    }
}

fn is_call(node: Node) -> bool {
    node.is("CallExpression") || node.is("NewExpression")
}

fn is_argument(call: Node, node: Node) -> bool {
    call.list("arguments").into_iter().any(|argument| argument == Some(node))
}

fn is_iteration_callback(node: Node, call: Node) -> bool {
    is_argument(call, node)
        && call.node("callee").is_some_and(|callee| {
            callee.is("MemberExpression")
                && callee.node("property").and_then(|property| property.name()).is_some_and(|name| ITERATION_METHODS.contains(&name.as_ref()))
        })
}

fn callee_name(callee: Node) -> Option<String> {
    if callee.is("Identifier") {
        return callee.name().map(|name| name.into_owned());
    }
    callee.is("MemberExpression").then(|| callee.node("property").and_then(|property| property.name()).map(|name| name.into_owned())).flatten()
}

fn is_run_by_its_call(function: Node) -> bool {
    let Some(parent) = function.parent().filter(|parent| parent.is("CallExpression") && is_argument(*parent, function)) else { return false };
    if is_iteration_callback(function, parent) {
        return true;
    }
    let statement = parent.parent().is_some_and(|outer| outer.is("ExpressionStatement"));
    let deferring = parent.node("callee").and_then(callee_name).is_some_and(|name| DEFERRING_CALLEES.contains(&name.as_str()));
    !statement && !deferring
}

fn calling_function(node: Node, target: Node) -> Option<u32> {
    let functions: Vec<Node> = node.ancestors().filter(|ancestor| is_function(*ancestor)).collect();
    functions.iter().find(|function| **function == target || !is_run_by_its_call(**function)).or(functions.last()).map(|function| function.index)
}

fn is_call_edge(identifier: Node) -> bool {
    identifier.parent().is_some_and(|parent| is_call(parent) && (parent.node("callee") == Some(identifier) || is_iteration_callback(identifier, parent)))
}

/// oxc merges a `var` that redeclares a catch parameter into the parameter's symbol. ESLint keeps two variables:
/// the parameter, which the catch clause's own references reach, and the hoisted `var`, which takes the rest.
fn edges_to(scopes: &Scopes, symbol: SymbolId) -> Vec<Edge> {
    let defs = scopes.defs(symbol);
    let caught = defs.iter().find(|definition| definition.kind == DefKind::CatchClause).map(|definition| definition.node);
    let Some(target) = defs.iter().filter(|definition| caught.is_none() || definition.kind == DefKind::Variable).find_map(bound_function) else {
        return Vec::new();
    };
    let outside = |identifier: Node| caught.is_none_or(|clause| !clause.contains(identifier));
    let calls = scopes.references(symbol).into_iter().filter(|reference| outside(reference.identifier) && is_call_edge(reference.identifier));
    calls
        .filter_map(|reference| {
            calling_function(reference.identifier, target).map(|source| Edge { source, target: target.index, node: reference.identifier.index })
        })
        .collect()
}

fn reachable_from(start: u32, edges: &[Edge]) -> Vec<u32> {
    let mut seen = vec![start];
    let mut index = 0;
    while index < seen.len() {
        let current = seen[index];
        for edge in edges.iter().filter(|edge| edge.source == current) {
            if !seen.contains(&edge.target) {
                seen.push(edge.target);
            }
        }
        index += 1;
    }
    seen
}

fn is_ancestor(view: &View, node: u32, ancestor: u32) -> bool {
    view.at(node).ancestors().any(|found| found.index == ancestor)
}

fn function_name(view: &View, function: u32) -> String {
    let id_name = |node: Option<Node>| node.and_then(|node| node.node("id")).and_then(|id| id.name()).map(|name| name.into_owned());
    let function = view.at(function);
    id_name(Some(function)).or_else(|| id_name(function.parent())).unwrap_or_else(|| "undefined".to_string())
}

fn calls_back(source: u32, target: u32, edges: &[Edge]) -> bool {
    edges.iter().any(|edge| edge.source == target && edge.target == source)
}

fn starts_cycle(view: &View, edge: Edge, edges: &[Edge]) -> bool {
    let closed_by_nested_call = is_ancestor(view, edge.target, edge.source) && calls_back(edge.source, edge.target, edges);
    if closed_by_nested_call || !reachable_from(edge.target, edges).contains(&edge.source) {
        return false;
    }
    let start = view.at(edge.source).start();
    reachable_from(edge.source, edges)
        .into_iter()
        .filter(|member| reachable_from(*member, edges).contains(&edge.source))
        .all(|member| start <= view.at(member).start())
}

fn recursion_message(name: &str, domain: bool) -> String {
    if domain {
        return format!("'{name}' calls itself. domain/ has no loops and no recursion, so a walk over data of unknown depth (a tree) belongs in adapters/: for...of over a worklist, pushing each node's children onto it. Pass domain/ the flat result; flat data uses map, filter, flatMap or Object.fromEntries.{EXCEPTION_ROUTE}");
    }
    format!("'{name}' calls itself. Retry or poll: loop with for...of over attempt numbers. Tree walk (directories, AST, JSON): for...of over a worklist, pushing each node's children onto it (for (const node of pending) {{ pending.push(...children) }}). Flat data: map, filter, flatMap or Object.fromEntries. A component that renders itself in JSX is not reported.{EXCEPTION_ROUTE}")
}

fn report_of(view: &View, edge: Edge, edges: &[Edge], domain: bool) -> Option<String> {
    if edge.source == edge.target {
        return Some(recursion_message(&function_name(view, edge.source), domain));
    }
    if is_ancestor(view, edge.source, edge.target) && reachable_from(edge.target, edges).contains(&edge.source) {
        return Some(recursion_message(&function_name(view, edge.target), domain));
    }
    starts_cycle(view, edge, edges).then(|| {
        let (name, other) = (function_name(view, edge.source), function_name(view, edge.target));
        format!("'{name}' and '{other}' call each other. Replace the cycle with a for...of loop over a worklist, or merge them into one function that loops.{EXCEPTION_ROUTE}")
    })
}

/// `/(?:^|\/)features\/[^/]+\/domain\//` on the file's path.
fn is_domain_path(path: &str) -> bool {
    let parts: Vec<&str> = path.split('/').collect();
    parts.windows(4).any(|window| window[0] == "features" && !window[1].is_empty() && window[2] == "domain")
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let domain = is_domain_path(&context.file.path.replace('\\', "/"));
    let symbols: Vec<SymbolId> = context.semantic.scoping().symbol_ids().collect();
    let mut seen = HashSet::new();
    let edges: Vec<Edge> = symbols.into_iter().flat_map(|symbol| edges_to(scopes, symbol)).filter(|edge| seen.insert(edge.node)).collect();
    let found: Vec<(u32, u32, String)> = edges
        .iter()
        .filter_map(|edge| report_of(view, *edge, &edges, domain).map(|message| (view.at(edge.node).start(), view.at(edge.node).end(), message)))
        .collect();
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
