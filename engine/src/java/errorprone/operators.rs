//! Checks on operators.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::parent;
use crate::java::types::model::{OBJECT, Type, flag};
use tree_sitter::Node;

pub fn operator<'t>(binary: Node<'t>) -> Option<Node<'t>> {
    binary.child_by_field_name("operator")
}

fn precedence(operator: &str) -> u8 {
    match operator {
        "||" => 1,
        "&&" => 2,
        "|" => 3,
        "^" => 4,
        "&" => 5,
        "==" | "!=" => 6,
        "<" | ">" | "<=" | ">=" => 7,
        "<<" | ">>" | ">>>" => 8,
        "+" | "-" => 9,
        _ => 10,
    }
}

fn conditional(operator: &str) -> bool {
    matches!(operator, "&" | "|" | "^" | "&&" | "||")
}

fn shift(operator: &str) -> bool {
    matches!(operator, "<<" | ">>" | ">>>")
}

fn arithmetic(operator: &str) -> bool {
    matches!(operator, "+" | "*" | "/" | "-")
}

const PRECEDENCE: &str = "Use grouping parenthesis to make the operator precedence explicit";

pub fn operator_precedence(context: &Context, node: Node) {
    match node.kind() {
        "binary_expression" => {
            let Some(above) = parent(node).filter(|above| above.kind() == "binary_expression") else { return };
            let (Some(own), Some(outer)) = (operator(node), operator(above)) else { return };
            let (this, that) = (context.text(own), context.text(outer));
            let confusing = (conditional(this) && conditional(that))
                || (shift(this) && arithmetic(that))
                || (shift(that) && arithmetic(this));
            if precedence(this) != precedence(that) && confusing {
                context.report_fixed("OperatorPrecedence", node, own.start_byte(), PRECEDENCE, &[precedence_fix(context, node, this)]);
            }
        }
        "ternary_expression" => {
            let Some(condition) = node.child_by_field_name("condition").filter(|c| c.kind() == "binary_expression") else { return };
            let Some(own) = operator(condition) else { return };
            if !conditional(context.text(own)) {
                return;
            }
            let boolean = match context.resolver.type_of(node) {
                Some(Type::Primitive(name)) => name == "boolean",
                Some(Type::Class(name, _)) => name == "java.lang.Boolean",
                _ => false,
            };
            if boolean {
                let fix = Fix::new().insert(condition.start_byte(), "(").insert(condition.end_byte(), ")");
                context.report_fixed("OperatorPrecedence", condition, own.start_byte(), PRECEDENCE, &[fix]);
            }
        }
        _ => {}
    }
}

/// `(a && b) && c` becomes `(a && b && c)`, anything else gets parentheses around it.
fn precedence_fix(context: &Context, node: Node, kind: &str) -> Fix {
    let (start, end) = (node.start_byte(), node.end_byte());
    let basic = Fix::new().insert(start, "(").insert(end, ")");
    let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return basic };
    let parenthesized = |side: Node| side.kind() == "parenthesized_expression";
    if !matches!(kind, "&&" | "||" | "+") || parenthesized(left) == parenthesized(right) {
        return basic;
    }
    let inner = stripped(if parenthesized(left) { left } else { right });
    if inner.kind() != "binary_expression" || operator(inner).is_none_or(|own| context.text(own) != kind) {
        return basic;
    }
    if parenthesized(right) {
        Fix::new().insert(start, "(").delete(right.start_byte(), right.start_byte() + 1).insert(end, "")
    } else {
        Fix::new().insert(start, "").delete(left.end_byte() - 1, left.end_byte()).insert(end, ")")
    }
}

fn stripped(mut node: Node) -> Node {
    while node.kind() == "parenthesized_expression" {
        let Some(inner) = node.named_child(0) else { break };
        node = inner;
    }
    node
}

fn declares_equals(context: &Context, class: &str) -> bool {
    let index = context.resolver.index;
    std::iter::once(class.to_string()).chain(super::hierarchy::closure(index, class)).filter(|name| name != OBJECT).any(|name| {
        index.get(&name).is_some_and(|info| {
            info.methods.iter().any(|method| {
                method.name == "equals" && !method.is_static && method.parameters.len() == 1 && method.parameters[0].name() == OBJECT
            })
        })
    })
}

fn reference_equality_is_value_equality(context: &Context, class: &str, depth: usize) -> bool {
    let index = context.resolver.index;
    if depth > 1000 {
        return false;
    }
    if class.contains('&') {
        return false;
    }
    if index.is_subtype(class, "java.lang.Enum") {
        return true;
    }
    if declares_equals(context, class) {
        return false;
    }
    let Some(info) = index.get(class) else { return false };
    if info.flags & flag::FINAL != 0 {
        return true;
    }
    info.permitted.as_ref().is_some_and(|permitted| permitted.iter().all(|sub| reference_equality_is_value_equality(context, sub, depth + 1)))
}

fn overrides_named(context: &Context, class: &str, method: Node, base: &str, name: &str) -> bool {
    let Some((origin, own)) = super::hierarchy::declared_method(context, method) else { return false };
    if own.name != name || origin.name != class || !context.resolver.index.is_subtype(class, base) {
        return false;
    }
    let index = context.resolver.index;
    index.get(base).is_some_and(|declaring| {
        declaring.methods.iter().any(|other| other.name == name && super::hierarchy::sub_signature(index, origin, own, declaring, other))
    })
}

fn in_comparison_method(context: &Context, at: Node, class: &str, kind: &Type) -> bool {
    if let Some(lambda) = crate::engine::source::ancestor(at, &["lambda_expression"]) {
        return matches!(context.resolver.type_of(lambda), Some(Type::Class(name, _)) if name == "java.util.Comparator");
    }
    let Some(method) = crate::engine::source::ancestor(at, &["method_declaration", "class_body", "interface_body", "enum_body"])
        .filter(|found| found.kind() == "method_declaration")
    else {
        return false;
    };
    if crate::java::helpers::has_modifier(method, "static") {
        return false;
    }
    if overrides_named(context, class, method, "java.util.Comparator", "compare") {
        return true;
    }
    (overrides_named(context, class, method, "java.lang.Comparable", "compareTo") || overrides_named(context, class, method, OBJECT, "equals"))
        && kind.erased().name() == class
}

pub fn reference_equality(context: &Context, node: Node) {
    if node.kind() != "binary_expression" {
        return;
    }
    let Some(own) = operator(node).filter(|own| matches!(context.text(*own), "==" | "!=")) else { return };
    let Some(class) = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, node) else { return };
    for side in ["left", "right"] {
        let Some(operand) = node.child_by_field_name(side) else { return };
        if operand.kind() == "null_literal" {
            return;
        }
        let Some(kind) = context.resolver.type_of(operand) else { return };
        if matches!(kind, Type::Primitive(_) | Type::Null) {
            return;
        }
        if in_comparison_method(context, node, &class, &kind) {
            return;
        }
        if let Type::Class(name, _) = &kind {
            if reference_equality_is_value_equality(context, name, 0) {
                return;
            }
        }
    }
    let fixes = super::equality_fix::fixes(context, node, context.text(own));
    context.report_fixed("ReferenceEquality", node, own.start_byte(), "Comparison using reference equality instead of value equality", &fixes);
}
