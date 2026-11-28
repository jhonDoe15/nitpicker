//! LockOnBoxedPrimitive: `synchronized` on, or `wait`/`notify` called on, a boxed primitive.
use super::fixes::Fix;
use super::lookup::{field_declarator, field_of};
use super::parts::arguments;
use super::shape::stripped;
use super::Context;
use crate::engine::source::walk;
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "It is dangerous to use a boxed primitive as a lock as it can unintentionally lead to sharing a lock with another piece of code.";

fn is_boxed(context: &Context, expression: Node) -> bool {
    let Some(kind) = context.resolver.type_of(expression) else { return false };
    matches!(&kind, Type::Class(..)) && kind.clone().unboxed_or_same() != kind
}

fn fix_for(context: &Context, locked: Node) -> Fix {
    let Some((declaring, field)) = field_of(context, locked) else { return Fix::new() };
    let Type::Primitive(unboxed) = field.generic.clone().unboxed_or_same() else { return Fix::new() };
    let lock_name = format!("{}Lock", field.name);
    let root = context.file.tree.root_node();
    let mut fix = Fix::new().with_imports();
    if let Some((declaration, _)) = field_declarator(context, root, &declaring.name, &field.name) {
        if let Some(kind) = declaration.child_by_field_name("type") {
            let prefix = format!("private final Object {lock_name} = new Object();\n@GuardedBy(\"{lock_name}\")");
            fix = fix.insert(declaration.start_byte(), prefix).and(kind.start_byte(), kind.end_byte(), unboxed);
        }
    }
    walk(root, |node| {
        if node.kind() != "synchronized_statement" {
            return;
        }
        let Some(expression) = node.named_child(0).map(stripped) else { return };
        if field_of(context, expression).is_some_and(|(other, found)| other.name == declaring.name && found.name == field.name) {
            fix = std::mem::take(&mut fix).and(expression.start_byte(), expression.end_byte(), lock_name.as_str());
        }
    });
    fix
}

pub fn lock_on_boxed_primitive(context: &Context, node: Node) {
    match node.kind() {
        "synchronized_statement" => {
            let Some(locked) = node.named_child(0).map(stripped) else { return };
            if is_boxed(context, locked) {
                context.report_fixed("LockOnBoxedPrimitive", node, node.start_byte(), MESSAGE, &[fix_for(context, locked)]);
            }
        }
        "method_invocation" => {
            let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
            let Some(object) = node.child_by_field_name("object") else { return };
            if !matches!(name, "wait" | "notify" | "notifyAll") || !locking_method(context, node, name) || !is_boxed(context, object) {
                return;
            }
            let dot = crate::engine::source::children(node).into_iter().find(|part| part.kind() == ".").map_or(object.end_byte(), |dot| dot.start_byte());
            context.report_fixed("LockOnBoxedPrimitive", node, dot, MESSAGE, &[]);
        }
        _ => {}
    }
}

/// `wait(long)`, `wait(long, int)`, `wait()`, `notify()`, `notifyAll()`: instance methods of any class.
fn locking_method(context: &Context, call: Node, name: &str) -> bool {
    let Some(resolved) = context.resolver.resolve_call(call).filter(|resolved| !resolved.method.is_static) else { return false };
    let found = &resolved.method.parameters;
    let long = Type::Primitive("long");
    let int = Type::Primitive("int");
    let count = arguments(call).len();
    match name {
        "wait" => count == found.len() && (found.is_empty() || found == &[long.clone()] || found == &[long, int]),
        _ => found.is_empty(),
    }
}
