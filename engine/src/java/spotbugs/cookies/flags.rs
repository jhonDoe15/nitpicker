//! CookieFlagsDetector, measured on test code: each `new Cookie(..)` (Servlet's `javax` or `jakarta` one itself)
//! stored straight into a local (through parentheses or a cast too) is HTTPONLY_COOKIE unless `setHttpOnly(true)`, and INSECURE_COOKIE unless
//! `setSecure(true)`, is called later in the method's code on a local in the same slot javac gives it, written
//! against that `Cookie` class. FindSecBugs follows slots, not variables: a call through another variable does not
//! count, and one on a variable that later reuses the slot counts for every cookie stored there before. Only the
//! constant `true` (a `final` constant local too) counts, wherever the call is (in a branch too). A cookie returned or passed on without a local,
//! or stored in a field, is not followed. Priority 2, on the line of the `new`, once per line and method. Lambdas,
//! static initializers and the instance initializers a constructor runs are methods like any other.
use super::super::Context;
use super::super::dead::slots::{Layout, layout};
use super::super::idioms::encoding::written_owner;
use super::super::taint::lines::line as invoke_line;
use super::super::place;
use super::super::classes::lines::delegates;
use super::super::idioms::Compiled;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::has_modifier;
use tree_sitter::Node;

pub const HTTP_ONLY: &str = "HTTPONLY_COOKIE";
pub const SECURE: &str = "INSECURE_COOKIE";
pub const COOKIES: &[&str] = &["javax.servlet.http.Cookie", "jakarta.servlet.http.Cookie"];

const FLAGS: &[(&str, &str, &str)] = &[
    (HTTP_ONLY, "setHttpOnly", "Cookie without the HttpOnly flag could be read by a malicious script in the browser"),
    (SECURE, "setSecure", "Cookie without the secure flag could be sent in clear text if an HTTP URL is visited"),
];

fn slot_of(layout: &Layout, node: Node) -> Option<u16> {
    let index = layout.uses.get(&node.id()).or_else(|| layout.decls.get(&node.id()))?;
    Some(layout.vars[*index].slot)
}

/// The slot a cookie made by this `new` is stored into straight away.
fn stored(context: &Context, layout: &Layout, creation: Node) -> Option<u16> {
    let mut creation = creation;
    let mut holder = parent(creation)?;
    while matches!(holder.kind(), "parenthesized_expression" | "cast_expression") {
        creation = holder;
        holder = parent(holder)?;
    }
    match holder.kind() {
        "variable_declarator" if holder.child_by_field_name("value") == Some(creation) => slot_of(layout, holder),
        "assignment_expression" if holder.child_by_field_name("right") == Some(creation) => {
            let plain = holder.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=");
            let target = holder.child_by_field_name("left").filter(|target| target.kind() == "identifier")?;
            if plain { slot_of(layout, target) } else { None }
        }
        _ => None,
    }
}

fn cookie(context: &Context, node: Node) -> Option<String> {
    let made = context.resolver.type_node(node.child_by_field_name("type")?)?.name();
    COOKIES.contains(&made.as_str()).then_some(made)
}

/// The slot and position of each flag call with the constant `true`, for one flag of one `Cookie` class.
fn flagged(context: &Context, own: &str, layout: &Layout, nodes: &[Node], name: &str, class: &str) -> Vec<(u16, usize)> {
    let mut found = Vec::new();
    for node in nodes.iter().copied().filter(|node| node.kind() == "method_invocation") {
        let named = node.child_by_field_name("name").is_some_and(|written| context.text(written) == name);
        let arguments = node.child_by_field_name("arguments").map(named_children).unwrap_or_default();
        let on = matches!(&arguments[..], [value] if super::super::tls::values::constant_true(context, *value));
        let receiver = node.child_by_field_name("object").filter(|object| object.kind() == "identifier");
        if !named || !on || written_owner(context, own, node).as_deref() != Some(class) {
            continue;
        }
        if let Some(slot) = receiver.and_then(|receiver| slot_of(layout, receiver)) {
            found.push((slot, node.start_byte()));
        }
    }
    found
}

/// The bodies javac runs one after the other in a compiled method, and its written parameters.
fn bodies<'a>(class: Node<'a>, method: &Compiled<'a>) -> (Vec<Node<'a>>, Vec<Node<'a>>, bool) {
    let member = method.member;
    let parameters = |holder: Node<'a>| -> Vec<Node<'a>> {
        holder.child_by_field_name("parameters").map(named_children).unwrap_or_default().into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter")).collect()
    };
    let members = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")).map(place::members).unwrap_or_default();
    let blocks = |kind: &str| -> Vec<Node<'a>> {
        members.iter().copied().filter(|part| part.kind() == kind).filter_map(|part| if kind == "block" { Some(part) } else { children(part).into_iter().find(|inner| inner.kind() == "block") }).collect()
    };
    match member.kind() {
        "lambda_expression" => (member.child_by_field_name("body").into_iter().collect(), parameters(member), true),
        "method_declaration" => (member.child_by_field_name("body").into_iter().collect(), parameters(member), has_modifier(member, "static")),
        "constructor_declaration" => {
            let mut found = if delegates(member) { Vec::new() } else { blocks("block") };
            found.extend(member.child_by_field_name("body"));
            (found, parameters(member), false)
        }
        _ if method.label.contains("<static initializer") => (blocks("static_initializer"), Vec::new(), true),
        _ => (blocks("block"), Vec::new(), false),
    }
}

fn method<'a>(context: &Context<'a>, own: &str, class: Node<'a>, method: &Compiled<'a>) {
    let (bodies, listed, fixed) = bodies(class, method);
    if bodies.is_empty() {
        return;
    }
    let layout = layout(context, &bodies, &listed, fixed, 0, false);
    let nodes = &method.nodes;
    let mut seen: Vec<(&str, usize)> = Vec::new();
    for creation in nodes.iter().copied().filter(|node| node.kind() == "object_creation_expression") {
        let Some(class_name) = cookie(context, creation) else { continue };
        let Some(slot) = stored(context, &layout, creation) else { continue };
        for (pattern, name, message) in FLAGS {
            let set = flagged(context, own, &layout, nodes, name, &class_name).into_iter().any(|(at, after)| at == slot && after > creation.start_byte());
            let line = invoke_line(context, creation);
            if set || seen.contains(&(pattern, line)) {
                continue;
            }
            seen.push((pattern, line));
            context.report_listed(pattern, creation, line, message.to_string(), place::function(&method.label), 2, Vec::new());
        }
    }
}

pub fn check<'a>(context: &Context<'a>, own: &str, class: Node<'a>, methods: &[Compiled<'a>]) {
    for compiled in methods {
        method(context, own, class, compiled);
    }
}
