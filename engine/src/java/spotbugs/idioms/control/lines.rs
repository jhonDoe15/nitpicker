//! Where javac puts lines in a method's line table, for the jumps of useless control flow.
use super::parts;
use crate::engine::source::{named_children, parent};
use crate::java::spotbugs::Context;
use crate::java::spotbugs::classes::lines::statement_start;
use crate::java::spotbugs::idioms::Compiled;
use crate::java::types::expr::Binding;
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::enclosing_types;
use tree_sitter::Node;

/// The line table of the method as (place in code order, line): each statement's first instruction, each call
/// at its `(`, loop tests, catch clauses, and the code javac writes after a body: a `for` update, the jump back of
/// an enhanced `for` (at its header over an array, else at the closing brace of its body), the exit of a `synchronized` block or of a `try` (at its last line), the inlined `finally`,
/// the rethrow of a `finally` (at its closing brace) and the `return` at the closing brace of a body.
pub fn table(context: &Context, method: &Compiled) -> Vec<(usize, usize)> {
    let mut lines = Vec::new();
    let end_line = |node: Node| context.line_at(node.end_byte().saturating_sub(1));
    for node in &method.nodes {
        let node = *node;
        let kind = node.kind();
        if kind.ends_with("_statement") && !matches!(kind, "labeled_statement" | "expression_statement") || matches!(kind, "expression_statement" | "local_variable_declaration" | "explicit_constructor_invocation") {
            lines.extend(statement_start(context, node).map(|line| (node.start_byte(), line)));
        }
        let body = node.child_by_field_name("body");
        match kind {
            "method_invocation" | "object_creation_expression" => lines.extend(node.child_by_field_name("arguments").map(|arguments| (arguments.start_byte(), context.line(arguments)))),
            "catch_clause" => lines.push((node.start_byte(), context.line(node))),
            "for_statement" => {
                lines.extend(node.child_by_field_name("condition").map(|condition| (condition.start_byte(), context.line(condition))));
                let mut cursor = node.walk();
                let update = node.children_by_field_name("update", &mut cursor).next();
                lines.extend(update.zip(body).map(|(update, body)| (body.end_byte(), context.line(update))));
            }
            "enhanced_for_statement" => {
                let array = node.child_by_field_name("value").and_then(|value| context.resolver.type_of(value)).is_some_and(|kind| matches!(kind, Type::Array(_)));
                let marked = if array { Some(context.line(node)) } else { body.filter(|body| body.kind() == "block").map(end_line) };
                lines.extend(body.zip(marked).map(|(body, line)| (body.end_byte(), line)));
            }
            "synchronized_statement" => lines.extend(body.map(|body| (body.end_byte(), end_line(body)))),
            "try_statement" | "try_with_resources_statement" => {
                let Some(body) = body else { continue };
                let finally = parts(node).into_iter().find(|part| part.kind() == "finally_clause").and_then(|clause| parts(clause).into_iter().find(|part| part.kind() == "block"));
                let catches: Vec<Node> = parts(node).into_iter().filter(|part| part.kind() == "catch_clause").collect();
                if let Some(finally) = finally {
                    let first = parts(finally).into_iter().find_map(|part| statement_start(context, part));
                    lines.extend(first.map(|line| (body.end_byte(), line)));
                    lines.push((finally.end_byte(), end_line(finally)));
                } else if kind == "try_with_resources_statement" || !catches.is_empty() {
                    lines.push((body.end_byte(), end_line(node)));
                    for caught in catches.iter().rev().skip(1) {
                        lines.extend(caught.child_by_field_name("body").map(|block| (block.end_byte(), end_line(node))));
                    }
                }
            }
            "do_statement" => lines.extend(node.child_by_field_name("condition").map(|condition| (condition.start_byte(), context.line(condition)))),
            "ternary_expression" => lines.extend(node.child_by_field_name("condition").map(|condition| (condition.start_byte(), context.line(condition)))),
            _ => {}
        }
    }
    let body = match method.member.kind() {
        "method_declaration" if method.member.child_by_field_name("type").is_some_and(|kind| kind.kind() == "void_type") => method.member.child_by_field_name("body"),
        "constructor_declaration" | "compact_constructor_declaration" => method.member.child_by_field_name("body"),
        "lambda_expression" => method.member.child_by_field_name("body").filter(|body| body.kind() == "block"),
        _ => None,
    };
    if let Some(body) = body {
        let ends = parts(body).last().is_some_and(|last| matches!(last.kind(), "return_statement" | "throw_statement"));
        if !ends {
            lines.push((body.end_byte(), end_line(body)));
        }
    }
    lines
}

/// Whether javac reads a field through an accessor method: a protected field of a class in another package that
/// the class around the code does not extend, though a class around that one does.
fn accessed(context: &Context, node: Node) -> bool {
    let resolver = context.resolver;
    let name = match node.kind() {
        "identifier" => node,
        "field_access" => match node.child_by_field_name("field") {
            Some(field) => field,
            None => return false,
        },
        _ => return false,
    };
    if node.kind() == "identifier" && parent(node).is_some_and(|holder| matches!(holder.kind(), "field_access" | "method_invocation") && holder.child_by_field_name("object") != Some(node)) {
        return false;
    }
    let found = match resolver.binding(name, context.text(name)) {
        Some(Binding::Field(_, info, field)) if node.kind() == "identifier" => Some((info, field)),
        _ if node.kind() == "field_access" => node.child_by_field_name("object").and_then(|object| match resolver.receiver(object)? {
            crate::java::types::expr::Receiver::Static(owner) => resolver.index.field(&owner, context.text(name)),
            crate::java::types::expr::Receiver::Value(crate::java::types::model::Type::Class(owner, _)) => resolver.index.field(&owner, context.text(name)),
            _ => None,
        }),
        _ => None,
    };
    let Some((info, field)) = found else { return false };
    if field.flags & flag::PROTECTED == 0 || field.constant.is_some() {
        return false;
    }
    let nest = enclosing_types(resolver.scope, node);
    let Some(first) = nest.first() else { return false };
    let package = resolver.index.get(first).map(|own| own.package.clone()).unwrap_or_default();
    let declaring = info.name.clone();
    package != info.package && !resolver.index.is_subtype(first, &declaring) && nest.iter().skip(1).any(|outer| resolver.index.is_subtype(outer, &declaring))
}

/// The line javac marks last in an `if` up to its jump: the `if`, then each call at its `(` in the order the calls
/// end, and each read through an accessor at the field's name.
pub fn jump_line(context: &Context, statement: Node, condition: Node) -> usize {
    let mut last = (statement.start_byte(), context.line(statement));
    let mut stack = vec![condition];
    while let Some(node) = stack.pop() {
        if matches!(node.kind(), "lambda_expression" | "class_body") {
            continue;
        }
        let marked = match node.kind() {
            "method_invocation" | "object_creation_expression" => node.child_by_field_name("arguments").map(|arguments| context.line(arguments)),
            _ if accessed(context, node) => Some(context.line(node.child_by_field_name("field").unwrap_or(node))),
            _ => None,
        };
        if let Some(line) = marked {
            if node.end_byte() >= last.0 {
                last = (node.end_byte(), line);
            }
        }
        stack.extend(named_children(node));
    }
    last.1
}

