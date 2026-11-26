//! The fixes of ExposedPrivateType: make the member private, or give the private classes the visibility of the member.
use super::Context;
use super::fix_helpers::{add_modifiers, remove_modifiers};
use super::fixes::Fix;
use super::hierarchy::{annotation_names, declared_method, super_methods};
use crate::engine::source::{children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

const VISIBILITIES: [&str; 3] = ["public", "protected", "private"];

/// The visibility a declaration has: what it says, or public inside an interface.
fn visibility(declaration: Node) -> Option<&'static str> {
    if let Some(written) = VISIBILITIES.iter().find(|word| has_modifier(declaration, word)) {
        return Some(written);
    }
    let holder = parent(declaration)?;
    matches!(holder.kind(), "interface_body" | "annotation_type_body").then_some("public")
}

/// Gives the declaration the visibility, taking the other two off.
fn refactor(fix: Fix, declaration: Node, wanted: Option<&str>) -> Fix {
    let fix = match wanted {
        Some(word) => add_modifiers(fix, declaration, &[word]),
        None => fix,
    };
    let others: Vec<&str> = VISIBILITIES.iter().copied().filter(|word| Some(*word) != wanted).collect();
    remove_modifiers(fix, declaration, &others)
}

fn test_case(context: &Context, method: Node) -> bool {
    let named_test = |name: Node| context.text(name).starts_with("test");
    let junit3 = method.child_by_field_name("name").is_some_and(named_test)
        && super::hierarchy::formals(method).is_empty()
        && has_modifier(method, "public")
        && method.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "void");
    junit3
        || annotation_names(context, method).into_iter().any(|written| {
            let name = context.resolver.class_name(method, written).unwrap_or_else(|| written.to_string());
            matches!(name.as_str(), "org.junit.Test" | "org.junit.experimental.theories.Theory")
        })
}

fn should_reduce(context: &Context, node: Node) -> bool {
    if !super::members::is_method(node) {
        return true;
    }
    let overrides = declared_method(context, node).is_some_and(|(origin, method)| !super_methods(context.resolver.index, origin, method).is_empty());
    !overrides && !test_case(context, node)
}

fn declaration_of<'t>(context: &Context, root: Node<'t>, class: &str) -> Option<Node<'t>> {
    let mut found = None;
    walk(root, |part| {
        if found.is_none() && TYPE_DECLARATIONS.contains(&part.kind()) && context.resolver.scope.names.get(&part.id()).is_some_and(|name| name == class) {
            found = Some(part);
        }
    });
    found
}

/// The two fixes Error Prone offers for a member that shows private classes.
pub fn fixes(context: &Context, node: Node, classes: &[&String]) -> Vec<Fix> {
    let mut out = Vec::new();
    if should_reduce(context, node) {
        out.push(refactor(Fix::new(), node, Some("private")));
    }
    let root = std::iter::successors(Some(node), |at| parent(*at)).last().unwrap_or(node);
    let wanted = visibility(node);
    let mut raise = Fix::new();
    for class in classes {
        if let Some(declaration) = declaration_of(context, root, class) {
            raise = refactor(raise, declaration, wanted);
        }
    }
    out.push(raise);
    out
}
