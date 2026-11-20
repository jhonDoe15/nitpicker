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
