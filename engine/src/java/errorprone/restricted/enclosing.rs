//! Error Prone's `enclosingNode(hasAnyAnnotation(...))`: a declaration around the use (a variable, method or class,
//! never the use itself) carries one of the annotations. A class also carries the `@Inherited` annotations of its
//! superclasses.
use super::super::Context;
use super::super::keep::annotations;
use crate::engine::source::parent;
use tree_sitter::Node;

const CLASSES: &[&str] = &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];
const INHERITED: &str = "java.lang.annotation.Inherited";

fn inherited(context: &Context, annotation: &str) -> bool {
    context.resolver.index.get(annotation).is_some_and(|info| info.class_annotations.iter().any(|name| name == INHERITED))
}

/// Whether a superclass of the class, read from the index, carries one of the `@Inherited` annotations.
fn superclass_has(context: &Context, class: &str, wanted: &[&String]) -> bool {
    let index = context.resolver.index;
    let mut seen: Vec<String> = Vec::new();
    let mut current = index.get(class).and_then(|info| info.superclass.clone());
    while let Some(name) = current.filter(|name| !seen.contains(name)) {
        let Some(info) = index.get(&name) else { return false };
        if info.class_annotations.iter().any(|found| wanted.contains(&found)) {
            return true;
        }
        seen.push(name);
        current = info.superclass.clone();
    }
    false
}

/// The annotations written on the declaration that `node` stands for in javac's tree, if it is one.
fn declared(context: &Context, node: Node) -> Option<Vec<String>> {
    match node.kind() {
        "variable_declarator" => parent(node)
            .filter(|holder| matches!(holder.kind(), "local_variable_declaration" | "field_declaration" | "constant_declaration"))
            .map(|holder| annotations(context, holder)),
        "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "enum_constant" | "resource" => Some(annotations(context, node)),
        kind if CLASSES.contains(&kind) => Some(annotations(context, node)),
        _ => None,
    }
}

/// The class `node` declares: a named class, or the anonymous class of a `class_body` under a `new` or an enum
/// constant.
fn class_name(context: &Context, node: Node) -> Option<String> {
    let names = &context.resolver.scope.names;
    if CLASSES.contains(&node.kind()) {
        return names.get(&node.id()).cloned();
    }
    let holder = parent(node).filter(|holder| node.kind() == "class_body" && matches!(holder.kind(), "object_creation_expression" | "enum_constant"))?;
    names.get(&holder.id()).cloned()
}

/// Whether a declaration around `used` carries one of the annotations.
pub fn enclosing_has(context: &Context, used: Node, wanted: &[String]) -> bool {
    if wanted.is_empty() {
        return false;
    }
    let passed: Vec<&String> = wanted.iter().filter(|name| inherited(context, name)).collect();
    let mut current = parent(used);
    while let Some(node) = current {
        if declared(context, node).is_some_and(|found| found.iter().any(|name| wanted.contains(name))) {
            return true;
        }
        if !passed.is_empty() && class_name(context, node).is_some_and(|class| superclass_has(context, &class, &passed)) {
            return true;
        }
        current = parent(node);
    }
    false
}
