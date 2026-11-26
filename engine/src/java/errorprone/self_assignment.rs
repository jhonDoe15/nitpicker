//! SelfAssignment: a variable assigned to itself.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::{declarators, has_modifier};
use tree_sitter::Node;

const MESSAGE: &str = "Variable assigned to itself";

const NULL_CHECKS: &[&str] = &[
    "java.util.Objects#requireNonNull(_*)",
    "com.google.common.base.Preconditions#checkNotNull(_*)",
    "com.google.common.time.Durations#checkNotNegative(_*)",
    "com.google.common.time.Durations#checkPositive(_*)",
    "com.google.protobuf.util.Durations#checkNotNegative(_*)",
    "com.google.protobuf.util.Durations#checkPositive(_*)",
    "com.google.protobuf.util.Durations#checkValid(_*)",
    "com.google.protobuf.util.Timestamps#checkValid(_*)",
];

fn strip_null_check<'t>(context: &Context, expression: Node<'t>) -> Node<'t> {
    if expression.kind() == "method_invocation" {
        let name = expression.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
        if NULL_CHECKS.iter().any(|signature| signature.contains(&format!("#{name}(")) && context.resolver.matches_sig(expression, signature)) {
            let first = expression.child_by_field_name("arguments").and_then(|list| named_children(list).into_iter().find(|part| !part.kind().ends_with("comment")));
            if let Some(first) = first {
                return first;
            }
        }
    }
    expression
}

fn skip_cast(node: Node) -> Node {
    let mut node = node;
    loop {
        let inner = match node.kind() {
            "parenthesized_expression" => named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")),
            "cast_expression" => node.child_by_field_name("value"),
            _ => None,
        };
        match inner {
            Some(inner) => node = inner,
            None => return node,
        }
    }
}

fn edit_distance(from: &str, to: &str) -> usize {
    super::javadoc::edit_distance(from, to)
}

/// The candidates at the smallest edit distance from `base`, in order.
fn nearest<'t>(base: &str, candidates: Vec<(String, Node<'t>)>) -> Vec<(String, Node<'t>)> {
    let best = candidates.iter().map(|(name, _)| edit_distance(base, name)).min();
    candidates.into_iter().filter(|(name, _)| Some(edit_distance(base, name)) == best).collect()
}

fn simple_name<'f>(context: &'f Context, node: Node) -> &'f str {
    match node.kind() {
        "field_access" => node.child_by_field_name("field").map(|part| context.text(part)).unwrap_or_default(),
        _ => context.text(node),
    }
}

fn parameter_fixes(context: &Context, assignment: Node, rhs: Node) -> Vec<Fix> {
    let Some(method) = crate::engine::source::ancestor(assignment, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"]) else { return Vec::new() };
    let Some(list) = method.child_by_field_name("parameters") else { return Vec::new() };
    let Some(wanted) = context.resolver.type_of(rhs) else { return Vec::new() };
    let mut candidates = Vec::new();
    for parameter in children(list).into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter")) {
        let name = if parameter.kind() == "formal_parameter" {
            parameter.child_by_field_name("name")
        } else {
            children(parameter).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name"))
        };
        let Some(name) = name else { continue };
        let kind = if parameter.kind() == "formal_parameter" { context.resolver.declared_type(parameter, None) } else { None };
        if kind.as_ref() == Some(&wanted) {
            candidates.push((context.text(name).to_string(), name));
        }
    }
    nearest(simple_name(context, rhs), candidates).into_iter().map(|(name, _)| Fix::replace(rhs.start_byte(), rhs.end_byte(), name)).collect()
}

fn field_fixes(context: &Context, assignment: Node, lhs: Node) -> Vec<Fix> {
    let Some(class) = crate::engine::source::ancestor(assignment, &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration", "class_body"]) else { return Vec::new() };
    let body = if class.kind() == "class_body" { Some(class) } else { class.child_by_field_name("body") };
    let Some(body) = body else { return Vec::new() };
    let Some(wanted) = context.resolver.type_of(lhs) else { return Vec::new() };
    let mut candidates = Vec::new();
    for member in children(body).into_iter().filter(|part| part.kind() == "field_declaration") {
        if has_modifier(member, "static") || has_modifier(member, "final") {
            continue;
        }
        for declarator in declarators(member) {
            let Some(name) = declarator.child_by_field_name("name") else { continue };
            if context.resolver.declared_type(member, Some(declarator)).as_ref() == Some(&wanted) {
                candidates.push((context.text(name).to_string(), name));
            }
        }
    }
    nearest(simple_name(context, lhs), candidates).into_iter().map(|(name, _)| Fix::replace(lhs.start_byte(), lhs.end_byte(), format!("this.{name}"))).collect()
}

fn same_target(context: &Context, lhs: Node, rhs: Node) -> bool {
    super::lookup::same_variable(context, lhs, rhs)
}

pub fn self_assignment(context: &Context, node: Node) {
    match node.kind() {
        "assignment_expression" => assignment(context, node),
        "field_declaration" => declaration(context, node),
        _ => {}
    }
}

fn assignment(context: &Context, node: Node) {
    let (Some(lhs), Some(operator), Some(value)) = (node.child_by_field_name("left"), node.child_by_field_name("operator"), node.child_by_field_name("right")) else { return };
    if context.text(operator) != "=" {
        return;
    }
    let expression = skip_cast(strip_null_check(context, value));
    if !same_target(context, lhs, expression) {
        return;
    }
    let Some(statement) = parent(node) else { return };
    let mut fix = Fix::replace(statement.start_byte(), statement.end_byte(), "");
    if value.kind() == "method_invocation" {
        fix = Fix::replace(node.start_byte(), node.end_byte(), context.text(value));
    }
    let rhs = skip_cast(if value.kind() == "method_invocation" { strip_null_check(context, value) } else { value });
    let mut fixes = Vec::new();
    if lhs.kind() == "field_access" {
        fixes = parameter_fixes(context, node, rhs);
    } else if rhs.kind() == "identifier" {
        fixes = field_fixes(context, node, lhs);
    }
    if fixes.is_empty() {
        fixes.push(fix);
    }
    context.report_fixed("SelfAssignment", node, operator.start_byte(), MESSAGE, &fixes);
}

fn declaration(context: &Context, node: Node) {
    if !has_modifier(node, "static") || parent(node).is_none_or(|holder| holder.kind() != "class_body") {
        return;
    }
    let Some(class) = parent(node).and_then(parent).filter(|class| class.kind() == "class_declaration") else { return };
    let Some(class_name) = class.child_by_field_name("name").map(|name| context.text(name)) else { return };
    for declarator in declarators(node) {
        let Some(value) = declarator.child_by_field_name("value") else { continue };
        let value = strip_null_check(context, value);
        if value.kind() != "field_access" {
            continue;
        }
        let (Some(object), Some(field), Some(name)) = (value.child_by_field_name("object"), value.child_by_field_name("field"), declarator.child_by_field_name("name")) else { continue };
        let own = matches!(context.resolver.receiver(object), Some(crate::java::types::expr::Receiver::Static(owner)) if crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, node).as_deref() == Some(owner.as_str()));
        if !own || context.text(field) != context.text(name) || context.text(object).rsplit('.').next() != Some(class_name) {
            continue;
        }
        let text = &context.file.text[node.start_byte()..declarator.end_byte()];
        let Some(equals) = text.find('=') else { continue };
        let mut before = text[..equals].chars();
        before.next_back();
        let kept = format!("{};", before.as_str());
        let fix = Fix::replace(node.start_byte(), node.end_byte(), kept);
        context.report_fixed("SelfAssignment", node, name.start_byte(), MESSAGE, &[fix]);
    }
}
