//! BAD_HEXA_CONVERSION, measured on test code: a method whose code calls `Integer.toHexString` after a call of
//! `digest` written against `java.security.MessageDigest` itself, in the order of the instructions javac writes
//! (a `for` update after the body, a `finally` block after the `try` block and again after each `catch` block).
//! What is converted does not matter. Once per method, priority 2, on the line of the method's first instruction;
//! a lambda is a method of its own.
use super::super::classes::lines::{constructor_start, initializer_lines, method_start, statement_start};
use super::super::idioms::Compiled;
use super::super::idioms::encoding::written_owner;
use super::super::{Context, place};
use crate::engine::source::children;
use std::collections::HashSet;
use tree_sitter::Node;

pub const BAD_HEXA: &str = "BAD_HEXA_CONVERSION";

fn in_order<'a>(node: Node<'a>, wanted: &HashSet<usize>, out: &mut Vec<Node<'a>>) {
    let field = |name: &str| {
        let mut cursor = node.walk();
        node.children_by_field_name(name, &mut cursor).collect::<Vec<Node>>()
    };
    match node.kind() {
        "class_body" | "lambda_expression" => {}
        "for_statement" => {
            let parts = [field("init"), field("condition"), field("body"), field("update")];
            parts.iter().flatten().for_each(|part| in_order(*part, wanted, out));
        }
        "try_statement" | "try_with_resources_statement" if children(node).iter().any(|part| part.kind() == "finally_clause") => {
            let finally = children(node).into_iter().find(|part| part.kind() == "finally_clause");
            let mut finished = |out: &mut Vec<Node<'a>>| finally.iter().for_each(|clause| in_order(*clause, wanted, out));
            for part in children(node).into_iter().filter(|part| !matches!(part.kind(), "catch_clause" | "finally_clause")) {
                in_order(part, wanted, out);
            }
            finished(out);
            for clause in children(node).into_iter().filter(|part| part.kind() == "catch_clause") {
                in_order(clause, wanted, out);
                finished(out);
            }
            finished(out);
        }
        _ => {
            for part in children(node) {
                in_order(part, wanted, out);
            }
            if wanted.contains(&node.id()) {
                out.push(node);
            }
        }
    }
}

/// The method's code in the order javac writes it.
fn emitted<'a>(method: &Compiled<'a>, class: Node<'a>) -> Vec<Node<'a>> {
    let wanted: HashSet<usize> = method.nodes.iter().map(Node::id).collect();
    let mut out = Vec::new();
    let roots: Vec<Node> = match method.member.kind() {
        "lambda_expression" => method.member.child_by_field_name("body").into_iter().collect(),
        "method_declaration" => vec![method.member],
        _ => {
            let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"));
            let mut roots: Vec<Node> = body.map(super::super::place::members).unwrap_or_default().into_iter().filter(|member| !member.kind().ends_with("_declaration") || matches!(member.kind(), "field_declaration" | "constant_declaration")).collect();
            if method.member.kind().ends_with("constructor_declaration") {
                roots.push(method.member);
            }
            roots
        }
    };
    for root in roots {
        in_order(root, &wanted, &mut out);
    }
    out
}

fn called(context: &Context, own: &str, node: Node, class: &str, name: &str) -> bool {
    node.kind() == "method_invocation"
        && node.child_by_field_name("name").is_some_and(|written| context.text(written) == name)
        && context.resolver.resolve_call(node).is_some_and(|call| call.declaring == class)
        && (name != "digest" || written_owner(context, own, node).as_deref() == Some(class))
}

fn first_line(context: &Context, own: &str, method: &Compiled, class: Node) -> usize {
    let member = method.member;
    let line = match member.kind() {
        "method_declaration" => method_start(context, member),
        "constructor_declaration" | "compact_constructor_declaration" => constructor_start(context, member),
        "lambda_expression" => member.child_by_field_name("body").map(|body| match body.kind() {
            "block" => statement_start(context, body).unwrap_or_else(|| context.line_at(body.end_byte().saturating_sub(1))),
            _ => context.line(body),
        }),
        _ if method.label.contains("<static initializer") => {
            let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"));
            let interface = class.kind() == "interface_declaration";
            let statics = body.map(super::super::place::members).unwrap_or_default().into_iter().filter(|member| {
                matches!(member.kind(), "static_initializer" | "constant_declaration" | "enum_constant") || (member.kind() == "field_declaration" && (interface || crate::java::helpers::has_modifier(*member, "static")))
            });
            statics.flat_map(|member| initializer_lines(context, own, member, interface)).next()
        }
        _ => children(class).into_iter().find(|part| part.kind() == "class").map(|keyword| context.line(keyword)).or_else(|| Some(context.line(class))),
    };
    line.unwrap_or_else(|| context.line(member))
}

pub fn check<'a>(context: &Context<'a>, own: &str, class: Node<'a>, methods: &[Compiled<'a>]) {
    for method in methods {
        if !method.nodes.iter().any(|node| called(context, own, *node, "java.lang.Integer", "toHexString")) {
            continue;
        }
        let mut digested = false;
        let found = emitted(method, class).into_iter().find(|node| {
            digested |= called(context, own, *node, "java.security.MessageDigest", "digest");
            digested && called(context, own, *node, "java.lang.Integer", "toHexString")
        });
        if let Some(at) = found {
            let message = "Leading zeros are omitted in the concatenation increasing collision potential".to_string();
            context.report_listed(BAD_HEXA, at, first_line(context, own, method, class), message, place::function(&method.label), 2, Vec::new());
        }
    }
}
