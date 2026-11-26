//! UnsynchronizedOverridesSynchronized: a method that drops the `synchronized` of the method it overrides.
use super::fixes::Fix;
use super::hierarchy::{declared_method, super_methods};
use super::shape::parts;
use super::Context;
use crate::engine::source::{ancestor, children, walk};
use crate::java::helpers::modifiers;
use crate::java::types::expr::Binding;
use crate::java::types::model::Type;
use tree_sitter::Node;

const SYNCHRONIZED: u16 = 0x20;

/// The modifiers in the order of `javax.lang.model.element.Modifier`.
const ORDER: [&str; 12] = ["public", "protected", "private", "abstract", "default", "static", "sealed", "non-sealed", "final", "transient", "volatile", "synchronized"];
const AFTER: [&str; 2] = ["native", "strictfp"];

fn rank(word: &str) -> Option<usize> {
    ORDER.iter().position(|known| *known == word).or_else(|| AFTER.iter().position(|known| *known == word).map(|at| at + ORDER.len()))
}

fn add_synchronized(method: Node) -> Fix {
    let own = modifiers(method);
    let words: Vec<(usize, Node)> = own
        .map(children)
        .unwrap_or_default()
        .into_iter()
        .filter(|part| !part.is_named())
        .filter_map(|part| rank(part.kind()).map(|at| (at, part)))
        .collect();
    let text = "synchronized ";
    if words.is_empty() {
        let at = own.map_or(method.start_byte(), |own| own.end_byte() + 1);
        return Fix::new().insert(at, text);
    }
    let later = words.iter().filter(|(at, _)| *at > ORDER.len() - 1).min_by_key(|(at, _)| *at);
    match later {
        Some((_, word)) => Fix::new().insert(word.start_byte(), text),
        None => Fix::new().insert(words.iter().map(|(_, word)| word.end_byte() + 1).max().unwrap_or(method.start_byte()), text),
    }
}

fn assigned_in(scope: Node, context: &Context, name: &str) -> bool {
    let mut found = false;
    walk(scope, |node| {
        let target = match node.kind() {
            "assignment_expression" => node.child_by_field_name("left"),
            "update_expression" => parts(node).into_iter().next(),
            _ => None,
        };
        found |= target.is_some_and(|target| target.kind() == "identifier" && context.text(target) == name);
    });
    found
}

fn final_name(context: &Context, node: Node) -> bool {
    let name = context.text(node);
    match context.resolver.binding(node, name) {
        Some(Binding::Field(_, _, field)) => field.flags & crate::java::types::model::flag::FINAL != 0,
        Some(Binding::Local(_)) => ancestor(node, &["method_declaration", "constructor_declaration", "lambda_expression"]).is_some_and(|scope| !assigned_in(scope, context, name)),
        None => false,
    }
}

/// ConstantExpressions.constantExpression for the shapes that matter here.
fn constant_expression(context: &Context, node: Node) -> bool {
    match node.kind() {
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" | "decimal_floating_point_literal"
        | "hex_floating_point_literal" | "character_literal" | "string_literal" | "true" | "false" | "null_literal" => true,
        "binary_expression" => {
            let equality = node.child_by_field_name("operator").is_some_and(|operator| matches!(context.text(operator), "==" | "!="));
            equality && [node.child_by_field_name("left"), node.child_by_field_name("right")].iter().all(|side| side.is_some_and(|side| constant_expression(context, side)))
        }
        "this" => true,
        "identifier" => final_name(context, node),
        "class_literal" => true,
        "field_access" => {
            let (Some(object), Some(field)) = (node.child_by_field_name("object"), node.child_by_field_name("field")) else { return false };
            let name = context.text(field);
            match context.resolver.receiver(object) {
                Some(crate::java::types::expr::Receiver::Static(owner)) => context.resolver.index.field(&owner, name).is_some_and(|(_, found)| found.flags & crate::java::types::model::flag::FINAL != 0),
                Some(crate::java::types::expr::Receiver::Value(Type::Class(owner, _))) => {
                    context.resolver.index.field(&owner, name).is_some_and(|(_, found)| found.flags & crate::java::types::model::flag::FINAL != 0) && constant_expression(context, object)
                }
                _ => false,
            }
        }
        _ => false,
    }
}

fn calls_super(context: &Context, method: Node, call: Node) -> bool {
    let Some(object) = call.child_by_field_name("object") else { return false };
    if object.kind() != "super" {
        return false;
    }
    let (Some(own), Some(invoked)) = (declared_method(context, method), context.resolver.resolve_call(call)) else { return false };
    let flags = |method: &crate::java::types::model::Method| method.is_static;
    !flags(own.1) && !flags(&invoked.method) && own.1.name == invoked.method.name && own.1.parameters == invoked.method.parameters
}

/// What the scanner of Error Prone gives for a tree: true for the shapes it ignores.
fn ignored(context: &Context, method: Node, node: Node) -> bool {
    match node.kind() {
        "block" => {
            let statements = parts(node);
            match statements.len() {
                0 => true,
                1 => ignored(context, method, statements[0]),
                _ => false,
            }
        }
        "return_statement" => match parts(node).into_iter().next() {
            None => true,
            Some(value) => constant_expression(context, value) || ignored(context, method, value),
        },
        "expression_statement" => parts(node).into_iter().next().is_some_and(|inner| ignored(context, method, inner)),
        "cast_expression" => node.child_by_field_name("value").is_some_and(|inner| ignored(context, method, inner)),
        "parenthesized_expression" => parts(node).into_iter().next().is_some_and(|inner| ignored(context, method, inner)),
        "method_invocation" => calls_super(context, method, node),
        "binary_expression" => node.child_by_field_name("right").is_some_and(|inner| ignored(context, method, inner)),
        "ternary_expression" => node.child_by_field_name("alternative").is_some_and(|inner| ignored(context, method, inner)),
        "synchronized_statement" => node.child_by_field_name("body").is_some_and(|inner| ignored(context, method, inner)),
        _ => false,
    }
}

pub fn unsynchronized_overrides_synchronized(context: &Context, node: Node) {
    if node.kind() != "method_declaration" || crate::java::helpers::has_modifier(node, "synchronized") {
        return;
    }
    let Some((origin, method)) = declared_method(context, node) else { return };
    let index = context.resolver.index;
    for (owner, other) in super_methods(index, origin, method) {
        if other.detail.access & SYNCHRONIZED == 0 || owner.name == "java.io.InputStream" {
            continue;
        }
        if node.child_by_field_name("body").is_some_and(|body| ignored(context, node, body)) {
            return;
        }
        let name = context.text(node.child_by_field_name("name").unwrap_or(node));
        let simple = owner.name.rsplit('.').next().unwrap_or(&owner.name);
        let message = format!("Unsynchronized method {name} overrides synchronized method in {simple}");
        let at = node.child_by_field_name("name").map_or(node.start_byte(), |found| found.start_byte());
        context.report_fixed("UnsynchronizedOverridesSynchronized", node, at, &message, &[add_synchronized(node)]);
        return;
    }
}
