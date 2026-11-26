//! Error Prone's `SuggestedFixes.renameVariable`, `renameMethodWithInvocations` and `renameClassWithUses`: the declaration
//! and every use of it in the file, for the fixes of IdentifierName.
use super::Context;
use super::fixes::Fix;
use super::hierarchy::declared_method;
use super::names::named_class;
use super::values::value_name;
use super::vars::{Named, named};
use crate::engine::source::{ancestor, parent, walk};
use crate::java::types::expr::Receiver;
use tree_sitter::Node;

/// The class an object expression stands for as the receiver of a member.
fn receiver_class(context: &Context, object: Node) -> Option<String> {
    match context.resolver.receiver(object)? {
        Receiver::Value(kind) => Some(kind.name()),
        Receiver::Static(name) => Some(name),
    }
}

fn declaring_class(context: &Context, declaration: Node) -> Option<String> {
    crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, declaration)
}

/// The edit for a member selected from an expression: from the end of the expression to the end of the member.
fn select(fix: Fix, access: Node, object: Node, separator: &str, replacement: &str) -> Fix {
    fix.and(object.end_byte(), access.end_byte(), format!("{separator}{replacement}"))
}

fn names_declaration(found: Option<Named>, matched: Node) -> bool {
    let id = match found {
        Some(Named::Variable(node) | Named::Other(node)) => node.id(),
        None => return false,
    };
    id == matched.id() || parent(matched).is_some_and(|holder| holder.id() == id)
}

/// A use of a field through an object: `this.name`, `other.name`, `Type.name`.
fn field_use(context: &Context, access: Node, class: &Option<String>) -> bool {
    let Some(object) = access.child_by_field_name("object") else { return false };
    receiver_class(context, object).is_some_and(|found| Some(&found) == class.as_ref())
}

pub fn rename_variable(context: &Context, root: Node, matched: Node, name_node: Node, replacement: &str) -> Fix {
    let name = context.text(name_node);
    let mut fix = Fix::replace(name_node.start_byte(), name_node.end_byte(), replacement);
    let field = parent(matched).is_some_and(|holder| matches!(holder.kind(), "field_declaration" | "constant_declaration"));
    let class = if field { declaring_class(context, matched) } else { None };
    walk(root, |node| match node.kind() {
        "identifier" if node.id() != name_node.id() && context.text(node) == name && value_name(node) => {
            if names_declaration(named(context, node), matched) {
                fix = std::mem::take(&mut fix).and(node.start_byte(), node.end_byte(), replacement);
            }
        }
        "field_access" if field => {
            if node.child_by_field_name("field").is_none_or(|selected| context.text(selected) != name) {
                return;
            }
            if let Some(object) = node.child_by_field_name("object").filter(|_| field_use(context, node, &class)) {
                fix = select(std::mem::take(&mut fix), node, object, ".", replacement);
            }
        }
        _ => {}
    });
    fix
}

pub fn rename_method(context: &Context, root: Node, method: Node, name_node: Node, replacement: &str) -> Fix {
    let name = context.text(name_node);
    let mut fix = Fix::replace(name_node.start_byte(), name_node.end_byte(), replacement);
    let Some((info, declared)) = declared_method(context, method) else { return fix };
    walk(root, |node| match node.kind() {
        "method_invocation" => {
            let Some(called) = node.child_by_field_name("name").filter(|called| context.text(*called) == name) else { return };
            let Some(resolved) = context.resolver.resolve_call(node) else { return };
            if resolved.declaring != info.name || resolved.method.parameters != declared.parameters {
                return;
            }
            fix = match node.child_by_field_name("object") {
                Some(object) => select(std::mem::take(&mut fix), called, object, ".", replacement),
                None => std::mem::take(&mut fix).and(called.start_byte(), called.end_byte(), replacement),
            };
        }
        "method_reference" => {
            let (Some(qualifier), Some(last)) = (node.named_child(0), node.named_child((node.named_child_count().max(1) - 1) as u32)) else { return };
            let alone = info.methods.iter().filter(|candidate| candidate.name == name).count() == 1;
            if last.id() != qualifier.id() && context.text(last) == name && alone && receiver_class(context, qualifier).as_deref() == Some(info.name.as_str()) {
                fix = select(std::mem::take(&mut fix), node, qualifier, "::", replacement);
            }
        }
        _ => {}
    });
    fix
}

pub fn rename_class(context: &Context, root: Node, class: Node, name_node: Node, replacement: &str) -> Fix {
    let name = context.text(name_node);
    let mut fix = Fix::replace(name_node.start_byte(), name_node.end_byte(), replacement);
    let Some(full) = context.resolver.scope.names.get(&class.id()).cloned() else { return fix };
    walk(root, |node| {
        if !matches!(node.kind(), "type_identifier" | "identifier") || node.id() == name_node.id() || context.text(node) != name {
            return;
        }
        if node.kind() == "identifier" && (!value_name(node) || context.resolver.is_variable(node, name)) {
            return;
        }
        let Some(holder) = parent(node) else { return };
        let chained = matches!(holder.kind(), "scoped_type_identifier" | "scoped_identifier" | "field_access") && holder.named_child(0) != Some(node);
        if chained {
            if named_class(context, holder).is_some_and(|(_, found)| found == full) {
                if let Some(before) = holder.named_child(0) {
                    fix = select(std::mem::take(&mut fix), holder, before, ".", replacement);
                }
            }
        } else if ancestor(node, &["import_declaration", "package_declaration"]).is_none() && context.resolver.class_name(node, name).is_some_and(|found| found == full) {
            fix = std::mem::take(&mut fix).and(node.start_byte(), node.end_byte(), replacement);
        }
    });
    fix
}
