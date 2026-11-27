//! The FindSecBugs detectors that report HARD_CODE_PASSWORD at priority 2 on the calling method, from lab runs:
//! - IntuitiveHardcodePasswordDetector: a method with one `String` parameter whose name is `password` or `pwd`, or
//!   starts with `set` and holds one of them, in any case, handed a constant;
//! - HardcodePasswordInMapDetector: `put(Object, Object)` or `putIfAbsent(Object, Object)` returning `Object`, or
//!   `setProperty(String, String)` returning `Object`, on any class, with a constant key that holds `password` or
//!   `pwd` in any case and a constant value, or `toCharArray()` of one;
//! - JschPasswordDetector: the passphrase of `com.jcraft.jsch.JSch.addIdentity(String, String)`.
//!
//! What counts as a constant follows the taint layer of these detectors: literals and constant fields, a local or a
//! `c ? a : b` that gives the same constant on every path, a static field of the class that its initializer sets to
//! a constant, the JDK methods whose result the taint table derives from one constant argument or the receiver
//! (`trim()`, `toUpperCase()`, `System.getenv(String)`...), `new String(constant)`, and methods of the file that
//! return a constant or the argument they are handed.
use super::PASSWORD;
use crate::engine::source::{ancestor, named_children, walk};
use crate::java::spotbugs::idioms::compiled;
use crate::java::spotbugs::taint::jdk;
use crate::java::spotbugs::taint::{Level, THIS};
use crate::java::spotbugs::{Context, observed, place, returns};
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

const DEPTH: usize = 4;

fn arguments(node: Node) -> Vec<Node> {
    node.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn setter(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    matches!(lower.as_str(), "password" | "pwd") || (lower.starts_with("set") && (lower.contains("password") || lower.contains("pwd")))
}

pub fn named<'a>(context: &Context<'a>, own: &str, class: Node<'a>) {
    for method in compiled(context, own, class) {
        for node in method.nodes.iter().filter(|node| node.kind() == "method_invocation") {
            if reported(context, *node) {
                let line = node.child_by_field_name("name").map_or_else(|| context.line(*node), |name| context.line(name));
                context.report_listed(PASSWORD, *node, line, "Hard coded password found".to_string(), place::function(&method.label), 2, Vec::new());
            }
        }
    }
}

fn reported(context: &Context, node: Node) -> bool {
    let Some(call) = context.resolver.resolve_call(node) else { return false };
    let parameters: Vec<String> = call.method.parameters.iter().map(|kind| kind.erased().name()).collect();
    let returns_object = call.method.returns.erased() == Type::class("java.lang.Object");
    let given = arguments(node);
    let text = |at: usize| given.get(at).and_then(|argument| constant(context, *argument, 0));
    match (call.method.name.as_str(), parameters.iter().map(String::as_str).collect::<Vec<_>>().as_slice()) {
        (name, ["java.lang.String"]) if setter(name) => text(0).is_some(),
        ("put" | "putIfAbsent", ["java.lang.Object", "java.lang.Object"]) | ("setProperty", ["java.lang.String", "java.lang.String"]) if returns_object => {
            let named = text(0).is_some_and(|key| key.to_ascii_lowercase().contains("password") || key.to_ascii_lowercase().contains("pwd"));
            named && given.get(1).is_some_and(|value| chars_or_constant(context, *value))
        }
        ("addIdentity", ["java.lang.String", "java.lang.String"]) => returns::made_on(context, &call) == "com.jcraft.jsch.JSch" && text(1).is_some(),
        _ => false,
    }
}

fn chars_or_constant(context: &Context, value: Node) -> bool {
    let value = unwrap(value);
    let chars = value.kind() == "method_invocation" && value.child_by_field_name("name").is_some_and(|name| context.text(name) == "toCharArray");
    if chars && arguments(value).is_empty() {
        return value.child_by_field_name("object").is_some_and(|object| constant(context, object, 0).is_some());
    }
    constant(context, value, 0).is_some()
}

/// The constant a string expression always gives, as the taint layer sees it.
pub fn constant(context: &Context, node: Node, depth: usize) -> Option<String> {
    let node = unwrap(node);
    if depth > DEPTH {
        return None;
    }
    if let Some(text) = context.resolver.constant_string(node) {
        return Some(text);
    }
    match node.kind() {
        "identifier" => match context.resolver.binding(node, context.text(node))? {
            Binding::Local(_) => {
                let given = observed::local_values(context, node, context.text(node));
                let parameter = ancestor(node, &["method_declaration", "constructor_declaration", "lambda_expression"]).is_some_and(|body| declares_parameter(context, body, context.text(node)));
                same(given.iter().map(|value| constant(context, *value, depth + 1)), !parameter)
            }
            Binding::Field(_, info, field) => static_initial(context, &info.name, &field.name, field.flags, depth),
        },
        "ternary_expression" => same(["consequence", "alternative"].iter().map(|arm| node.child_by_field_name(arm).and_then(|arm| constant(context, arm, depth + 1))), true),
        "method_invocation" => derived(context, node, depth),
        "object_creation_expression" => {
            let given = arguments(node);
            let string = context.resolver.resolve_constructor(node).is_some_and(|call| call.declaring == "java.lang.String");
            if string && given.len() == 1 { constant(context, given[0], depth + 1) } else { None }
        }
        _ => None,
    }
}

fn declares_parameter(context: &Context, body: Node, name: &str) -> bool {
    let mut found = false;
    let listed = body.child_by_field_name("parameters");
    if let Some(listed) = listed {
        walk(listed, |part| found |= part.kind() == "identifier" && context.text(part) == name);
    }
    found
}

fn same(found: impl Iterator<Item = Option<String>>, any: bool) -> Option<String> {
    let found: Vec<Option<String>> = found.collect();
    let first = found.first()?.clone()?;
    (any && found.iter().all(|one| one.as_deref() == Some(first.as_str()))).then_some(first)
}

/// A non-final static field of a class of the file, set to a constant where it is declared and nowhere else.
fn static_initial(context: &Context, class: &str, name: &str, flags: u32, depth: usize) -> Option<String> {
    if flags & flag::STATIC == 0 {
        return None;
    }
    let declared = context.classes.get(class)?;
    let mut values = Vec::new();
    let mut other = false;
    walk(*declared, |node| match node.kind() {
        "variable_declarator" if node.parent().is_some_and(|parent| parent.kind() == "field_declaration") => {
            if node.child_by_field_name("name").is_some_and(|declared| context.text(declared) == name) {
                values.extend(node.child_by_field_name("value"));
            }
        }
        "assignment_expression" => {
            other |= node.child_by_field_name("left").is_some_and(|left| super::fields::field_of(context, left).is_some_and(|(owner, field, _, _)| owner == class && field == name));
        }
        _ => {}
    });
    if other {
        return None;
    }
    same(values.iter().map(|value| constant(context, *value, depth + 1)), true)
}

/// A call whose result the taint table derives from the receiver or one argument only, or a method of the file
/// that returns a constant or the argument it is handed.
fn derived(context: &Context, node: Node, depth: usize) -> Option<String> {
    let call = context.resolver.resolve_call(node)?;
    let given = arguments(node);
    let listed: Vec<String> = call.method.parameters.iter().map(|kind| kind.erased().name()).collect();
    let on = returns::made_on(context, &call);
    if let Some(row) = jdk::row(&context.resolver.index, &on, &call.method.name, &listed.join(",")) {
        if row.result.level != Level::Safe || row.result.params.count_ones() != 1 {
            return None;
        }
        if row.result.params == THIS {
            return constant(context, node.child_by_field_name("object")?, depth + 1);
        }
        let at = row.result.params.trailing_zeros() as usize;
        if listed.get(at).is_none_or(|kind| kind.ends_with("[]")) {
            return None;
        }
        return constant(context, *given.get(at)?, depth + 1);
    }
    let declared = context.classes.get(&call.declaring)?;
    let mut returned = Vec::new();
    walk(*declared, |part| {
        let named = part.kind() == "method_declaration" && part.child_by_field_name("name").is_some_and(|name| context.text(name) == call.method.name);
        if named && parameter_names(context, part).len() == given.len() {
            returned.push(part);
        }
    });
    let [method] = returned[..] else { return None };
    let names = parameter_names(context, method);
    let mut results = Vec::new();
    walk(method.child_by_field_name("body")?, |part| {
        if part.kind() == "return_statement" {
            results.push(named_children(part).into_iter().find(|value| !value.kind().ends_with("comment")));
        }
    });
    let each = results.into_iter().map(|value| {
        let value = unwrap(value?);
        match names.iter().position(|name| value.kind() == "identifier" && context.text(value) == name) {
            Some(at) => constant(context, *given.get(at)?, depth + 1),
            None => constant(context, value, depth + 1),
        }
    });
    same(each, true)
}

fn parameter_names<'t>(context: &Context, method: Node<'t>) -> Vec<String> {
    let listed = method.child_by_field_name("parameters").map(named_children).unwrap_or_default();
    listed.into_iter().filter(|part| part.kind().ends_with("parameter")).filter_map(|part| part.child_by_field_name("name").map(|name| context.text(name).to_string())).collect()
}
