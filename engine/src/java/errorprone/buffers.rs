//! ByteBufferBackingArray: `ByteBuffer.array()` on a buffer that may not be backed by an array from its start.
use super::Context;
use crate::engine::source::{ancestor, children, parent, walk};
use crate::java::types::expr::Binding;
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "ByteBuffer.array() shouldn't be called unless ByteBuffer.arrayOffset() is used or if the ByteBuffer was initialized using ByteBuffer.wrap() or ByteBuffer.allocate().";

#[derive(PartialEq, Eq, Clone)]
enum Symbol {
    Local(String),
    Field(String, String),
}

fn symbol(context: &Context, node: Node) -> Option<Symbol> {
    match node.kind() {
        "identifier" => match context.resolver.binding(node, context.text(node))? {
            Binding::Local(_) => Some(Symbol::Local(context.text(node).to_string())),
            Binding::Field(_, declaring, field) => Some(Symbol::Field(declaring.name.clone(), field.name.clone())),
        },
        "field_access" => {
            let (declaring, field) = super::lookup::field_of(context, node)?;
            Some(Symbol::Field(declaring.name.clone(), field.name.clone()))
        }
        _ => None,
    }
}

fn is_allocator(context: &Context, call: Node) -> bool {
    call.kind() == "method_invocation"
        && matches!(call.child_by_field_name("name").map(|name| context.text(name)), Some("allocate" | "wrap"))
        && (context.resolver.matches_sig(call, "java.nio.ByteBuffer#allocate(_*)") || context.resolver.matches_sig(call, "java.nio.ByteBuffer#wrap(_*)"))
}

fn is_exact_buffer(context: &Context, node: Node) -> bool {
    matches!(context.resolver.type_of(node), Some(Type::Class(name, _)) if name == "java.nio.ByteBuffer")
}

fn has_allocator(context: &Context, expression: Node) -> bool {
    let mut found = false;
    walk(expression, |node| found |= is_allocator(context, node));
    found
}

fn call_named(context: &Context, node: Node, name: &str) -> bool {
    node.kind() == "method_invocation"
        && node.child_by_field_name("name").is_some_and(|part| context.text(part) == name)
        && context.resolver.matches_sig(node, &format!("java.nio.ByteBuffer#{name}(_*)"))
}

/// Error Prone's scan for an `arrayOffset` call, or an initializer that allocates or wraps, before any `array` call.
fn valid_in(context: &Context, root: Node, wanted: &Symbol) -> bool {
    let (mut visited, mut valid) = (false, false);
    let mut check = |target: Option<Symbol>, expression: Option<Node>, visited: bool, valid: &mut bool| {
        if visited || *valid || target.as_ref() != Some(wanted) {
            return;
        }
        if expression.is_some_and(|expression| has_allocator(context, expression)) {
            *valid = true;
        }
    };
    walk(root, |node| match node.kind() {
        "variable_declarator" => {
            let target = node.child_by_field_name("name").map(|name| match parent(node).map(|holder| holder.kind()) {
                Some("field_declaration") => {
                    let owner = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, node).unwrap_or_default();
                    Symbol::Field(owner, context.text(name).to_string())
                }
                _ => Symbol::Local(context.text(name).to_string()),
            });
            check(target, node.child_by_field_name("value"), visited, &mut valid);
        }
        "assignment_expression" if node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=") => {
            let target = node.child_by_field_name("left").and_then(|left| symbol(context, left));
            check(target, node.child_by_field_name("right"), visited, &mut valid);
        }
        "method_invocation" if !valid => {
            let receiver = node.child_by_field_name("object").and_then(|object| symbol(context, object));
            if receiver.as_ref() == Some(wanted) {
                if call_named(context, node, "array") {
                    visited = true;
                } else if call_named(context, node, "arrayOffset") {
                    valid = true;
                }
            }
        }
        _ => {}
    });
    valid
}

pub fn byte_buffer_backing_array(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|name| context.text(name) != "array") || !call_named(context, node, "array") {
        return;
    }
    let mut receiver = node;
    loop {
        let Some(next) = receiver.child_by_field_name("object") else { return };
        receiver = next;
        if is_allocator(context, receiver) || !is_exact_buffer(context, receiver) {
            return;
        }
        if receiver.kind() != "method_invocation" {
            break;
        }
    }
    let Some(wanted) = symbol(context, receiver) else { return };
    match &wanted {
        Symbol::Local(_) => {
            let Some(method) = ancestor(node, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"]) else { return };
            if valid_in(context, method, &wanted) {
                return;
            }
        }
        Symbol::Field(owner, _) => {
            let Some(class) = enclosing_class_named(context, node, owner) else { return };
            let members = children(class.child_by_field_name("body").unwrap_or(class));
            if members.into_iter().any(|member| valid_in(context, member, &wanted)) {
                return;
            }
        }
    }
    let at = node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte());
    context.report_fixed("ByteBufferBackingArray", node, at, MESSAGE, &[]);
}

fn enclosing_class_named<'t>(context: &Context<'t>, node: Node<'t>, owner: &str) -> Option<Node<'t>> {
    let mut found = None;
    let mut at = parent(node);
    while let Some(up) = at {
        if matches!(up.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "class_body")
            && crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, up).as_deref() == Some(owner)
            && found.is_none()
        {
            found = Some(up);
        }
        at = parent(up);
    }
    if found.is_some() {
        return found;
    }
    let mut hit = None;
    walk(context.file.tree.root_node(), |class| {
        if hit.is_none() && matches!(class.kind(), "class_declaration" | "enum_declaration" | "record_declaration" | "interface_declaration") && crate::java::types::scope::class_at(context.resolver.scope, class, class).as_deref() == Some(owner) {
            hit = Some(class);
        }
    });
    hit
}
