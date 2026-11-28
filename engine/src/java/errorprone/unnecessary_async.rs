//! UnnecessaryAsync: a local atomic or concurrent map that never leaves its scope.
use super::Context;
use super::fixes::Fix;
use super::positions::arguments;
use crate::engine::source::{ancestor, children, parent, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "Variables which are initialized and do not escape the current scope do not need to worry about concurrency. Using the non-concurrent type will reduce overhead and verbosity.";
const CREATED: [&str; 5] = [
    "java.util.concurrent.atomic.AtomicBoolean", "java.util.concurrent.atomic.AtomicReference", "java.util.concurrent.atomic.AtomicInteger",
    "java.util.concurrent.atomic.AtomicLong", "java.util.concurrent.ConcurrentHashMap",
];

/// Whether an identifier reads the name rather than naming a member, a parameter or a declaration.
fn is_use(node: Node) -> bool {
    let Some(up) = parent(node) else { return false };
    match up.kind() {
        "method_invocation" => up.child_by_field_name("name") != Some(node),
        "field_access" => up.child_by_field_name("field") != Some(node),
        "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "spread_parameter" | "labeled_statement" | "break_statement" | "continue_statement" => up.child_by_field_name("name") != Some(node) && !matches!(up.kind(), "labeled_statement" | "break_statement" | "continue_statement"),
        "method_reference" => true,
        "lambda_expression" => up.child_by_field_name("parameters") != Some(node),
        _ => true,
    }
}

fn effectively_final(context: &Context, scope: Node, declaration: Node, name: &str) -> bool {
    if has_modifier(declaration, "final") {
        return true;
    }
    let mut reassigned = false;
    walk(scope, |part| {
        let target = match part.kind() {
            "assignment_expression" => part.child_by_field_name("left"),
            "update_expression" => part.named_child(0),
            _ => None,
        };
        if target.is_some_and(|target| target.kind() == "identifier" && context.text(target) == name) {
            reassigned = true;
        }
    });
    !reassigned
}

fn escapes(context: &Context, scope: Node, name: &str) -> bool {
    let mut found = false;
    walk(scope, |node| {
        if found || node.kind() != "identifier" || context.text(node) != name || !is_use(node) {
            return;
        }
        let mut current = parent(node);
        while let Some(at) = current {
            if at == scope {
                break;
            }
            if matches!(at.kind(), "lambda_expression" | "method_declaration") {
                found = true;
                return;
            }
            current = parent(at);
        }
        let selected = parent(node).is_some_and(|up| (up.kind() == "field_access" && up.child_by_field_name("object") == Some(node)) || (up.kind() == "method_invocation" && up.child_by_field_name("object") == Some(node)));
        found |= !selected;
    });
    found
}

fn primitive_name(context: &Context, kind: &Type) -> Option<String> {
    let Type::Class(name, arguments) = kind else { return None };
    Some(match name.as_str() {
        "java.util.concurrent.atomic.AtomicBoolean" => "boolean".to_string(),
        "java.util.concurrent.atomic.AtomicInteger" => "int".to_string(),
        "java.util.concurrent.atomic.AtomicLong" => "long".to_string(),
        "java.util.concurrent.atomic.AtomicReference" => match arguments.first() {
            None => "Object".to_string(),
            Some(first) => super::hierarchy::simple_name(&first.name()).to_string(),
        },
        _ => {
            let _ = context;
            return None;
        }
    })
}

fn fix_for(context: &Context, scope: Node, declaration: Node, declarator: Node, name: &str, kind: &Type, creation: Node) -> Fix {
    let Some(primitive) = primitive_name(context, kind) else { return Fix::new() };
    let initial = match arguments(creation).first() {
        Some(first) => context.text(*first).to_string(),
        None => match kind.name().as_str() {
            "java.util.concurrent.atomic.AtomicBoolean" => "false",
            "java.util.concurrent.atomic.AtomicReference" => "null",
            _ => "0",
        }
        .to_string(),
    };
    let _ = declarator;
    let mut fix = Fix::replace(declaration.start_byte(), declaration.end_byte(), format!("{primitive} {name} = {initial};"));
    let mut fixable = true;
    walk(scope, |node| {
        if !fixable || node.kind() != "identifier" || context.text(node) != name || !is_use(node) {
            return;
        }
        let Some(select) = parent(node).filter(|up| up.kind() == "method_invocation" && up.child_by_field_name("object") == Some(node)) else {
            fixable = false;
            return;
        };
        let list = arguments(select);
        let method = select.child_by_field_name("name").map(|part| context.text(part)).unwrap_or_default();
        let (receiver_end, end) = (node.end_byte(), select.end_byte());
        let current = std::mem::take(&mut fix);
        fix = match (method, list.as_slice()) {
            ("set", [argument, ..]) => current.and(receiver_end, argument.start_byte(), " = ").and(argument.end_byte(), end, ""),
            ("get", _) => current.and(receiver_end, end, ""),
            ("getAndIncrement", _) => current.and(receiver_end, end, "++"),
            ("getAndDecrement", _) => current.and(receiver_end, end, "--"),
            ("incrementAndGet", _) => current.insert(node.start_byte(), "++").and(receiver_end, end, ""),
            ("decrementAndGet", _) => current.insert(node.start_byte(), "--").and(receiver_end, end, ""),
            ("compareAndSet", [_, argument, ..]) => current.and(receiver_end, argument.start_byte(), " = ").and(argument.end_byte(), end, ""),
            ("addAndGet", [argument]) => current.and(receiver_end, argument.start_byte(), " += ").and(argument.end_byte(), end, ""),
            _ => {
                fixable = false;
                current
            }
        };
    });
    if fixable { fix } else { Fix::new() }
}

pub fn unnecessary_async(context: &Context, declaration: Node) {
    if declaration.kind() != "local_variable_declaration" {
        return;
    }
    for declarator in declarators(declaration) {
        let (Some(name), Some(value)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value")) else { continue };
        if value.kind() != "object_creation_expression" || children(value).iter().any(|part| part.kind() == "class_body") {
            continue;
        }
        let written = value.child_by_field_name("type").map(|written| context.text(written)).unwrap_or_default();
        if !["Atomic", "ConcurrentHashMap"].iter().any(|word| written.contains(word)) {
            continue;
        }
        let created = value.child_by_field_name("type").and_then(|written| context.resolver.type_node(written));
        if !created.as_ref().is_some_and(|kind| CREATED.contains(&kind.erased().name().as_str())) {
            continue;
        }
        let Some(scope) = ancestor(declaration, &["block", "constructor_body", "switch_block_statement_group", "switch_block"]) else { continue };
        let text = context.text(name);
        if !effectively_final(context, scope, declaration, text) || escapes(context, scope, text) {
            continue;
        }
        let kind = context.resolver.declared_type(declaration, Some(declarator));
        let fixes = match &kind {
            Some(kind) if kind.name().starts_with("java.util.concurrent.atomic") && declarators(declaration).len() == 1 => vec![fix_for(context, scope, declaration, declarator, text, kind, value)],
            _ => Vec::new(),
        };
        context.report_fixed("UnnecessaryAsync", declarator, name.start_byte(), MESSAGE, &fixes);
    }
}
