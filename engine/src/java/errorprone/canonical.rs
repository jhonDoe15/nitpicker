//! NonCanonicalType: a member type written through a subclass of the class that declares it.
use super::fixes::Fix;
use super::shape::qualify_type;
use super::Context;
use crate::engine::source::parent;
use crate::java::types::model::flag;
use crate::java::types::scope::enclosing_types;
use tree_sitter::Node;

/// The part of a name from its first component that starts with an uppercase letter.
fn from_class(name: &str) -> Option<&str> {
    let bytes = name.as_bytes();
    (0..bytes.len().saturating_sub(1)).find(|at| bytes[*at] == b'.' && bytes[at + 1].is_ascii_uppercase()).map(|at| &name[at + 1..])
}

fn description(canonical: &str, written: &str) -> String {
    let (canonical, written) = match (from_class(canonical), from_class(written)) {
        (Some(left), Some(right)) if left != right => (left, right),
        _ => (canonical, written),
    };
    format!("The type `{canonical}` was referred to by the non-canonical name `{written}`. This may be misleading.")
}

fn static_class(context: &Context, name: &str) -> bool {
    let index = context.resolver.index;
    let Some(info) = index.get(name) else { return false };
    let in_interface = name.rsplit_once('.').and_then(|(owner, _)| index.get(owner)).is_some_and(|owner| owner.is_interface);
    info.flags & (flag::STATIC | flag::ENUM | flag::RECORD | flag::ANNOTATION) != 0 || info.is_interface || in_interface
}

/// Visibility.PROTECTED: the usage stands inside a subclass, looking outward only until a static class.
fn protected_visible(context: &Context, name: &str, owner: Option<&str>, receiver: Option<&str>, at: Node) -> bool {
    let index = context.resolver.index;
    let enclosing = enclosing_types(context.resolver.scope, at);
    if static_class(context, name) {
        let Some(owner) = owner else { return false };
        for encl in &enclosing {
            if static_class(context, encl) {
                break;
            }
            if index.is_subtype(encl, owner) {
                return true;
            }
        }
        return false;
    }
    let Some(receiver) = receiver else { return false };
    for encl in &enclosing {
        if static_class(context, encl) {
            break;
        }
        if index.is_subtype(receiver, encl) {
            return true;
        }
    }
    false
}

fn visible(context: &Context, class: &str, at: Node, receiver: Option<&str>) -> bool {
    let index = context.resolver.index;
    let scope = context.resolver.scope;
    let usage_outer = enclosing_types(scope, at).last().cloned();
    let mut current = Some(class.to_string());
    while let Some(name) = current {
        let Some(info) = index.get(&name) else { return false };
        let outer = name.rsplit_once('.').map(|(owner, _)| owner.to_string()).filter(|owner| index.get(owner).is_some());
        let inside_interface = outer.as_ref().and_then(|owner| index.get(owner)).is_some_and(|owner| owner.is_interface);
        if info.flags & flag::PUBLIC == 0 && !inside_interface {
            if info.flags & flag::PRIVATE != 0 {
                let mut top = name.clone();
                while let Some((owner, _)) = top.rsplit_once('.').filter(|(owner, _)| index.get(owner).is_some()) {
                    top = owner.to_string();
                }
                if usage_outer.as_ref() != Some(&top) {
                    return false;
                }
            } else if info.package != scope.package {
                if info.flags & flag::PROTECTED == 0 || !protected_visible(context, &name, outer.as_deref(), receiver, at) {
                    return false;
                }
            }
        }
        current = outer;
    }
    true
}

pub fn non_canonical_type(context: &Context, node: Node) {
    if node.kind() != "scoped_type_identifier" || parent(node).is_some_and(|holder| matches!(holder.kind(), "scoped_type_identifier" | "class_literal")) {
        return;
    }
    let text = context.text(node);
    if text.contains(['<', '@', ' ']) {
        return;
    }
    let components: Vec<&str> = text.split('.').collect();
    let resolver = context.resolver;
    let Some((count, first)) = (1..components.len()).find_map(|count| resolver.class_name(node, &components[..count].join(".")).map(|found| (count, found))) else { return };
    let Some(canonical) = resolver.class_name(node, text) else { return };
    if canonical.contains('$') {
        return;
    }
    let written = format!("{first}.{}", components[count..].join("."));
    if canonical == written || !visible(context, &canonical, node, resolver.class_name(node, &components[..components.len() - 1].join(".")).as_deref()) {
        return;
    }
    let replacement = qualify_type(context, node, &canonical);
    let fix = Fix::replace(node.start_byte(), node.end_byte(), replacement);
    let dot = crate::engine::source::children(node).into_iter().rev().find(|part| part.kind() == ".").map_or(node.start_byte(), |dot| dot.start_byte());
    let anonymous = parent(node).is_some_and(|holder| holder.kind() == "object_creation_expression" && holder.child_by_field_name("type").is_some_and(|ty| ty.id() == node.id()) && crate::engine::source::children(holder).iter().any(|part| part.kind() == "class_body"));
    for _ in 0..if anonymous { 2 } else { 1 } {
        context.report_fixed("NonCanonicalType", node, dot, &description(&canonical, &written), &[fix.clone()]);
    }
}
