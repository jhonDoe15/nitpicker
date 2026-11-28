//! `require-error-listener`, as it runs where the checker is not available: streams, sockets, child processes and
//! clients need an `error` listener. The type-based parts of the JavaScript rule (emitter classes found by their
//! type, helpers followed through their declarations) are left out.
use super::emitter_creations::{is_emitter_creation, is_server_creation};
use super::emitter_modules::{is_connection_event, is_listen_method};
use super::error_handling::{Outcome, references_outcome};
use super::names::Env;
use super::names::resolve::{is_function_node, member_name, name_of, resolve_constant, resolve_function, string_value, unwrapped};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::DefKind;
use crate::typescript::rules::support::view::Node;

const RULE: &str = "require-error-listener";
const MESSAGE: &str = "`{{name}}` emits 'error' when its connection, file or process fails, and Node.js throws an 'error' event that has no listener, which stops the process. Attach one where it is created: `{{name}}.on('error', (error) => ...)`, or hand it to `pipeline(...)` or `finished(...)` from `node:stream/promises`, to `events.once(...)`, or read it with `for await`. An exception fits only when a crash of the process is the intended outcome.";

type Found = (u32, u32, String);

fn key_name(key: Node, computed: bool) -> Option<String> {
    if key.is("PrivateIdentifier") {
        return Some(format!("#{}", name_of(Some(key))?));
    }
    if !computed && key.is("Identifier") { name_of(Some(key)) } else { string_value(Some(key)) }
}

fn this_field(member: Node) -> Option<String> {
    let is_field = member.is("MemberExpression") && member.node("object").is_some_and(|object| object.is("ThisExpression"));
    if is_field { key_name(member.node("property")?, member.flag("computed")) } else { None }
}

fn has_other_this(node: Node, root: Node) -> bool {
    if node == root {
        return false;
    }
    let is_function = matches!(node.kind(), "FunctionDeclaration" | "FunctionExpression");
    let own = node.parent().is_some_and(|parent| matches!(parent.kind(), "MethodDefinition" | "PropertyDefinition"));
    node.is("ClassBody") || (is_function && !own)
}

fn is_this_alias(node: Node) -> bool {
    node.is("ThisExpression") && node.parent().is_some_and(|parent| parent.is("VariableDeclarator") && parent.node("init") == Some(node))
}

fn field_references<'v>(class_body: Node<'v>, key: &str, written: Option<Node<'v>>) -> Vec<Node<'v>> {
    let mut found = Vec::new();
    let mut pending = vec![class_body];
    while let Some(node) = pending.pop() {
        if !node.is("Program") && Some(node) != written && (this_field(node).as_deref() == Some(key) || is_this_alias(node)) {
            found.push(node);
        }
        if !has_other_this(node, class_body) {
            pending.extend(node.children().into_iter().rev());
        }
    }
    found
}

fn variable_references<'a, 'v>(env: &Env<'a, 'v>, node: Node<'v>, written: Option<Node<'v>>) -> Option<Vec<Node<'v>>> {
    let symbol = env.scopes.variable_named(node)?;
    let declared: Vec<Node> = env.scopes.defs(symbol).iter().map(|definition| definition.name).collect();
    let references = env.scopes.references(symbol);
    Some(references.into_iter().map(|reference| reference.identifier).filter(|identifier| !declared.contains(identifier) && Some(*identifier) != written).collect())
}

fn listener_function<'a, 'v>(env: &Env<'a, 'v>, node: Option<Node<'v>>) -> Option<Node<'v>> {
    match node {
        Some(node) if is_function_node(node) => Some(node),
        other => resolve_function(env, other),
    }
}

fn is_server_receiver<'a, 'v>(env: &Env<'a, 'v>, receiver: Node<'v>) -> bool {
    let target = unwrapped(receiver);
    if !target.is("Identifier") {
        return is_server_creation(env, Some(target));
    }
    let Some(symbol) = env.scopes.variable_named(target) else { return false };
    let definitions = env.scopes.defs(symbol);
    let definition = definitions.first().filter(|definition| definition.kind == DefKind::Variable);
    definition.is_some_and(|definition| is_server_creation(env, definition.node.node("init")))
}

fn connection_listener<'a, 'v>(env: &Env<'a, 'v>, call: Node<'v>) -> Option<Node<'v>> {
    let arguments = call.nodes("arguments");
    if is_server_creation(env, Some(call)) {
        return arguments.iter().rev().find_map(|argument| listener_function(env, Some(*argument)));
    }
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    let listens = is_listen_method(member_name(callee).as_deref())
        && is_connection_event(string_value(resolve_constant(env, arguments.first().copied())).as_deref())
        && callee.node("object").is_some_and(|object| is_server_receiver(env, object));
    if listens { listener_function(env, arguments.get(1).copied()) } else { None }
}

fn report_unhandled(found: &mut Vec<Found>, env: &Env, node: Node, name: &str, references: &[Node]) {
    if references_outcome(env, references) == Outcome::Unhandled {
        found.push((node.start(), node.end(), MESSAGE.replace("{{name}}", name)));
    }
}

fn check_variable<'a, 'v>(found: &mut Vec<Found>, env: &Env<'a, 'v>, node: Node<'v>, identifier: Node<'v>) {
    if let Some(references) = variable_references(env, identifier, Some(identifier)) {
        report_unhandled(found, env, node, &name_of(Some(identifier)).unwrap_or_default(), &references);
    }
}

fn check_field<'a, 'v>(found: &mut Vec<Found>, env: &Env<'a, 'v>, node: Node<'v>, key: &str, written: Option<Node<'v>>) {
    if let Some(class_body) = node.ancestors().find(|ancestor| ancestor.is("ClassBody")) {
        report_unhandled(found, env, node, &format!("this.{key}"), &field_references(class_body, key, written));
    }
}

fn check_connection<'a, 'v>(found: &mut Vec<Found>, env: &Env<'a, 'v>, node: Node<'v>) {
    let Some(listener) = connection_listener(env, node) else { return };
    let Some(socket) = listener.nodes("params").first().copied().filter(|socket| socket.is("Identifier")) else { return };
    let name = name_of(Some(socket)).unwrap_or_default();
    let own_name = listener.node("id").filter(|id| id.name().as_deref() == Some(name.as_str()));
    let references = match own_name {
        Some(id) => variable_references(env, id, None),
        None if name == "this" => Some(Vec::new()),
        None => variable_references(env, socket, None),
    };
    if let Some(references) = references {
        report_unhandled(found, env, socket, &name, &references);
    }
}

fn check_assignment<'a, 'v>(found: &mut Vec<Found>, env: &Env<'a, 'v>, node: Node<'v>) {
    let operator = node.text("operator");
    let (Some(left), Some(right)) = (node.node("left"), node.node("right")) else { return };
    if !matches!(operator.as_deref(), Some("=" | "??=" | "||=")) || !is_emitter_creation(env, right) {
        return;
    }
    match this_field(left) {
        Some(key) => check_field(found, env, right, &key, Some(left)),
        None if left.is("Identifier") => check_variable(found, env, right, left),
        None => {}
    }
}

fn check_declarator<'a, 'v>(found: &mut Vec<Found>, env: &Env<'a, 'v>, node: Node<'v>) {
    let (Some(id), Some(init)) = (node.node("id"), node.node("init")) else { return };
    let exported = node.parent().and_then(|declaration| declaration.parent()).is_some_and(|statement| statement.is("ExportNamedDeclaration"));
    if id.is("Identifier") && !exported && is_emitter_creation(env, init) {
        check_variable(found, env, init, id);
    }
}

fn check_property<'a, 'v>(found: &mut Vec<Found>, env: &Env<'a, 'v>, node: Node<'v>) {
    let (Some(key), Some(value)) = (node.node("key").and_then(|key| key_name(key, node.flag("computed"))), node.node("value")) else { return };
    if !node.flag("static") && is_emitter_creation(env, value) {
        check_field(found, env, value, &key, None);
    }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let env = Env::new(view, scopes);
    let mut found: Vec<Found> = Vec::new();
    for node in view.nodes() {
        match node.kind() {
            "VariableDeclarator" => check_declarator(&mut found, &env, node),
            "AssignmentExpression" => check_assignment(&mut found, &env, node),
            "PropertyDefinition" => check_property(&mut found, &env, node),
            "CallExpression" | "NewExpression" => check_connection(&mut found, &env, node),
            _ => {}
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}

