//! SharedVariableAtomicityDetector, measured: a write of a primitive field the class declares, made outside locked code
//! in a method, is reported when another method reads the field outside locked code (`x++` and `x += v` read it too). A
//! non-static field counts only when written on the object in local slot 0: `this` in a method, the first parameter of
//! a static method. The write is a non-atomic operation when `order.rs` says so (`volatile` fields too), else, for
//! fields that are not `volatile`, a write of a `long` or `double`, else a stale write. One finding per method, field
//! and pattern, at the first such write.
use super::super::{Context, names, place};
use super::{Method, own_field, order};
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::{Type, flag};
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

type Key = (String, String);

struct Write<'a> {
    method: usize,
    node: Node<'a>,
    key: Key,
}

/// Whether the object a field is written on is the value of local slot 0.
fn on_slot_zero(context: &Context, method: Node, target: Node) -> bool {
    let target = unwrap(target);
    if target.kind() == "identifier" {
        return !crate::java::helpers::has_modifier(method, "static");
    }
    let Some(object) = target.child_by_field_name("object").map(unwrap) else { return false };
    match object.kind() {
        "this" => true,
        "identifier" if !crate::java::helpers::has_modifier(method, "static") => copy_of_this(context, method, object),
        "identifier" if crate::java::helpers::has_modifier(method, "static") => {
            let first = method.child_by_field_name("parameters").and_then(|parameters| {
                let mut cursor = parameters.walk();
                let found = parameters.named_children(&mut cursor).find(|part| part.kind().ends_with("parameter"));
                found
            });
            let name = first.and_then(|first| first.child_by_field_name("name"));
            name.is_some_and(|name| context.text(name) == context.text(object)) && matches!(context.resolver.binding(object, context.text(object)), Some(Binding::Local(_)))
        }
        _ => false,
    }
}

/// Whether a local is set once, to `this`.
fn copy_of_this(context: &Context, method: Node, local: Node) -> bool {
    if !matches!(context.resolver.binding(local, context.text(local)), Some(Binding::Local(_))) {
        return false;
    }
    let name = context.text(local);
    let named = |part: Option<Node>| part.is_some_and(|part| part.kind() == "identifier" && context.text(part) == name);
    let (mut copies, mut other) = (0, false);
    crate::engine::source::walk(method, |node| match node.kind() {
        "variable_declarator" if named(node.child_by_field_name("name")) => {
            copies += 1;
            other |= !node.child_by_field_name("value").is_some_and(|value| unwrap(value).kind() == "this");
        }
        "assignment_expression" if named(node.child_by_field_name("left")) => other = true,
        "update_expression" if named(node.named_child(0)) => other = true,
        _ => {}
    });
    copies == 1 && !other
}

/// The target of a plain assignment, which is written and not read.
fn plain_target(node: Node) -> bool {
    let Some(holder) = crate::engine::source::parent(node) else { return false };
    holder.kind() == "assignment_expression"
        && holder.child_by_field_name("left").is_some_and(|left| left.id() == node.id())
        && holder.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "=")
}

/// Whether a name is only the field part of `object.name`, or not a value at all.
fn not_a_value(node: Node) -> bool {
    let Some(holder) = crate::engine::source::parent(node) else { return true };
    match holder.kind() {
        "field_access" => holder.child_by_field_name("field").is_some_and(|field| field.id() == node.id()),
        "method_invocation" => holder.child_by_field_name("name").is_some_and(|name| name.id() == node.id()),
        "variable_declarator" => holder.child_by_field_name("name").is_some_and(|name| name.id() == node.id()),
        "formal_parameter" | "catch_formal_parameter" | "labeled_statement" | "break_statement" | "continue_statement" => true,
        _ => false,
    }
}

fn shared(context: &Context, key: &Key) -> Option<&'static str> {
    let (_, field) = context.resolver.index.field(&key.0, &key.1)?;
    if field.flags & flag::FINAL != 0 {
        return None;
    }
    match field.kind {
        Type::Primitive(name) => Some(name),
        _ => None,
    }
}

pub fn report<'a>(context: &Context<'a>, own: &str, methods: &[Method<'a>], locked: &dyn Fn(&Method, Node) -> bool) {
    let mut readers: HashMap<Key, HashSet<usize>> = HashMap::new();
    let mut writes = Vec::new();
    for (at, method) in methods.iter().enumerate() {
        for node in &method.nodes {
            let written = match node.kind() {
                "assignment_expression" => node.child_by_field_name("left"),
                "update_expression" => node.named_child(0),
                _ => None,
            };
            if let Some(target) = written {
                let Some(key) = own_field(context, own, target) else { continue };
                if shared(context, &key).is_none() || locked(method, *node) {
                    continue;
                }
                if on_slot_zero(context, method.declaration, target) || is_static(context, &key) {
                    writes.push(Write { method: at, node: *node, key });
                }
                continue;
            }
            if !matches!(node.kind(), "identifier" | "field_access") || not_a_value(*node) || plain_target(*node) {
                continue;
            }
            if node.kind() == "identifier" && !matches!(context.resolver.binding(*node, context.text(*node)), Some(Binding::Field(..))) {
                continue;
            }
            let Some(key) = own_field(context, own, *node) else { continue };
            if !locked(method, *node) {
                readers.entry(key).or_default().insert(at);
            }
        }
    }
    writes.sort_by_key(|write| (write.method, write.node.end_byte()));
    let mut operations: HashMap<usize, HashSet<usize>> = HashMap::new();
    let mut seen = HashSet::new();
    let simple = names::binary(context, own).rsplit(['.', '$']).next().unwrap_or(own).to_string();
    for write in writes {
        let read_elsewhere = readers.get(&write.key).is_some_and(|readers| readers.iter().any(|reader| *reader != write.method));
        if !read_elsewhere {
            continue;
        }
        let method = &methods[write.method];
        let found = operations.entry(write.method).or_insert_with(|| method.declaration.child_by_field_name("body").map(|body| order::operations(context, body)).unwrap_or_default());
        let kind = shared(context, &write.key).unwrap_or("int");
        let (pattern, message, arguments) = if found.contains(&write.node.id()) {
            let message = format!("Operation on the \"{}\" shared variable in \"{simple}\" class is not atomic", write.key.1);
            ("AT_NONATOMIC_OPERATIONS_ON_SHARED_VARIABLE", message, vec![write.key.1.clone(), simple.clone()])
        } else if context.volatiles.contains(&write.key) {
            continue;
        } else if matches!(kind, "long" | "double") {
            ("AT_NONATOMIC_64BIT_PRIMITIVE", format!("This write of the 64-bit primitive variable \"{}\" may not be atomic", write.key.1), vec![write.key.1.clone()])
        } else {
            let message = format!("Shared primitive variable \"{}\" in one thread may not yield the value of the most recent write from another thread", write.key.1);
            ("AT_STALE_THREAD_WRITE_OF_PRIMITIVE", message, vec![write.key.1.clone()])
        };
        if !seen.insert((pattern, write.method, write.key.1.clone())) {
            continue;
        }
        let line = write_line(context, write.node);
        context.report_listed(pattern, write.node, line, message, place::member(context, own, &write.key.1), 2, arguments);
    }
}

fn is_static(context: &Context, key: &Key) -> bool {
    context.resolver.index.field(&key.0, &key.1).is_some_and(|(_, field)| field.flags & flag::STATIC != 0)
}

/// The calls and conditions javac marks a line for, in the order of their code.
fn marks(context: &Context, node: Node, out: &mut Vec<usize>) {
    match node.kind() {
        "lambda_expression" | "class_body" => return,
        "ternary_expression" => {
            if let Some(condition) = node.child_by_field_name("condition") {
                marks(context, condition, out);
                out.push(context.line(condition));
            }
            for part in ["consequence", "alternative"].iter().filter_map(|part| node.child_by_field_name(part)) {
                marks(context, part, out);
            }
            return;
        }
        _ => {}
    }
    for part in crate::engine::source::named_children(node) {
        marks(context, part, out);
    }
    if node.kind() == "method_invocation" {
        out.extend(node.child_by_field_name("arguments").map(|arguments| context.line(arguments)));
    }
}

/// The line javac gives a field write: the last line it marked before it, from the statement's own line on.
fn write_line(context: &Context, node: Node) -> usize {
    let mut statement = node;
    while let Some(holder) = crate::engine::source::parent(statement) {
        if holder.kind() == "for_statement" || holder.kind().ends_with("statement") && holder.kind() != "expression_statement" || holder.kind() == "local_variable_declaration" || holder.kind() == "block" {
            if holder.kind().ends_with("statement") && holder.kind() != "for_statement" || holder.kind() == "local_variable_declaration" {
                statement = holder;
            }
            break;
        }
        statement = holder;
    }
    let mut lines = Vec::new();
    marks(context, node, &mut lines);
    lines.last().copied().unwrap_or_else(|| context.line(statement))
}
