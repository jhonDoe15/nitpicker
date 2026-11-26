//! What the analysis asks of a type variable: its bounds and whether it is marked `@ImmutableTypeParameter`.
use super::super::Context;
use super::written::{Decl, Written, erased_bound, from_type, written};
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::types::model::{OBJECT, Type, flag};
use tree_sitter::Node;

/// The `type_parameter` node a declaration starts at.
fn parameter_at<'t>(context: &'t Context, start: usize) -> Option<Node<'t>> {
    let mut node = context.file.tree.root_node().descendant_for_byte_range(start, start)?;
    loop {
        if node.kind() == "type_parameter" && node.start_byte() == start {
            return Some(node);
        }
        node = parent(node)?;
    }
}

/// The declaration node of a class the file holds, by its full name.
pub fn class_node<'t>(context: &'t Context, name: &str) -> Option<Node<'t>> {
    let (id, _) = context.resolver.scope.names.iter().find(|(_, class)| class.as_str() == name)?;
    let mut found = None;
    walk(context.file.tree.root_node(), |node| {
        if found.is_none() && node.id() == *id {
            found = Some(node);
        }
    });
    found
}

fn class_parameter<'t>(context: &'t Context, class: &str, name: &str) -> Option<Node<'t>> {
    let node = class_node(context, class)?;
    let list = children(node).into_iter().find(|part| part.kind() == "type_parameters")?;
    children(list).into_iter().filter(|part| part.kind() == "type_parameter").find(|part| {
        children(*part).into_iter().find(|inner| matches!(inner.kind(), "type_identifier" | "identifier")).is_some_and(|inner| context.text(inner) == name)
    })
}

fn node_of<'t>(context: &'t Context, decl: &Decl) -> Option<Node<'t>> {
    match decl {
        Decl::Source(start) => parameter_at(context, *start),
        Decl::Index(class, name) => class_parameter(context, class, name),
    }
}

/// The bounds of a type variable, `Object` when it has none.
pub fn bounds(context: &Context, name: &str, decl: &Decl) -> Vec<Written> {
    let object = || Written::Class(OBJECT.to_string(), None, OBJECT.to_string());
    if let Some(node) = node_of(context, decl) {
        let listed: Vec<Written> = children(node)
            .into_iter()
            .find(|part| part.kind() == "type_bound")
            .map(named_children)
            .unwrap_or_default()
            .into_iter()
            .filter(|part| !part.kind().ends_with("comment"))
            .filter_map(|part| written(context, part))
            .collect();
        return if listed.is_empty() { vec![object()] } else { listed };
    }
    let Decl::Index(class, _) = decl else { return vec![object()] };
    let Some(info) = context.resolver.index.get(class) else { return vec![object()] };
    let Some(at) = info.type_parameters.iter().position(|(own, _)| own == name) else { return vec![object()] };
    if let Some(kind) = info.written_bounds.get(at) {
        return vec![from_type(context, kind, class)];
    }
    let erased = &info.type_parameters[at].1;
    erased.name().split('&').map(|part| erased_bound(&Type::class(part))).collect()
}

/// The bound that stands for `?` or `? super X` as an argument of the type parameter at `at`.
pub fn formal_bound(context: &Context, class: &str, at: usize) -> Written {
    let Some(info) = context.resolver.index.get(class) else { return erased_bound(&Type::class(OBJECT)) };
    let name = info.type_parameters[at].0.clone();
    bounds(context, &name, &Decl::Index(class.to_string(), name.clone())).into_iter().next().unwrap_or_else(|| erased_bound(&Type::class(OBJECT)))
}

/// Marked with `@ImmutableTypeParameter`.
pub fn accepted(context: &Context, name: &str, decl: &Decl) -> bool {
    if let Some(node) = node_of(context, decl) {
        return children(node).into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).any(|part| {
            part.child_by_field_name("name").is_some_and(|written| context.resolver.class_name(node, context.text(written)).as_deref() == Some(flag::IMMUTABLE_PARAMETER_NAME))
        });
    }
    let Decl::Index(class, _) = decl else { return false };
    context.resolver.index.get(class).is_some_and(|info| info.immutable_parameters.iter().any(|own| own == name))
}

/// The same variable named one way: by the start of its declaration when the file holds it.
pub fn key(context: &Context, decl: &Decl) -> Decl {
    match (decl, node_of(context, decl)) {
        (Decl::Index(..), Some(node)) => Decl::Source(node.start_byte()),
        _ => decl.clone(),
    }
}
