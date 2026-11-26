//! BadAnnotationImplementation: a class that implements `Annotation` without its own `equals` and `hashCode`.
use super::Context;
use super::hierarchy::closure;
use super::shape::class_keyword;
use crate::engine::source::children;
use crate::java::types::model::{OBJECT, Type};
use tree_sitter::Node;

const ENUM_MESSAGE: &str = "Enums cannot correctly implement Annotation because their equals and hashCode methods are final. Consider using AutoAnnotation instead of implementing Annotation by hand.";
const MESSAGE: &str = "Classes that implement Annotation must override equals and hashCode. Consider using AutoAnnotation instead of implementing Annotation by hand.";

fn defines_equals(context: &Context, class: &str) -> bool {
    context.resolver.index.get(class).is_some_and(|info| {
        info.methods.iter().any(|method| method.name == "equals" && !method.is_static && !method.is_abstract && method.parameters == [Type::class(OBJECT)])
    })
}

fn defines_hash_code(context: &Context, class: &str) -> bool {
    context.resolver.index.get(class).is_some_and(|info| {
        info.methods.iter().any(|method| method.name == "hashCode" && !method.is_static && !method.is_abstract && method.parameters.is_empty())
    })
}

pub fn bad_annotation_implementation(context: &Context, node: Node) {
    let anonymous = node.kind() == "object_creation_expression" && children(node).iter().any(|part| part.kind() == "class_body");
    if !matches!(node.kind(), "class_declaration" | "enum_declaration") && !anonymous {
        return;
    }
    let Some(name) = context.resolver.scope.names.get(&node.id()) else { return };
    let index = context.resolver.index;
    if !index.is_subtype(name, "java.lang.annotation.Annotation") {
        return;
    }
    let body = children(node).into_iter().find(|part| part.kind() == "class_body");
    let at = if anonymous { body.map_or(node.start_byte(), |body| body.start_byte()) } else { class_keyword(node) };
    if node.kind() == "enum_declaration" {
        return context.report_fixed("BadAnnotationImplementation", node, at, ENUM_MESSAGE, &[]);
    }
    let mut lineage = vec![name.clone()];
    lineage.extend(closure(index, name));
    let supers = lineage.iter().filter(|class| class.as_str() != OBJECT);
    let (mut equals, mut hash_code) = (false, false);
    for class in supers {
        equals |= defines_equals(context, class);
        hash_code |= defines_hash_code(context, class);
    }
    if !equals || !hash_code {
        context.report_fixed("BadAnnotationImplementation", node, at, MESSAGE, &[]);
    }
}
