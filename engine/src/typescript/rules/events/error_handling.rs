//! `error-handling.mts` without type information: what happens to an emitter at each place it is used.
use super::emitter_creations::{called_name, imported_name, listens_for_errors};
use super::emitter_modules::{HANDLING_CALLS, HANDLING_STATICS, Handler, INPUT_READERS, is_chainable_method, is_consuming_method};
use super::names::Env;
use super::names::resolve::{is_call, member_name, static_key};
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::Node;

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Outcome {
    Handled,
    Neutral,
    Escaped,
    Unhandled,
}

const TYPE_WRAPPERS: [&str; 5] = ["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression", "TSTypeAssertion", "ChainExpression"];
const ESCAPES: [(&str, &str); 8] = [
    ("ReturnStatement", "argument"),
    ("YieldExpression", "argument"),
    ("ArrowFunctionExpression", "body"),
    ("AssignmentExpression", "right"),
    ("VariableDeclarator", "init"),
    ("ExportDefaultDeclaration", "declaration"),
    ("ExportSpecifier", "local"),
    ("SpreadElement", "argument"),
];

/// `outerOf`: the node inside however many type assertions and optional chains wrap it.
fn outer_of(node: Node) -> Node {
    let mut current = node;
    while let Some(parent) = current.parent() {
        if TYPE_WRAPPERS.contains(&parent.kind()) && parent.node("expression") == Some(current) {
            current = parent;
        } else {
            break;
        }
    }
    if current.is("Program") { node } else { current }
}

fn method_call(member: Node) -> Option<Node> {
    let call = member.parent()?;
    (call.is("CallExpression") && call.node("callee") == Some(member)).then_some(call)
}

fn next_chained_call(call: Node) -> Option<Node> {
    if !is_chainable_method(call.node("callee").and_then(member_name).as_deref()) {
        return None;
    }
    let outer = outer_of(call);
    let next = outer.parent()?;
    if next.is("MemberExpression") && next.node("object") == Some(outer) { method_call(next) } else { None }
}

fn receiver_outcome<'a, 'v>(env: &Env<'a, 'v>, member: Node<'v>) -> Outcome {
    let mut calls = Vec::new();
    let mut current = method_call(member);
    while let Some(call) = current {
        calls.push(call);
        current = next_chained_call(call);
    }
    let handled = calls.iter().any(|call| listens_for_errors(env, *call)) || (!calls.is_empty() && is_consuming_method(member_name(member).as_deref()));
    if handled { Outcome::Handled } else { Outcome::Neutral }
}

fn fits_position(entry: &Handler, call: Node, argument: Node) -> bool {
    !entry.first || call.nodes("arguments").first() == Some(&argument)
}

fn is_static_handler<'a, 'v>(env: &Env<'a, 'v>, call: Node<'v>, argument: Node<'v>) -> bool {
    let Some(callee) = call.node("callee").filter(|callee| callee.is("MemberExpression")) else { return false };
    let name = member_name(callee).unwrap_or_default();
    HANDLING_STATICS.iter().any(|entry| {
        fits_position(entry, call, argument)
            && entry.names.contains(&name.as_str())
            && callee.node("object").is_some_and(|object| imported_name(env, object, entry.modules).as_deref() == entry.owner)
    })
}

fn is_call_to<'a, 'v, 'h>(env: &Env<'a, 'v>, call: Node<'v>, entries: &'h [Handler]) -> Option<&'h Handler> {
    entries.iter().find(|entry| called_name(env, call, entry.modules).is_some_and(|name| entry.names.contains(&name.as_str())))
}

fn is_handling_call<'a, 'v>(env: &Env<'a, 'v>, call: Node<'v>, argument: Node<'v>) -> bool {
    let direct = is_call_to(env, call, &HANDLING_CALLS);
    direct.is_some_and(|entry| fits_position(entry, call, argument)) || is_static_handler(env, call, argument)
}

fn is_project_callee<'a, 'v>(env: &Env<'a, 'v>, callee: Node<'v>) -> bool {
    if callee.is("MemberExpression") {
        return callee.node("object").is_some_and(|object| object.is("ThisExpression"));
    }
    if !callee.is("Identifier") {
        return false;
    }
    let Some(symbol) = env.scopes.variable_named(callee) else { return false };
    let definitions = env.scopes.defs(symbol);
    let Some(definition) = definitions.first() else { return false };
    match definition.kind {
        DefKind::FunctionName | DefKind::ClassName => true,
        DefKind::ImportBinding => definition.node.parent().is_some_and(|parent| {
            parent.is("ImportDeclaration") && parent.node("source").and_then(|source| source.text("value")).is_some_and(|source| source.starts_with('.'))
        }),
        _ => false,
    }
}

fn argument_outcome<'a, 'v>(env: &Env<'a, 'v>, call: Node<'v>, argument: Node<'v>) -> Outcome {
    if is_handling_call(env, call, argument) {
        return Outcome::Handled;
    }
    if !call.nodes("arguments").contains(&argument) {
        return Outcome::Neutral;
    }
    if call.node("callee").is_some_and(|callee| is_project_callee(env, callee)) { Outcome::Escaped } else { Outcome::Neutral }
}

fn is_container(node: Node) -> bool {
    matches!(node.kind(), "ObjectExpression" | "ArrayExpression" | "Property" | "SpreadElement")
}

fn container_root(node: Node) -> Node {
    let mut current = node;
    while let Some(parent) = current.parent().filter(|parent| is_container(*parent)) {
        current = parent;
    }
    current
}

fn is_reader_input<'a, 'v>(env: &Env<'a, 'v>, property: Node<'v>) -> bool {
    let Some(object) = property.parent() else { return false };
    let Some(call) = object.parent() else { return false };
    static_key(property).as_deref() == Some("input")
        && is_call(call)
        && call.nodes("arguments").first() == Some(&object)
        && is_call_to(env, call, &INPUT_READERS).is_some()
}

fn escape_outcome(parent: Node, node: Node) -> Outcome {
    let field = ESCAPES.iter().find(|(kind, _)| parent.is(kind)).map(|(_, field)| *field);
    if field.is_some_and(|field| parent.node(field) == Some(node)) { Outcome::Escaped } else { Outcome::Neutral }
}

fn contained_outcome<'a, 'v>(env: &Env<'a, 'v>, node: Node<'v>) -> Outcome {
    if node.parent().is_some_and(|parent| parent.is("Property") && is_reader_input(env, parent)) {
        return Outcome::Handled;
    }
    let root = container_root(node);
    root.parent().map_or(Outcome::Neutral, |parent| escape_outcome(parent, root))
}

fn reference_outcome<'a, 'v>(env: &Env<'a, 'v>, reference: Node<'v>) -> Outcome {
    let node = outer_of(reference);
    let Some(parent) = node.parent() else { return Outcome::Neutral };
    if parent.is("MemberExpression") && parent.node("object") == Some(node) {
        return receiver_outcome(env, parent);
    }
    if parent.is("ForOfStatement") && parent.flag("await") && parent.node("right") == Some(node) {
        return Outcome::Handled;
    }
    if is_call(parent) && parent.node("callee") != Some(node) {
        return argument_outcome(env, parent, node);
    }
    if (parent.is("Property") && parent.node("value") == Some(node)) || parent.is("ArrayExpression") {
        return contained_outcome(env, node);
    }
    escape_outcome(parent, node)
}

/// `referencesOutcome`: handled, escaped, or `Unhandled` when no use of the emitter takes care of its errors.
pub fn references_outcome<'a, 'v>(env: &Env<'a, 'v>, references: &[Node<'v>]) -> Outcome {
    let outcomes: Vec<Outcome> = references.iter().map(|reference| reference_outcome(env, *reference)).collect();
    if outcomes.contains(&Outcome::Handled) {
        Outcome::Handled
    } else if outcomes.contains(&Outcome::Escaped) {
        Outcome::Escaped
    } else {
        Outcome::Unhandled
    }
}
