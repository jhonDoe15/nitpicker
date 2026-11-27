//! Sinks on the taint layer, and sinks that the parameters of their method reach: those wait for the whole run,
//! since a call anywhere that hands such a parameter a tainted value raises the finding to priority 1.
//! The sinks are those of FindSecBugs' path, SQL, command and LDAP injection patterns (`injection.rs`).
use super::calls::{Key, constructor, declared, key};
use super::derived::{Body, Derived, Waiting};
use super::flow::{Flow, Mode, Shared};
use super::injection::{self, Sink};
use super::lines;
use super::{Level, THIS, Value};
use crate::engine::finding::Finding;
use crate::engine::source::{children, named_children};
use crate::java::spotbugs::{Context, place};
use crate::java::types::expr::Call;
use crate::java::types::model::Type;
use std::collections::HashSet;
use tree_sitter::Node;

/// The bodies of a class: methods, constructors and initializers, each with its parameters and the method it is.
fn bodies<'a>(context: &Context<'a>, own: &str, class: Node<'a>) -> Vec<(Node<'a>, Option<Node<'a>>, Option<Key>)> {
    let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"));
    let Some(body) = body else { return Vec::new() };
    let mut members = children(body);
    members.extend(children(body).into_iter().filter(|part| part.kind() == "enum_body_declarations").flat_map(children));
    let mut found = Vec::new();
    for member in members {
        match member.kind() {
            "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => {
                let listed = if member.kind() == "compact_constructor_declaration" { class } else { member };
                let parameters = listed.child_by_field_name("parameters");
                found.extend(member.child_by_field_name("body").map(|body| (body, parameters, Some(declared(context, own, member)))));
            }
            "static_initializer" => found.extend(children(member).into_iter().find(|part| part.kind() == "block").map(|block| (block, None, None))),
            "block" => found.push((member, None, None)),
            "field_declaration" => {
                let values = children(member).into_iter().filter(|part| part.kind() == "variable_declarator").filter_map(|part| part.child_by_field_name("value"));
                found.extend(values.map(|value| (value, None, None)));
            }
            _ => {}
        }
    }
    found
}

/// The lambdas of a body, the body itself when it is one and those inside other lambdas too, but not those of
/// classes declared in it.
fn lambdas(body: Node) -> Vec<Node> {
    let mut found = Vec::new();
    let mut pending = vec![body];
    while let Some(node) = pending.pop() {
        if node.kind() == "class_body" {
            continue;
        }
        if node.kind() == "lambda_expression" {
            found.push(node);
        }
        pending.extend(children(node));
    }
    found
}

/// The sink calls of a body, outside its lambdas and classes.
fn sinks<'a>(context: &Context<'a>, own: &str, body: Node<'a>) -> Vec<(Node<'a>, Sink)> {
    let mut found = Vec::new();
    let mut pending = vec![body];
    while let Some(node) = pending.pop() {
        if matches!(node.kind(), "class_body" | "lambda_expression") && node != body {
            continue;
        }
        if matches!(node.kind(), "method_invocation" | "object_creation_expression" | "explicit_constructor_invocation")
            && let Some(sink) = injection::sink(context, node, own)
            && context.wants(&[sink.pattern])
        {
            found.push((node, sink));
        }
        pending.extend(children(node));
    }
    found
}

/// The arguments of a call, a variable number of trailing ones merged into the array they become.
fn handed(flow: &Flow, node: Node, call: Option<Call>) -> Vec<Value> {
    let given: Vec<Node> = node.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let mut values: Vec<Value> = given.iter().map(|argument| flow.value(*argument)).collect();
    let Some(call) = call else { return values };
    let count = call.method.parameters.len();
    let packed = call.method.varargs && count > 0 && (values.len() != count || {
        let last = given.last().and_then(|last| flow.context().resolver.type_of(*last));
        !last.is_some_and(|kind| matches!(kind, Type::Array(_) | Type::Null))
    });
    if packed {
        let rest = values.split_off((count - 1).min(values.len()));
        values.push(rest.into_iter().fold(Value::SAFE, Value::merge));
    }
    values
}

fn resolved(context: &Context, node: Node) -> Option<Call> {
    match node.kind() {
        "method_invocation" => context.resolver.resolve_call(node),
        "object_creation_expression" => context.resolver.resolve_constructor(node),
        _ => context.resolver.resolve_delegation(node),
    }
}

/// Notes the methods of the run a body without sinks calls, so that it can be worked out at the end if one of
/// them has a finding that waits for its callers.
fn note(context: &Context, file: &str, own: &str, body: Node, parameters: Option<Node>, method: Option<Key>, derived: &Derived) {
    let mut called = HashSet::new();
    let mut pending = vec![body];
    while let Some(node) = pending.pop() {
        if matches!(node.kind(), "class_body" | "lambda_expression") && node != body {
            continue;
        }
        let callee = match node.kind() {
            "method_invocation" => context.resolver.resolve_call(node).map(|call| (key(&call), call)),
            "object_creation_expression" | "explicit_constructor_invocation" => resolved(context, node).map(|call| (constructor(&call), call)),
            _ => None,
        };
        if let Some((callee, call)) = callee
            && (context.classes.contains_key(&call.declaring) || context.project.sources.contains_key(&call.declaring))
        {
            called.insert(callee);
        }
        pending.extend(children(node));
    }
    if called.is_empty() {
        return;
    }
    let (Ok(mut bodies), Ok(mut callers)) = (derived.bodies.lock(), derived.callers.lock()) else { return };
    fn at(node: Node) -> (usize, usize, u16) {
        (node.start_byte(), node.end_byte(), node.kind_id())
    }
    bodies.push(Body { file: file.to_string(), own: own.to_string(), method, at: at(body), parameters: parameters.map(at) });
    for callee in called {
        callers.entry(callee).or_default().push(bodies.len() - 1);
    }
}

/// The methods a sink is in: an anonymous class's `new` runs in that class's constructor.
fn places(context: &Context, node: Node) -> Vec<String> {
    let anonymous = children(node).into_iter().find(|part| part.kind() == "class_body").and_then(|_| context.resolver.scope.names.get(&node.id()));
    match anonymous {
        Some(own) => vec![crate::java::spotbugs::names::anonymous(context, own, node)],
        None => place::methods(context, node),
    }
}

#[allow(clippy::too_many_arguments)]
fn check<'a>(shared: &Shared<'_, 'a>, file: &str, own: &str, body: Node<'a>, parameters: Option<Node<'a>>, method: Option<Key>, anonymous: bool, derived: &Derived) {
    let context = shared.context;
    let found = sinks(context, own, body);
    if found.is_empty() {
        if !anonymous && context.text(body).contains('(') {
            note(context, file, own, body, parameters, method, derived);
        }
        return;
    }
    let mut flow = Flow::new(shared, own, body, parameters, Mode::Report).run();
    if !anonymous && let Ok(mut sites) = derived.sites.lock() {
        sites.extend(std::mem::take(&mut flow.sites).into_iter().map(|site| (method.clone(), site)));
    }
    let mut seen = HashSet::new();
    for (node, sink) in found {
        let values = handed(&flow, node, resolved(context, node));
        let deciding = sink.positions.iter().rev().filter_map(|position| values.get(*position)).find(|value| **value != Value::SAFE);
        let Some(value) = deciding.copied() else { continue };
        let params = value.params & !THIS;
        let level = if value.params & THIS != 0 || (params != 0 && method.is_none()) { value.level.max(Level::Unknown) } else { value.level };
        if level == Level::Safe && (params == 0 || method.is_none()) {
            continue;
        }
        let at = lines::line(context, node);
        if !seen.insert((sink.pattern, at, sink.named.clone(), level, params)) {
            continue;
        }
        for label in places(context, node) {
            let message = injection::message(sink.pattern, &sink.named);
            let Some(finding) = context.finding_listed(sink.pattern, node, at, message, place::function(&label), vec![sink.named.clone()]) else { continue };
            match method.as_ref().filter(|_| params != 0 && level != Level::Tainted) {
                Some(method) => {
                    if let Ok(mut waiting) = derived.waiting.lock() {
                        waiting.push(Waiting { method: method.clone(), params, level, finding });
                    }
                }
                None => context.out.borrow_mut().push(Finding { priority: Some(if level == Level::Tainted { 1 } else { 2 }), ..finding }),
            }
        }
    }
}

/// Reports the injection sinks handed a value that is not safe, in the bodies and lambdas of the classes of a file.
pub fn injections<'a>(context: &Context<'a>, declared: &[Node<'a>], derived: &Derived) {
    if !context.wants(injection::PATTERNS) {
        return;
    }
    let shared = Shared::new(context);
    let file = declared.iter().filter_map(|declaration| context.resolver.scope.names.get(&declaration.id())).find(|name| context.project.sources.contains_key(*name));
    let Some(file) = file.cloned() else { return };
    for declaration in declared {
        let Some(own) = context.resolver.scope.names.get(&declaration.id()) else { continue };
        let anonymous = matches!(declaration.kind(), "object_creation_expression" | "enum_constant");
        for (body, parameters, method) in bodies(context, own, *declaration) {
            if body.kind() != "lambda_expression" {
                check(&shared, &file, own, body, parameters, method, anonymous, derived);
            }
            for lambda in lambdas(body) {
                let (Some(inner), parameters) = (lambda.child_by_field_name("body"), lambda.child_by_field_name("parameters")) else { continue };
                check(&shared, &file, own, inner, parameters, None, anonymous, derived);
            }
        }
    }
}
