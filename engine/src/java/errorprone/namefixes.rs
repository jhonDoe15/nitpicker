//! The suggested fixes of SameNameButDifferent and DifferentNameButSame.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::{children, parent};
use crate::java::types::model::target;
use tree_sitter::Node;

/// What a simple name stands for at a place, looking for values and types.
enum Ident {
    Class(String),
    Variable,
    Nothing,
}

fn find_ident(context: &Context, at: Node, name: &str) -> Ident {
    if context.resolver.is_variable(at, name) {
        return Ident::Variable;
    }
    context.resolver.class_name(at, name).map_or(Ident::Nothing, Ident::Class)
}

/// Whether the dotted name is a class, with the number of its leading segments that are packages.
fn class_depth(context: &Context, parts: &[&str]) -> Option<usize> {
    (1..=parts.len()).find(|count| context.resolver.index.has(&parts[..*count].join("."))).map(|top| top - 1)
}

/// SameNameButDifferent's `qualifyType`: the name by which the class can be written at the place; a finding of the check
/// has the qualified class name when no enclosing class is in view, and an import is added when a name is free.
fn qualify_type(context: &Context, at: Node, class: &str, imports: &mut bool) -> String {
    let parts: Vec<&str> = class.split('.').collect();
    let Some(packages) = class_depth(context, &parts) else { return class.to_string() };
    let mut names: Vec<&str> = Vec::new();
    for end in (packages + 1..=parts.len()).rev() {
        names.insert(0, parts[end - 1]);
        let own = parts[..end].join(".");
        match find_ident(context, at, parts[end - 1]) {
            Ident::Class(found) if found == own => return names.join("."),
            Ident::Nothing => {
                *imports = true;
                return names.join(".");
            }
            _ => {}
        }
    }
    class.to_string()
}

/// The class `getBetterImport` picks: the owner as many levels up as the written name has parts, when it is a class.
fn better_import(context: &Context, class: &str, written: &str) -> Option<String> {
    let parts: Vec<&str> = class.split('.').collect();
    let up = written.matches('.').count() + 1;
    let kept = parts.len().checked_sub(up).filter(|kept| *kept > 0)?;
    let owner = parts[..kept].join(".");
    context.resolver.index.has(&owner).then_some(owner)
}

/// The edits of SameNameButDifferent's fix for one use of a name that means a class.
pub fn qualify(context: &Context, fix: Fix, at: Node, class: &str, written: &str, imports: &mut bool) -> Fix {
    let Some(owner) = better_import(context, class, written) else { return fix };
    let qualified = qualify_type(context, at, &owner, imports);
    fix.and(at.start_byte(), at.end_byte(), format!("{qualified}.{written}"))
}

/// The annotations written for the tree a type belongs to that may also stand on a type.
fn type_annotations<'t>(context: &Context, holder: Node<'t>) -> Vec<Node<'t>> {
    let listed = match holder.kind() {
        "annotated_type" => children(holder),
        "field_declaration" | "local_variable_declaration" | "formal_parameter" | "spread_parameter" | "method_declaration" | "constant_declaration" => {
            crate::java::helpers::modifiers(holder).map(children).unwrap_or_default()
        }
        _ => return Vec::new(),
    };
    listed
        .into_iter()
        .filter(|part| matches!(part.kind(), "marker_annotation" | "annotation"))
        .filter(|annotation| {
            let Some(name) = annotation.child_by_field_name("name") else { return false };
            let bits = context.resolver.class_name(*annotation, context.text(name)).and_then(|full| context.resolver.index.get(&full)).and_then(|info| info.targets);
            bits.is_some_and(|bits| bits & (target::bit("TYPE_USE") | target::bit("TYPE_PARAMETER")) != 0)
        })
        .collect()
}

/// DifferentNameButSame's fix for one site: the preferred name written in its place, type annotations moved in front of it.
pub fn rename_site(context: &Context, fix: Fix, site: Node, preferred: &str) -> Fix {
    let mut components: Vec<&str> = preferred.split('.').collect();
    let last = components.pop().unwrap_or_default();
    let mut text: String = components.iter().map(|part| format!("{part}.")).collect();
    let mut fix = fix;
    for annotation in parent(site).map(|holder| type_annotations(context, holder)).unwrap_or_default() {
        if annotation.end_byte() < site.start_byte() {
            fix = fix.delete(annotation.start_byte(), annotation.end_byte());
        }
        text.push_str(context.text(annotation));
        text.push(' ');
    }
    text.push_str(last);
    fix.and(site.start_byte(), site.end_byte(), text)
}
