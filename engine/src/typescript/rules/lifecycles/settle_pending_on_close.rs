use super::close_scopes::{closers_of, function_name, is_function, name_of, root_name};
use super::collections::{Use, added_value, collections_of, use_kind, uses_of};
use super::pending_values::holds_settlers;
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;

const MAX_DEPTH: usize = 3;
const ITERATING: [&str; 5] = ["forEach", "values", "entries", "keys", "map"];
const LOGGERS: [&str; 3] = ["console", "logger", "log"];
const BOOKKEEPING: [&str; 6] = ["delete", "has", "add", "set", "push", "includes"];

fn pattern_names(pattern: Node) -> Vec<String> {
    pattern.descendants().into_iter().filter(|node| node.is("Identifier")).filter_map(|node| name_of(Some(node))).collect()
}

fn property_named(callee: Option<Node>, names: &[&str]) -> bool {
    callee.filter(|callee| callee.is("MemberExpression")).and_then(|callee| name_of(callee.node("property"))).is_some_and(|name| names.contains(&name.as_str()))
}

fn call_settles(node: Node, names: &[String]) -> bool {
    if !node.is("CallExpression") {
        return false;
    }
    let root = root_name(node.node("callee"));
    let handed = node.nodes("arguments").into_iter().any(|argument| root_name(Some(argument)).is_some_and(|name| names.contains(&name)));
    let bookkeeping = property_named(node.node("callee"), &BOOKKEEPING);
    root.as_ref().is_some_and(|root| names.contains(root)) || (handed && !root.is_some_and(|root| LOGGERS.contains(&root.as_str())) && !bookkeeping)
}

fn calls_any(body: Option<Node>, names: &[String]) -> bool {
    body.is_some_and(|body| body.descendants().into_iter().any(|node| call_settles(node, names)))
}

fn callback_settles(call: Node) -> bool {
    call.nodes("arguments").into_iter().any(|callback| {
        is_function(callback) && calls_any(callback.node("body"), &callback.nodes("params").into_iter().flat_map(pattern_names).collect::<Vec<_>>())
    })
}

fn handed_over(used: Node) -> bool {
    let Use::Read { call: Some(call), .. } = use_kind(used) else { return false };
    call.parent().is_some_and(|holder| (holder.is("CallExpression") && holder.nodes("arguments").contains(&call)) || holder.is("SpreadElement"))
}

fn alias_of(used: Node) -> Option<String> {
    let declarator = used.ancestors().find(|node| node.is("VariableDeclarator"))?;
    declarator.node("id").filter(|id| id.is("Identifier")).and_then(|id| name_of(Some(id)))
}

fn loop_settles(node: Node, iterated: impl Fn(Option<Node>) -> bool) -> bool {
    if node.is("ForOfStatement") {
        return iterated(node.node("right")) && calls_any(node.node("body"), &node.node("left").map(pattern_names).unwrap_or_default());
    }
    let callee = node.is("CallExpression").then(|| node.node("callee")).flatten();
    property_named(callee, &ITERATING) && iterated(callee.and_then(|callee| callee.node("object"))) && callback_settles(node)
}

fn alias_settled(function: Node, alias: &str) -> bool {
    let is_alias = |expression: Option<Node>| root_name(expression).as_deref() == Some(alias);
    function.descendants().into_iter().any(|node| {
        (node.is("CallExpression") && node.nodes("arguments").into_iter().any(|argument| is_alias(Some(argument)))) || loop_settles(node, is_alias)
    })
}

fn iterates_and_calls(used: Node) -> bool {
    used.ancestors().any(|node| loop_settles(node, |expression| expression.is_some_and(|expression| expression.contains(used))))
}

fn settles_in(function: Node, uses: &[Node]) -> bool {
    uses.iter().filter(|used| function.contains(**used)).any(|used| match use_kind(*used) {
        Use::Escape => true,
        Use::Read { .. } => handed_over(*used) || iterates_and_calls(*used) || alias_of(*used).is_some_and(|alias| alias_settled(function, &alias)),
        _ => false,
    })
}

fn callee_name(call: Node) -> Option<String> {
    let callee = call.node("callee")?;
    name_of(if callee.is("MemberExpression") { callee.node("property") } else { Some(callee) })
}

fn own_calls<'v>(function: Node<'v>, container: Node<'v>, closers: &[Node<'v>]) -> Vec<Node<'v>> {
    let names: Vec<Option<String>> = function.descendants().into_iter().filter(|node| node.is("CallExpression")).map(callee_name).collect();
    container.descendants().into_iter().filter(|node| is_function(*node) && names.contains(&function_name(*node)) && !closers.contains(node)).collect()
}

fn reachable<'v>(closer: Node<'v>, container: Node<'v>, closers: &[Node<'v>]) -> Vec<Node<'v>> {
    let mut seen = vec![closer];
    let mut frontier = vec![closer];
    for _ in 0..MAX_DEPTH {
        let mut next: Vec<Node> = Vec::new();
        for function in frontier.iter().flat_map(|function| own_calls(*function, container, closers)) {
            if !seen.contains(&function) {
                next.push(function);
            }
        }
        seen.extend(next.iter().copied());
        frontier = next;
    }
    seen
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let mut found = Vec::new();
    for container in view.nodes().filter(|node| is_function(*node) || matches!(node.kind(), "ClassBody" | "Program")) {
        let closers = closers_of(container);
        let Some(first) = closers.first() else { continue };
        for binding in collections_of(scopes, container) {
            let uses = uses_of(scopes, &binding, container);
            let added: Vec<Option<Node>> = uses.iter().filter_map(|used| match use_kind(*used) {
                Use::Add { call, method, .. } => Some(added_value(call, &method)),
                _ => None,
            }).collect();
            if !holds_settlers(&binding, &added) {
                continue;
            }
            let settled = closers.iter().any(|closer| reachable(*closer, container, &closers).into_iter().any(|function| settles_in(function, &uses)));
            if !settled {
                let name = binding.name.clone().unwrap_or_else(|| "undefined".to_string());
                let closer = function_name(*first).unwrap_or_default();
                found.push((binding.node.start(), binding.node.end(), format!("{name} keeps pending requests (callbacks or resolve and reject pairs), but {closer}() never settles them, so every caller still waiting hangs forever. Reject each entry with an error before clearing: `for (const entry of {name}.values()) {{ entry.reject(new Error(\"closed\")); }} {name}.clear();`, or hand {name} to a helper that does. An exception fits only when the entries are settled elsewhere before the scope closes.")));
            }
        }
    }
    for (start, end, message) in found {
        context.report_range("settle-pending-on-close", start, Some(end), message);
    }
}
