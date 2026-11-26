//! The fixes JdkObsolete suggests for `new LinkedList` and `new StringBuffer`.
use super::Context;
use super::fixes::Fix;
use super::fix_helpers::qualify_type;
use super::values::value_name;
use crate::engine::source::{ancestor, parent, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

/// The class name of a creation without its type arguments.
fn written_class(creation: Node) -> Option<Node> {
    let kind = creation.child_by_field_name("type")?;
    if kind.kind() == "generic_type" { kind.named_child(0) } else { Some(kind) }
}

/// The type Error Prone's `JdkObsolete.getTargetType` finds for a creation.
fn target(context: &Context, creation: Node) -> Option<Type> {
    let holder = parent(creation)?;
    let direct = match holder.kind() {
        "variable_declarator" | "return_statement" | "lambda_expression" => true,
        "assignment_expression" => holder.child_by_field_name("right") == Some(creation),
        "argument_list" => parent(holder).is_some_and(|call| matches!(call.kind(), "method_invocation" | "explicit_constructor_invocation")),
        _ => false,
    };
    if !direct {
        return None;
    }
    if holder.kind() == "variable_declarator" && parent(holder).and_then(|decl| decl.child_by_field_name("type")).is_some_and(|kind| context.text(kind) == "var") {
        return None;
    }
    context.resolver.expected(creation)
}

/// `new LinkedList<>()` becomes `new ArrayList<>()`, or an `ArrayDeque`, whichever the target accepts.
pub fn linked_list_fix(context: &Context, creation: Node) -> Option<Fix> {
    let class = written_class(creation)?;
    let wanted = target(context, creation)?.erased().name();
    let replacement = ["java.util.ArrayList", "java.util.ArrayDeque"].into_iter().find(|own| context.resolver.index.is_subtype(own, &wanted))?;
    let mut fix = Fix::new();
    let written = qualify_type(context, creation, replacement, &mut fix);
    Some(fix.and(class.start_byte(), class.end_byte(), written))
}

fn escapes(context: &Context, method: Node, declarator: Node, name: &str) -> bool {
    let mut escaped = false;
    walk(method, |part| {
        if escaped || part.kind() != "identifier" || context.text(part) != name || !value_name(part) || !context.resolver.is_variable(part, name) {
            return;
        }
        let Some(holder) = parent(part) else { return };
        let selected = holder.kind() == "field_access" && holder.child_by_field_name("object") == Some(part);
        let called = holder.kind() == "method_invocation" && holder.child_by_field_name("object") == Some(part);
        escaped = !(selected || called || holder.id() == declarator.id());
    });
    escaped
}

/// A `StringBuffer` held in a local variable that never leaves the method becomes a `StringBuilder`.
pub fn string_buffer_fix(context: &Context, creation: Node) -> Option<Fix> {
    let declarator = parent(creation).filter(|holder| holder.kind() == "variable_declarator" && holder.child_by_field_name("value") == Some(creation))?;
    let declaration = parent(declarator)?;
    let method = ancestor(declaration, &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "lambda_expression", "class_declaration", "class_body"])?;
    if !method.kind().ends_with("declaration") || method.kind() == "class_declaration" {
        return None;
    }
    let name = context.text(declarator.child_by_field_name("name")?);
    if escapes(context, method, declarator, name) {
        return None;
    }
    let class = written_class(creation)?;
    let mut fix = Fix::replace(class.start_byte(), class.end_byte(), "StringBuilder");
    let kind = declaration.child_by_field_name("type")?;
    if context.text(kind) != "var" {
        fix = fix.and(kind.start_byte(), kind.end_byte(), "StringBuilder");
    }
    Some(fix)
}
