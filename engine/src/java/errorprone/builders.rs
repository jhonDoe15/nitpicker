//! UnnecessaryStringBuilder: a StringBuilder that only concatenates.
use super::fixes::Fix;
use super::shape::{arguments, preferred};
use super::Context;
use crate::engine::source::{ancestor, children, parent, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "Prefer string concatenation over explicitly using `StringBuilder#append`, since `+` reads better and has equivalent or better performance.";

fn exact_builder(context: &Context, node: Node) -> bool {
    matches!(context.resolver.type_of(node), Some(Type::Class(name, _)) if name == "java.lang.StringBuilder")
}

fn folded(node: Node) -> bool {
    match node.kind() {
        "string_literal" => true,
        "binary_expression" => {
            node.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "+")
                && node.child_by_field_name("left").is_some_and(folded)
                && node.child_by_field_name("right").is_some_and(folded)
        }
        _ => false,
    }
}

fn requires_parentheses(node: Node) -> bool {
    match node.kind() {
        "identifier" | "field_access" | "method_invocation" | "array_access" | "parenthesized_expression" | "object_creation_expression" | "method_reference" | "this" => false,
        "lambda_expression" => parent(node).is_some_and(|holder| holder.kind() == "lambda_expression"),
        "string_literal" => false,
        "binary_expression" if folded(node) => true,
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" | "decimal_floating_point_literal" | "hex_floating_point_literal"
        | "character_literal" | "true" | "false" | "null_literal" => false,
        "unary_expression" | "update_expression" => {
            let holder = parent(node);
            let sign = node.child_by_field_name("operator").is_some_and(|operator| matches!(operator.kind(), "+" | "-"));
            if holder.is_some_and(|holder| holder.kind() == "cast_expression" && holder.child_by_field_name("type").is_some_and(|kind| !matches!(kind.kind(), "integral_type" | "floating_point_type" | "boolean_type"))) && sign {
                return true;
            }
            holder.is_some_and(|holder| matches!(holder.kind(), "field_access" | "method_invocation") && holder.child_by_field_name("object") == Some(node))
        }
        _ => true,
    }
}

fn replacement(context: &Context, list: &[Node]) -> String {
    if list.is_empty() {
        return "\"\"".to_string();
    }
    let shown: Vec<String> = list.iter().map(|part| if requires_parentheses(*part) { format!("({})", context.text(*part)) } else { context.text(*part).to_string() }).collect();
    shown.join(" + ")
}

fn appendable(context: &Context, kind: &Type) -> bool {
    matches!(kind, Type::Class(name, _) if context.resolver.index.is_subtype(name, "java.lang.Appendable"))
}

/// The type the place of the builder asks for; `None` where Error Prone has no target.
fn target<'t>(context: &Context, current: Node<'t>) -> Option<(Type, Option<Node<'t>>)> {
    let mut inner = current;
    let mut holder = parent(current)?;
    while holder.kind() == "parenthesized_expression" {
        inner = holder;
        holder = parent(holder)?;
    }
    if holder.kind() == "variable_declarator" && holder.child_by_field_name("value") == Some(inner) {
        let declaration = parent(holder)?;
        let written = declaration.child_by_field_name("type")?;
        if context.text(written) == "var" {
            return Some((Type::class("java.lang.StringBuilder"), Some(holder)));
        }
        return Some((context.resolver.type_node(written)?, Some(holder)));
    }
    if holder.kind() == "expression_statement" {
        return None;
    }
    if holder.kind() == "method_invocation" && holder.child_by_field_name("object") == Some(inner) {
        let method = holder.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
        let plain = matches!(method, "toString" | "hashCode" | "equals" | "getClass" | "length" | "charAt" | "isEmpty" | "subSequence" | "chars" | "codePoints");
        return Some((Type::class(if plain { "java.lang.Object" } else { "java.lang.StringBuilder" }), None));
    }
    if holder.kind() == "argument_list" {
        let call = parent(holder)?;
        let position = arguments(call).iter().position(|argument| *argument == inner)?;
        let (_, formals) = context.resolver.call_formals(call)?;
        return formals.get(position).cloned().map(|kind| (kind, None));
    }
    context.resolver.expected(inner).map(|kind| (kind, None))
}

fn rewritable(context: &Context, declarator: Node) -> bool {
    let Some(declaration) = parent(declarator).filter(|declaration| declaration.kind() == "local_variable_declaration") else { return false };
    if children(declaration).iter().filter(|part| part.kind() == "variable_declarator").count() != 1 {
        return false;
    }
    let Some(name) = declarator.child_by_field_name("name") else { return false };
    let text = context.text(name);
    let Some(scope) = ancestor(declarator, &["method_declaration", "constructor_declaration", "lambda_expression", "static_initializer", "class_body"]) else { return false };
    let mut ok = true;
    walk(scope, |node| {
        if !ok || node.kind() != "identifier" || context.text(node) != text || node.id() == name.id() || !super::values::value_name(node) {
            return;
        }
        if !context.resolver.is_variable(node, text) {
            return;
        }
        let holder = parent(node);
        let receiver = holder.is_some_and(|holder| holder.kind() == "method_invocation" && holder.child_by_field_name("object") == Some(node));
        if receiver {
            let method = holder.and_then(|holder| holder.child_by_field_name("name")).map(|name| context.text(name)).unwrap_or_default();
            if !matches!(method, "toString" | "hashCode" | "equals" | "getClass" | "length" | "charAt" | "isEmpty" | "subSequence" | "chars" | "codePoints") {
                ok = false;
            }
            return;
        }
        match target(context, node) {
            Some((kind, _)) if !appendable(context, &kind) => {}
            _ => ok = false,
        }
    });
    ok
}

pub fn unnecessary_string_builder(context: &Context, node: Node) {
    if node.kind() != "object_creation_expression" || children(node).iter().any(|part| part.kind() == "class_body") {
        return;
    }
    if node.child_by_field_name("type").is_none_or(|kind| !context.text(kind).ends_with("StringBuilder")) || !exact_builder(context, node) {
        return;
    }
    let args = arguments(node);
    let mut list: Vec<Node> = Vec::new();
    match args.len() {
        0 => {}
        1 => {
            if matches!(context.resolver.type_of(args[0]), Some(Type::Class(name, _)) if context.resolver.index.is_subtype(&name, "java.lang.CharSequence")) {
                list.push(args[0]);
            }
        }
        _ => return,
    }
    let mut current = node;
    while let Some(call) = parent(current).filter(|call| call.kind() == "method_invocation" && call.child_by_field_name("object") == Some(current)) {
        let name = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
        if !exact_builder(context, current) {
            return;
        }
        match name {
            "append" => {
                let given = arguments(call);
                if given.len() != 1 {
                    return;
                }
                list.push(given[0]);
                current = call;
            }
            "toString" => {
                let mut text = replacement(context, &list);
                if parent(call).is_some_and(|holder| matches!(holder.kind(), "field_access" | "method_invocation") && holder.child_by_field_name("object") == Some(call)) {
                    text = format!("({text})");
                }
                let fix = Fix::replace(call.start_byte(), call.end_byte(), text);
                context.report_fixed("UnnecessaryStringBuilder", call, preferred(call), MESSAGE, &[fix]);
                return;
            }
            _ => return,
        }
    }
    let Some((kind, variable)) = target(context, current) else { return };
    let text = replacement(context, &list);
    if !appendable(context, &kind) {
        let fix = Fix::replace(current.start_byte(), current.end_byte(), text);
        context.report_fixed("UnnecessaryStringBuilder", current, preferred(current), MESSAGE, &[fix]);
        return;
    }
    let Some(declarator) = variable.filter(|declarator| rewritable(context, *declarator)) else { return };
    let Some(declaration) = parent(declarator) else { return };
    let (Some(written), Some(value)) = (declaration.child_by_field_name("type"), declarator.child_by_field_name("value")) else { return };
    let mut fix = Fix::new();
    if context.text(written) != "var" {
        fix = fix.and(written.start_byte(), written.end_byte(), "String");
    }
    fix = fix.and(value.start_byte(), value.end_byte(), text);
    let at = declarator.child_by_field_name("name").map_or(declarator.start_byte(), |name| name.start_byte());
    context.report_fixed("UnnecessaryStringBuilder", declarator, at, MESSAGE, &[fix]);
}
