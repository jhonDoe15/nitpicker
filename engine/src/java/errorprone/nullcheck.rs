//! UnnecessaryCheckNotNull.
use super::fixes::Fix;
use super::namefixes::qualify_type;
use super::nodes::{enclosing, position, unparenthesized};
use super::Context;
use crate::engine::source::{named_children, parent, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "This null check is unnecessary; the expression can never be null";

fn arguments(call: Node) -> Vec<Node> {
    call.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn is_check(context: &Context, call: Node) -> bool {
    let name = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let owner = match name {
        "checkNotNull" => "com.google.common.base.Preconditions",
        "verifyNotNull" => "com.google.common.base.Verify",
        "requireNonNull" => "java.util.Objects",
        _ => return false,
    };
    context.resolver.resolve_call(call).is_some_and(|found| found.method.is_static && found.receiver.name() == owner)
}

/// The tree javac has directly above an expression: the node above, or above its argument list.
fn javac_parent(node: Node) -> Option<Node> {
    let above = parent(node)?;
    match above.kind() {
        "argument_list" => parent(above),
        "variable_declarator" => parent(above),
        _ => Some(above),
    }
}

fn replace_node(node: Node, text: &str) -> Fix {
    Fix::replace(node.start_byte(), node.end_byte(), text)
}

/// Whether the expression mentions a parameter of the method around it.
fn uses_parameter(context: &Context, call: Node, expression: Node) -> bool {
    let Some(method) = enclosing(call, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"]) else { return false };
    let parameters: Vec<String> = method
        .child_by_field_name("parameters")
        .map(named_children)
        .unwrap_or_default()
        .into_iter()
        .filter_map(|part| part.child_by_field_name("name").or_else(|| named_children(part).into_iter().find(|inner| inner.kind() == "variable_declarator").and_then(|inner| inner.child_by_field_name("name"))))
        .map(|name| context.text(name).to_string())
        .collect();
    let mut found = false;
    walk(expression, |part| {
        if part.kind() == "identifier" && parameters.iter().any(|name| name == context.text(part)) && parent(part).is_some_and(|holder| holder.kind() != "method_invocation" || holder.child_by_field_name("name").is_none_or(|name| name.id() != part.id())) {
            found = true;
        }
    });
    found
}

/// `qualifyStaticImport` for a `Preconditions` method: the simple name unless the file uses another method of that name.
fn static_name(context: &Context, call: Node, replacement: &str) -> String {
    let mut conflict = false;
    walk(context.file.tree.root_node(), |part| match part.kind() {
        "method_declaration" => conflict |= part.child_by_field_name("name").is_some_and(|name| context.text(name) == replacement),
        "method_invocation" if part.child_by_field_name("object").is_none() && part.child_by_field_name("name").is_some_and(|name| context.text(name) == replacement) => {
            conflict |= context.resolver.resolve_call(part).is_none_or(|found| found.declaring != "com.google.common.base.Preconditions");
        }
        _ => {}
    });
    if conflict {
        let mut imports = false;
        return format!("{}.{replacement}", qualify_type(context, call, "com.google.common.base.Preconditions", &mut imports));
    }
    replacement.to_string()
}

fn primitive_fix(context: &Context, call: Node, first: Node) -> Vec<Fix> {
    let Some(holder) = javac_parent(call) else { return Vec::new() };
    if holder.kind() != "expression_statement" {
        return vec![replace_node(call, context.text(first))];
    }
    let inner = unparenthesized(first);
    if inner.kind() == "binary_expression" {
        let operator = inner.child_by_field_name("operator").map(|part| context.text(part)).unwrap_or_default();
        let (left, right) = (inner.child_by_field_name("left"), inner.child_by_field_name("right"));
        if let (true, Some(left), Some(right)) = (matches!(operator, "==" | "!="), left, right) {
            if left.kind() == "null_literal" {
                return vec![replace_node(first, context.text(right))];
            }
            if right.kind() == "null_literal" {
                return vec![replace_node(first, context.text(left))];
            }
        }
    }
    let boolean = context.resolver.type_of(first) == Some(Type::Primitive("boolean"));
    let shaped = matches!(first.kind(), "binary_expression" | "method_invocation") || (first.kind() == "unary_expression" && context.text(first).starts_with('!'));
    if shaped && boolean {
        let method = if uses_parameter(context, call, first) { "checkArgument" } else { "checkState" };
        let name = static_name(context, call, method);
        let select = call.child_by_field_name("object").map_or(call.start_byte(), |object| object.start_byte());
        let end = call.child_by_field_name("name").map_or(call.end_byte(), |part| part.end_byte());
        return vec![Fix::replace(select, end, name)];
    }
    vec![Fix::replace(holder.start_byte(), holder.end_byte(), "")]
}

pub fn unnecessary_check_not_null(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    if !matches!(name, "checkNotNull" | "verifyNotNull" | "requireNonNull") {
        return;
    }
    let all = arguments(node);
    let Some(first) = all.first().copied() else { return };
    if !is_check(context, node) {
        return;
    }
    if matches!(first.kind(), "object_creation_expression" | "array_creation_expression") {
        let fix = replace_node(node, context.text(first));
        context.report_fixed("UnnecessaryCheckNotNull", node, position(node), MESSAGE, &[fix]);
    } else if first.kind() == "string_literal" {
        let fix = if all.len() == 2 {
            Fix::replace(first.start_byte(), first.end_byte(), context.text(all[1])).and(all[1].start_byte(), all[1].end_byte(), context.text(first))
        } else {
            match javac_parent(node) {
                Some(holder) => Fix::replace(holder.start_byte(), holder.end_byte(), ""),
                None => Fix::new(),
            }
        };
        context.report_fixed("UnnecessaryCheckNotNull", first, first.start_byte(), MESSAGE, &[fix]);
    } else if matches!(context.resolver.type_of(first), Some(Type::Primitive(_))) {
        let fixes = primitive_fix(context, node, first);
        context.report_fixed("UnnecessaryCheckNotNull", first, position(first), MESSAGE, &fixes);
    }
}
