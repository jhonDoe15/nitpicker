//! Which declaration in the file a plain name stands for.
use super::Context;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::declarators;
use tree_sitter::Node;

/// What a name was found to be.
#[derive(Clone, Copy)]
pub enum Named<'t> {
    /// A local variable, resource or field with its declarator (the resource itself for a resource).
    Variable(Node<'t>),
    /// A parameter, loop variable, pattern variable or record component.
    Other(Node<'t>),
}

fn is_named(context: &Context, holder: Node, name: &str) -> bool {
    holder.child_by_field_name("name").is_some_and(|written| context.text(written) == name)
}

fn parameter<'t>(context: &Context, list: Option<Node<'t>>, name: &str) -> Option<Node<'t>> {
    let list = list?;
    if list.kind() == "identifier" {
        return (context.text(list) == name).then_some(list);
    }
    named_children(list).into_iter().find(|part| match part.kind() {
        "identifier" => context.text(*part) == name,
        "formal_parameter" | "catch_formal_parameter" => is_named(context, *part, name),
        "spread_parameter" => named_children(*part).iter().any(|inner| inner.kind() == "variable_declarator" && is_named(context, *inner, name)),
        _ => false,
    })
}

fn pattern<'t>(context: &Context, scope: Node<'t>, usage: Node, name: &str) -> Option<Node<'t>> {
    let mut found = None;
    walk(scope, |node| {
        let binds = match node.kind() {
            "instanceof_expression" => is_named(context, node, name),
            "type_pattern" | "record_pattern_component" => {
                named_children(node).last().is_some_and(|last| last.kind() == "identifier" && context.text(*last) == name)
            }
            _ => false,
        };
        if binds && node.start_byte() < usage.start_byte() {
            found = Some(node);
        }
    });
    found
}

/// The declaration a plain name reads, when the file holds it.
pub fn named<'t>(context: &Context, usage: Node<'t>) -> Option<Named<'t>> {
    let name = context.text(usage);
    let mut inner = usage;
    while let Some(scope) = parent(inner) {
        match scope.kind() {
            "block" | "constructor_body" | "switch_block_statement_group" | "program" => {
                for statement in children(scope) {
                    if statement.kind() != "local_variable_declaration" || statement.start_byte() > usage.start_byte() {
                        continue;
                    }
                    if let Some(found) = declarators(statement).into_iter().find(|declarator| is_named(context, *declarator, name)) {
                        return Some(Named::Variable(found));
                    }
                }
            }
            "for_statement" => {
                for part in children(scope).into_iter().filter(|part| part.kind() == "local_variable_declaration") {
                    if let Some(found) = declarators(part).into_iter().find(|declarator| is_named(context, *declarator, name)) {
                        return Some(Named::Variable(found));
                    }
                }
            }
            "enhanced_for_statement" => {
                if is_named(context, scope, name) && scope.child_by_field_name("value").is_none_or(|value| value.id() != inner.id()) {
                    return Some(Named::Other(scope));
                }
            }
            "catch_clause" => {
                if let Some(found) = children(scope).into_iter().find(|part| part.kind() == "catch_formal_parameter" && is_named(context, *part, name)) {
                    return Some(Named::Other(found));
                }
            }
            "try_with_resources_statement" => {
                let resources = scope.child_by_field_name("resources").map(named_children).unwrap_or_default();
                if let Some(found) = resources.into_iter().find(|part| part.kind() == "resource" && part.start_byte() <= usage.start_byte() && is_named(context, *part, name)) {
                    return Some(Named::Variable(found));
                }
            }
            "lambda_expression" => {
                if let Some(found) = parameter(context, scope.child_by_field_name("parameters"), name) {
                    return Some(Named::Other(found));
                }
            }
            "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => {
                if let Some(found) = pattern(context, scope, usage, name) {
                    return Some(Named::Other(found));
                }
                if let Some(found) = parameter(context, scope.child_by_field_name("parameters"), name) {
                    return Some(Named::Other(found));
                }
            }
            "class_body" | "interface_body" | "enum_body_declarations" | "annotation_type_body" => {
                for member in children(scope).into_iter().filter(|member| matches!(member.kind(), "field_declaration" | "constant_declaration")) {
                    if let Some(found) = declarators(member).into_iter().find(|declarator| is_named(context, *declarator, name)) {
                        return Some(Named::Variable(found));
                    }
                }
            }
            "enum_body" => {
                for member in children(scope).into_iter().filter(|member| member.kind() == "enum_constant") {
                    if is_named(context, member, name) {
                        return Some(Named::Other(member));
                    }
                }
            }
            "record_declaration" => {
                if let Some(found) = parameter(context, scope.child_by_field_name("parameters"), name) {
                    return Some(Named::Other(found));
                }
            }
            _ => {}
        }
        inner = scope;
    }
    None
}
