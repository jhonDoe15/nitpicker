//! Finding the declaration of a member in the file being checked.
use super::Context;
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::Type;
use tree_sitter::Node;

/// The field declaration and declarator of `name` in the class `declaring`, when the file declares it.
pub fn field_declarator<'t>(context: &Context, root: Node<'t>, declaring: &str, name: &str) -> Option<(Node<'t>, Node<'t>)> {
    let mut found = None;
    crate::engine::source::walk(root, |node| {
        if found.is_some() || !matches!(node.kind(), "field_declaration" | "constant_declaration") {
            return;
        }
        let owner = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, node);
        if owner.as_deref() != Some(declaring) {
            return;
        }
        found = crate::java::helpers::declarators(node)
            .into_iter()
            .find(|declarator| declarator.child_by_field_name("name").is_some_and(|part| context.text(part) == name))
            .map(|declarator| (node, declarator));
    });
    found
}

/// The field a name or field access stands for: its declaring class and the field.
pub fn field_of<'a>(context: &'a Context, expression: Node) -> Option<(&'a crate::java::types::model::ClassInfo, &'a crate::java::types::model::Field)> {
    match expression.kind() {
        "identifier" => match context.resolver.binding(expression, context.text(expression)) {
            Some(Binding::Field(_, declaring, field)) => Some((declaring, field)),
            _ => None,
        },
        "field_access" => {
            let (object, name) = (expression.child_by_field_name("object")?, expression.child_by_field_name("field")?);
            let owner = match context.resolver.receiver(object)? {
                Receiver::Value(Type::Class(owner, _)) | Receiver::Static(owner) => owner,
                _ => return None,
            };
            context.resolver.index.field(&owner, context.text(name))
        }
        _ => None,
    }
}

/// Error Prone's `sameVariable` on two names or field accesses.
pub fn same_variable(context: &Context, first: Node, second: Node) -> bool {
    let plain = |node: Node| matches!(node.kind(), "identifier" | "field_access");
    if !plain(first) || !plain(second) {
        return false;
    }
    match (first.kind(), second.kind()) {
        ("identifier", "identifier") => context.text(first) == context.text(second),
        ("field_access", "field_access") => {
            let name = |node: Node| node.child_by_field_name("field").map(|part| context.text(part));
            let objects = (first.child_by_field_name("object"), second.child_by_field_name("object"));
            name(first) == name(second) && matches!(objects, (Some(a), Some(b)) if same_variable(context, a, b) || (a.kind() == "this" && b.kind() == "this"))
        }
        _ => {
            let (plain_name, access) = if first.kind() == "identifier" { (first, second) } else { (second, first) };
            let this = access.child_by_field_name("object").is_some_and(|object| object.kind() == "this");
            let same = access.child_by_field_name("field").is_some_and(|part| context.text(part) == context.text(plain_name));
            this && same && context.resolver.binding(plain_name, context.text(plain_name)).is_some_and(|binding| matches!(binding, Binding::Field(..)))
        }
    }
}
