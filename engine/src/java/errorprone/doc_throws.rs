//! InvalidThrows: `@throws` names a checked exception the method does not declare.
use super::doc::Kind;
use super::fixes::Fix;
use super::hierarchy::declared_method;
use super::javadoc::{Documented, Element};
use tree_sitter::Node;

const MESSAGE: &str = "The documented method doesn't actually throw this checked exception.";

pub(super) fn invalid_throws(documented: &Documented, declaration: Node) {
    if documented.element != Element::Method || !matches!(declaration.kind(), "method_declaration" | "constructor_declaration") {
        return;
    }
    let context = documented.context;
    let Some((_, method)) = declared_method(context, declaration) else { return };
    let index = context.resolver.index;
    documented.doc.visit(&mut |tree, _| {
        if tree.kind != Kind::Block || !matches!(tree.name.as_str(), "throws" | "exception") {
            return;
        }
        let Some(reference) = tree.children.first().filter(|part| part.kind == Kind::Reference) else { return };
        let Some(class) = context.resolver.class_name(declaration, reference.name.trim()) else { return };
        if index.get(&class).is_none() || index.is_subtype(&class, "java.lang.Error") || index.is_subtype(&class, "java.lang.RuntimeException") {
            return;
        }
        if method.throws.iter().any(|thrown| index.is_subtype(&class, &thrown.name())) {
            return;
        }
        let (Some(from), Some(to)) = (documented.comment.source_pos(tree.pos), documented.comment.source_pos(tree.end)) else { return };
        context.report_fixed("InvalidThrows", documented.node, from, MESSAGE, &[Fix::replace(from, to, "")]);
    });
}
