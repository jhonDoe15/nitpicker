//! Whether a variable is final or effectively final, and the renaming fixes of a local variable.
use super::fixes::Fix;
use super::Context;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::expr::Binding;
use tree_sitter::Node;

/// The declaration of a local variable or parameter named `name` seen from `usage`: its name node, the node that
/// declares it, whether it starts with a value, and the node whose subtree is its scope.
pub struct Local<'t> {
    pub name: Node<'t>,
    pub declaration: Node<'t>,
    pub initialized: bool,
    pub scope: Node<'t>,
}

fn parameter_names<'t>(list: Option<Node<'t>>) -> Vec<Node<'t>> {
    let parts = list.map(named_children).unwrap_or_default();
    parts.into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter" | "catch_formal_parameter")).filter_map(|part| part.child_by_field_name("name").or_else(|| children(part).into_iter().find(|inner| inner.kind() == "variable_declarator").and_then(|d| d.child_by_field_name("name")))).collect()
}

pub fn local_of<'t>(context: &Context, usage: Node<'t>, name: &str) -> Option<Local<'t>> {
    let mut child = usage;
    while let Some(above) = parent(child) {
        match above.kind() {
            "block" | "constructor_body" | "switch_block_statement_group" => {
                for statement in children(above).into_iter().filter(|part| part.kind() == "local_variable_declaration" && part.end_byte() <= usage.start_byte()) {
                    for declarator in declarators(statement) {
                        if let Some(written) = declarator.child_by_field_name("name").filter(|written| context.text(*written) == name) {
                            return Some(Local { name: written, declaration: statement, initialized: declarator.child_by_field_name("value").is_some(), scope: above });
                        }
                    }
                }
            }
            "method_declaration" | "constructor_declaration" | "lambda_expression" | "catch_clause" => {
                let list = above.child_by_field_name("parameters").or_else(|| children(above).into_iter().find(|part| part.kind() == "catch_formal_parameter"));
                let names = if above.kind() == "catch_clause" { list.and_then(|param| param.child_by_field_name("name")).into_iter().collect() } else { parameter_names(list) };
                for written in names {
                    if context.text(written) == name {
                        return Some(Local { name: written, declaration: written, initialized: true, scope: above });
                    }
                }
                if above.kind() == "lambda_expression" {
                    let listed = above.child_by_field_name("parameters").filter(|param| param.kind() == "inferred_parameters");
                    if let Some(written) = listed.and_then(|param| named_children(param).into_iter().find(|part| part.kind() == "identifier" && context.text(*part) == name)) {
                        return Some(Local { name: written, declaration: written, initialized: true, scope: above });
                    }
                    if let Some(single) = above.child_by_field_name("parameters").filter(|param| param.kind() == "identifier" && context.text(*param) == name) {
                        return Some(Local { name: single, declaration: single, initialized: true, scope: above });
                    }
                }
                if matches!(above.kind(), "method_declaration" | "constructor_declaration") {
                    return None;
                }
            }
            "for_statement" => {
                for statement in children(above).into_iter().filter(|part| part.kind() == "local_variable_declaration") {
                    for declarator in declarators(statement) {
                        if let Some(written) = declarator.child_by_field_name("name").filter(|written| context.text(*written) == name) {
                            return Some(Local { name: written, declaration: statement, initialized: declarator.child_by_field_name("value").is_some(), scope: above });
                        }
                    }
                }
            }
            "enhanced_for_statement" => {
                if let Some(written) = above.child_by_field_name("name").filter(|written| context.text(*written) == name) {
                    return Some(Local { name: written, declaration: above, initialized: true, scope: above });
                }
            }
            "try_with_resources_statement" => {
                let resources = above.child_by_field_name("resources").map(named_children).unwrap_or_default();
                for resource in resources {
                    if let Some(written) = resource.child_by_field_name("name").filter(|written| context.text(*written) == name && resource.end_byte() <= usage.start_byte()) {
                        return Some(Local { name: written, declaration: resource, initialized: true, scope: above });
                    }
                }
            }
            "class_body" => return None,
            _ => {}
        }
        child = above;
    }
    None
}

pub fn assignments(context: &Context, scope: Node, name: &str, after: usize) -> (usize, bool) {
    let (mut count, mut compound) = (0, false);
    walk(scope, |node| {
        if node.start_byte() < after {
            return;
        }
        let target = match node.kind() {
            "assignment_expression" => node.child_by_field_name("left"),
            "update_expression" => node.named_child(0),
            _ => None,
        };
        if target.is_some_and(|target| target.kind() == "identifier" && context.text(target) == name) {
            count += 1;
            compound |= node.kind() == "update_expression" || node.child_by_field_name("operator").is_some_and(|op| context.text(op) != "=");
        }
    });
    (count, compound)
}

/// Whether an assignment to the variable sits in a loop that is inside the variable's scope: it can run again.
fn assigned_in_loop(context: &Context, scope: Node, name: &str, after: usize) -> bool {
    let mut found = false;
    walk(scope, |node| {
        let target = (node.kind() == "assignment_expression" && node.start_byte() >= after).then(|| node.child_by_field_name("left")).flatten();
        if !target.is_some_and(|target| target.kind() == "identifier" && context.text(target) == name) {
            return;
        }
        let mut up = parent(node);
        while let Some(above) = up.filter(|above| above.id() != scope.id()) {
            if matches!(above.kind(), "while_statement" | "do_statement" | "for_statement" | "enhanced_for_statement") {
                found = true;
            }
            up = parent(above);
        }
    });
    found
}

/// `Symbol` flags FINAL or EFFECTIVELY_FINAL: a final variable, or a local or parameter that is not assigned again.
pub fn considered_final(context: &Context, usage: Node) -> bool {
    let name = context.text(usage);
    match context.resolver.binding(usage, name) {
        Some(Binding::Field(_, _, field)) => field.flags & crate::java::types::model::flag::FINAL != 0,
        Some(Binding::Local(_)) => {
            let Some(local) = local_of(context, usage, name) else { return false };
            if has_modifier(local.declaration, "final") {
                return true;
            }
            let (count, compound) = assignments(context, local.scope, name, local.name.end_byte());
            if local.initialized { count == 0 } else { !compound && count <= 2 && !assigned_in_loop(context, local.scope, name, local.name.end_byte()) }
        }
        None => false,
    }
}

/// Renames a variable at its declaration and at each use in its scope.
pub fn rename_variable(context: &Context, local: &Local, old: &str, new: &str, declaration: bool) -> Fix {
    let mut fix = if declaration { Fix::replace(local.name.start_byte(), local.name.end_byte(), new) } else { Fix::new() };
    walk(local.scope, |node| {
        if node.kind() != "identifier" || node.start_byte() <= local.name.start_byte() || context.text(node) != old {
            return;
        }
        let Some(above) = parent(node) else { return };
        let reference = match above.kind() {
            "method_invocation" => above.child_by_field_name("name").is_none_or(|written| written.id() != node.id()),
            "field_access" => above.child_by_field_name("field").is_none_or(|written| written.id() != node.id()),
            "variable_declarator" => above.child_by_field_name("value").is_some_and(|written| written.id() == node.id()),
            "formal_parameter" | "method_declaration" | "scoped_identifier" | "labeled_statement" | "break_statement" | "continue_statement" | "annotation" | "marker_annotation" => false,
            _ => true,
        };
        if reference && local_of(context, node, old).is_some_and(|found| found.name.id() == local.name.id()) {
            fix = std::mem::take(&mut fix).and(node.start_byte(), node.end_byte(), new);
        }
    });
    fix
}
