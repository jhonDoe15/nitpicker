//! NestedInstanceOfConditions and NonCanonicalStaticMemberImport.
use super::compat::castable;
use super::fixes::Fix;
use super::imports::static_import;
use super::shape::stripped;
use super::Context;
use crate::engine::source::{named_children, walk};
use crate::java::types::model::{flag, Type};
use tree_sitter::Node;

/// The type an `instanceof` tests for, when javac gives the expression one (not for a record pattern).
fn tested_type<'t>(context: &Context, expression: Node<'t>) -> Option<(Node<'t>, Type)> {
    let written = match expression.child_by_field_name("right") {
        Some(written) => written,
        None => {
            let pattern = expression.child_by_field_name("pattern").filter(|pattern| pattern.kind() == "type_pattern")?;
            named_children(pattern).into_iter().find(|inner| !matches!(inner.kind(), "modifiers") && !inner.kind().ends_with("comment"))?
        }
    };
    let kind = context.resolver.type_node(written)?;
    Some((written, kind))
}

fn interface_or_final(context: &Context, name: &str) -> Option<(bool, bool)> {
    let info = context.resolver.index.get(name)?;
    Some((info.is_interface, info.flags & (flag::FINAL | flag::ENUM | flag::RECORD) != 0))
}

/// Whether every class a sealed type permits is disjoint from the other type.
fn permitted_disjoint(context: &Context, sealed: &str, other: &str, depth: usize) -> bool {
    let Some(info) = context.resolver.index.get(sealed) else { return false };
    if info.flags & flag::SEALED == 0 || depth > 8 {
        return false;
    }
    info.permitted.as_ref().is_some_and(|permitted| !permitted.is_empty() && permitted.iter().all(|class| !castable_classes(context, class, other, depth + 1)))
}

fn castable_classes(context: &Context, from: &str, to: &str, depth: usize) -> bool {
    let index = context.resolver.index;
    if from == to || index.is_subtype(from, to) || index.is_subtype(to, from) {
        return true;
    }
    let (Some((from_interface, from_final)), Some((to_interface, to_final))) = (interface_or_final(context, from), interface_or_final(context, to)) else { return true };
    if (!from_interface && !to_interface) || from_final || to_final {
        return false;
    }
    !(permitted_disjoint(context, from, to, depth) || permitted_disjoint(context, to, from, depth))
}

/// javac's `isCastable` on two erased types, with sealed hierarchies.
fn castable_erased(context: &Context, from: &Type, to: &Type) -> bool {
    match (from, to) {
        (Type::Class(a, _), Type::Class(b, _)) if !a.contains('&') && !b.contains('&') => castable_classes(context, a, b, 0),
        _ => castable(context, from, to),
    }
}

fn condition_instanceof<'t>(condition: Option<Node<'t>>) -> Option<Node<'t>> {
    condition.map(stripped).filter(|condition| condition.kind() == "instanceof_expression")
}

pub fn nested_instance_of_conditions(context: &Context, node: Node) {
    if node.kind() != "if_statement" {
        return;
    }
    let Some(outer) = condition_instanceof(node.child_by_field_name("condition")) else { return };
    let Some((_, outer_type)) = tested_type(context, outer) else { return };
    let Some(expression) = outer.child_by_field_name("left").filter(|left| left.kind() == "identifier") else { return };
    let source = context.text(expression);
    let mut assigned = false;
    walk(node, |part| {
        if part.kind() == "assignment_expression"
            && part.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=")
            && part.child_by_field_name("left").is_some_and(|left| context.text(left) == source)
        {
            assigned = true;
        }
    });
    if assigned {
        return;
    }
    let Some(then) = node.child_by_field_name("consequence") else { return };
    let mut nested = false;
    walk(then, |part| {
        if part.kind() != "if_statement" {
            return;
        }
        let Some(inner) = condition_instanceof(part.child_by_field_name("condition")) else { return };
        let Some((_, inner_type)) = tested_type(context, inner) else { return };
        let same = inner.child_by_field_name("left").is_some_and(|left| context.text(left) == source);
        nested |= same && !castable_erased(context, &inner_type.erased(), &outer_type.erased());
    });
    if nested {
        let message = "Nested instanceOf conditions of disjoint types create blocks of code that never execute";
        context.report_fixed("NestedInstanceOfConditions", node, node.start_byte(), message, &[]);
    }
}

pub fn non_canonical_static_member_import(context: &Context, node: Node) {
    if node.kind() != "import_declaration" {
        return;
    }
    let Some(import) = static_import(context, node) else { return };
    if import.members.len() == 1 && import.members[0].class {
        return;
    }
    let index = context.resolver.index;
    let mut canonical: Option<String> = None;
    for member in &import.members {
        let owner = if member.class { member.owner.rsplit_once('.').map_or(member.owner.as_str(), |(outer, _)| outer) } else { member.owner.as_str() };
        if canonical.as_ref().is_none_or(|current| index.is_subtype(owner, current)) {
            canonical = Some(owner.to_string());
        }
    }
    let Some(canonical) = canonical else { return };
    let Some(path) = crate::engine::source::children(node).into_iter().find(|part| part.kind() == "scoped_identifier") else { return };
    let written: String = context.text(path).chars().filter(|c| !c.is_whitespace()).collect();
    let imported = written.rsplit_once('.').map_or("", |(owner, _)| owner);
    if imported == canonical {
        return;
    }
    let message = format!("Static import of '{}' uses non-canonical name; prefer '{}'", import.name, canonical);
    let fix = Fix::replace(node.start_byte(), node.end_byte(), format!("import static {canonical}.{};", import.name));
    context.report_fixed("NonCanonicalStaticMemberImport", node, node.start_byte(), &message, &[fix]);
}
