//! Checks on single expressions and statements that ask what a name or a call stands for.
use super::Context;
use crate::engine::source::{children, parent};
use crate::java::types::expr::Receiver;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub fn assert_false(context: &Context, node: Node) {
    if node.kind() != "assert_statement" {
        return;
    }
    let condition = children(node).into_iter().find(|part| part.is_named() && !part.kind().ends_with("comment"));
    if condition.is_some_and(|condition| condition.kind() == "false") {
        let message = "Assertions may be disabled at runtime and do not guarantee that execution will halt here; consider throwing an exception instead";
        context.report("AssertFalse", node, node.start_byte(), message);
    }
}

fn enum_type(context: &Context, kind: &Type) -> bool {
    matches!(kind, Type::Class(name, _) if context.resolver.index.is_subtype(name, "java.lang.Enum"))
}

const ORDINAL: &str = "You should almost never invoke the Enum.ordinal() method or depend on the enum values by index.";

pub fn enum_ordinal(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => {
            let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
            if name != "ordinal" || node.child_by_field_name("arguments").is_some_and(|list| list.named_child_count() > 0) {
                return;
            }
            let Some(call) = context.resolver.resolve_call(node) else { return };
            if !call.method.is_static && enum_type(context, &call.receiver) {
                let at = node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte());
                context.report("EnumOrdinal", node, at, ORDINAL);
            }
        }
        "array_access" => {
            let Some(array) = node.child_by_field_name("array").filter(|array| array.kind() == "method_invocation") else { return };
            if array.child_by_field_name("name").map(|name| context.text(name)) != Some("values") {
                return;
            }
            let Some(call) = context.resolver.resolve_call(array) else { return };
            if !call.method.is_static || !context.resolver.index.is_subtype(&call.declaring, "java.lang.Enum") {
                return;
            }
            let around = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, node).unwrap_or_default();
            let inside = call.declaring == around || call.declaring.strip_prefix(around.as_str()).is_some_and(|rest| rest.starts_with(['.', '$']));
            if !inside {
                let at = children(node).into_iter().find(|part| part.kind() == "[").map_or(node.start_byte(), |open| open.start_byte());
                context.report("EnumOrdinal", node, at, ORDINAL);
            }
        }
        _ => {}
    }
}

/// An identifier that is read as a value, not the name of something being declared or called.
fn value_name(node: Node) -> bool {
    let Some(holder) = parent(node) else { return false };
    if ["name", "field", "parameters"].iter().any(|field| holder.child_by_field_name(field) == Some(node)) {
        return false;
    }
    !matches!(
        holder.kind(),
        "inferred_parameters" | "labeled_statement" | "break_statement" | "continue_statement" | "scoped_identifier" | "annotation"
            | "marker_annotation" | "element_value_pair" | "method_reference" | "package_declaration" | "import_declaration"
            | "scoped_type_identifier"
    )
}

pub fn void_used(context: &Context, node: Node) {
    let at = match node.kind() {
        "identifier" => {
            if !value_name(node) || !context.resolver.is_variable(node, context.text(node)) {
                return;
            }
            node.start_byte()
        }
        "field_access" => {
            let Some(object) = node.child_by_field_name("object") else { return };
            if !matches!(context.resolver.receiver(object), Some(Receiver::Value(_) | Receiver::Static(_))) {
                return;
            }
            children(node).into_iter().find(|part| part.kind() == ".").map_or(node.start_byte(), |dot| dot.start_byte())
        }
        _ => return,
    };
    let assigned = parent(node).is_some_and(|holder| holder.kind() == "assignment_expression" && holder.child_by_field_name("left") == Some(node));
    if assigned || !matches!(context.resolver.type_of(node), Some(Type::Class(name, _)) if name == "java.lang.Void") {
        return;
    }
    context.report("VoidUsed", node, at, "Using a Void-typed variable is potentially confusing, and can be replaced with a literal `null`.");
}

pub fn object_equals_for_primitives(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let known = match name {
        "equals" => context.resolver.matches_sig(node, "java.util.Objects#equals(_,_)"),
        "equal" => context.resolver.matches_sig(node, "com.google.common.base.Objects#equal(_,_)"),
        _ => false,
    };
    if !known {
        return;
    }
    let arguments = node.child_by_field_name("arguments").map(crate::engine::source::named_children).unwrap_or_default();
    let kinds: Vec<Option<Type>> = arguments.iter().filter(|part| !part.kind().ends_with("comment")).map(|part| context.resolver.type_of(*part)).collect();
    let whole = |kind: &Option<Type>| matches!(kind, Some(Type::Primitive(name)) if !matches!(*name, "double" | "float" | "void"));
    if kinds.len() == 2 && kinds.iter().all(whole) {
        let at = node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte());
        context.report("ObjectEqualsForPrimitives", node, at, "Avoid unnecessary boxing by using plain == for primitive types.");
    }
}

fn only_string_literals(context: &Context, node: Node) -> bool {
    match node.kind() {
        "string_literal" => true,
        "binary_expression" => {
            node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "+")
                && ["left", "right"].iter().all(|side| node.child_by_field_name(side).is_some_and(|part| only_string_literals(context, part)))
        }
        _ => false,
    }
}

fn inside_parentheses(mut node: Node) -> Node {
    while node.kind() == "parenthesized_expression" {
        let Some(inner) = crate::engine::source::named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")) else { break };
        node = inner;
    }
    node
}

const PARENTHESES: &str = "These parentheses are unnecessary; it is unlikely the code will be misinterpreted without them";

pub fn unnecessary_parentheses(context: &Context, node: Node) {
    if node.kind() == "annotation" {
        if context.text(node).ends_with("()") {
            context.report("UnnecessaryParentheses", node, node.start_byte(), PARENTHESES);
        }
        return;
    }
    if node.kind() != "parenthesized_expression" {
        return;
    }
    let Some(holder) = parent(node) else { return };
    if matches!(
        holder.kind(),
        "if_statement" | "while_statement" | "do_statement" | "for_statement" | "switch_expression" | "switch_statement" | "synchronized_statement"
    ) {
        return;
    }
    let Some(inner) = crate::engine::source::named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")) else { return };
    let needed = match inner.kind() {
        "identifier" | "this" | "field_access" | "method_invocation" | "array_access" | "parenthesized_expression" | "object_creation_expression"
        | "method_reference" | "class_literal" => false,
        "lambda_expression" => {
            holder.kind() == "lambda_expression" && holder.child_by_field_name("body").is_some_and(|body| inside_parentheses(body) == inner)
        }
        "string_literal" => false,
        kind if kind.ends_with("_literal") || matches!(kind, "true" | "false" | "null_literal") => false,
        "unary_expression" | "update_expression" => {
            let sign = inner.child(0).is_some_and(|operator| matches!(operator.kind(), "+" | "-")) && inner.kind() == "unary_expression";
            if holder.kind() == "cast_expression" && sign {
                let primitive = holder.child_by_field_name("type").is_some_and(|kind| {
                    matches!(kind.kind(), "integral_type" | "floating_point_type" | "boolean_type")
                });
                if !primitive {
                    return;
                }
            }
            matches!(holder.kind(), "field_access" | "method_invocation") && holder.child_by_field_name("object") == Some(node)
        }
        "binary_expression" => true,
        _ => true,
    };
    let _ = only_string_literals;
    if !needed {
        context.report("UnnecessaryParentheses", node, node.start_byte(), PARENTHESES);
    }
}

const UNUSED_EXCEPTION: &str = "This catch block catches an exception and re-throws another, but swallows the caught exception rather than setting it as a cause. This can make debugging harder.";

pub fn unused_exception(context: &Context, node: Node) {
    if node.kind() != "catch_clause" {
        return;
    }
    let Some(parameter) = children(node).into_iter().find(|part| part.kind() == "catch_formal_parameter") else { return };
    let Some(name) = parameter.child_by_field_name("name").map(|name| context.text(name)) else { return };
    if name.starts_with("unused") || name == "_" {
        return;
    }
    let kinds: Vec<Node> = children(parameter).into_iter().filter(|part| part.kind() == "catch_type").flat_map(crate::engine::source::named_children).collect();
    if let [kind] = kinds.as_slice() {
        let exact = context.resolver.type_node(*kind).map(|kind| kind.name()).unwrap_or_default();
        if matches!(exact.as_str(), "java.lang.InterruptedException" | "java.io.InterruptedIOException") {
            return;
        }
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    let mut used = false;
    crate::engine::source::walk(body, |part| used |= part.kind() == "identifier" && context.text(part) == name && value_name(part));
    if used || !throws_outside_try(body) {
        return;
    }
    context.report("UnusedException", parameter, node.start_byte(), UNUSED_EXCEPTION);
}

fn throws_outside_try(node: Node) -> bool {
    children(node).into_iter().any(|part| match part.kind() {
        "throw_statement" => true,
        "try_statement" | "try_with_resources_statement" => false,
        _ => throws_outside_try(part),
    })
}
