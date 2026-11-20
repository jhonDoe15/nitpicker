//! Checks on the shape of declarations and statements.
use super::Context;
use super::hierarchy::{declared_method, super_methods};
use super::members::{BODIES, is_method};
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::{declarators, has_modifier};
use tree_sitter::Node;

fn name_start(node: Node) -> usize {
    node.child_by_field_name("name").map_or(node.start_byte(), |name| name.start_byte())
}

pub fn multi_variable_declaration(context: &Context, node: Node) {
    let local = node.kind() == "local_variable_declaration";
    if !local && !matches!(node.kind(), "field_declaration" | "constant_declaration") {
        return;
    }
    let Some(holder) = parent(node) else { return };
    let listed = if local { matches!(holder.kind(), "block" | "constructor_body") } else { BODIES.contains(&holder.kind()) || holder.kind() == "enum_body_declarations" };
    let names = declarators(node);
    if !listed || names.len() < 2 {
        return;
    }
    let around = if local { holder } else { parent(holder).filter(|_| holder.kind() == "enum_body_declarations").unwrap_or(holder) };
    context.report("MultiVariableDeclaration", around, name_start(names[0]), "Variable declarations should declare only one variable");
}

pub fn array_record_component(context: &Context, node: Node) {
    if node.kind() != "record_declaration" {
        return;
    }
    for component in node.child_by_field_name("parameters").map(named_children).unwrap_or_default() {
        let array = component.kind() == "spread_parameter"
            || component.child_by_field_name("type").is_some_and(|kind| kind.kind() == "array_type")
            || component.child_by_field_name("dimensions").is_some();
        if array && matches!(component.kind(), "formal_parameter" | "spread_parameter") {
            let at = match component.kind() {
                "spread_parameter" => declarators(component).first().map_or(component.start_byte(), |name| name_start(*name)),
                _ => name_start(component),
            };
            context.report("ArrayRecordComponent", component, at, "Record components should not be arrays.");
        }
    }
}

pub fn return_at_the_end_of_void_function(context: &Context, node: Node) {
    let void = match node.kind() {
        "method_declaration" => node.child_by_field_name("type").is_some_and(|kind| kind.kind() == "void_type"),
        "constructor_declaration" => true,
        _ => false,
    };
    let Some(body) = node.child_by_field_name("body").filter(|_| void) else { return };
    let last = named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).next_back();
    if last.is_some_and(|last| last.kind() == "return_statement") {
        context.report("ReturnAtTheEndOfVoidFunction", node, name_start(node), "`return;` is unnecessary at the end of void methods and constructors.");
    }
}

pub fn assignment_expression(context: &Context, node: Node) {
    if node.kind() != "assignment_expression" {
        return;
    }
    let Some(operator) = node.child_by_field_name("operator").filter(|operator| operator.kind() == "=") else { return };
    let Some(holder) = parent(node) else { return };
    let plain = |assignment: Node| assignment.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "=");
    let own = node.child_by_field_name("left").filter(|left| left.kind() == "identifier").map(|left| context.text(left));
    let variable = |name: &str| node.child_by_field_name("left").is_some_and(|left| context.resolver.is_variable(left, name));
    let allowed = match holder.kind() {
        "expression_statement" | "lambda_expression" => true,
        "for_statement" => holder.child_by_field_name("condition") != Some(node),
        "parenthesized_expression" => parent(holder).is_some_and(|outer| outer.kind() == "binary_expression"),
        "assignment_expression" if plain(holder) => {
            let outer = holder.child_by_field_name("left").filter(|left| left.kind() == "identifier").map(|left| context.text(left));
            !(own.is_some() && own == outer && own.is_some_and(variable))
        }
        "variable_declarator" => false,
        _ => false,
    };
    if !allowed {
        context.report(
            "AssignmentExpression",
            node,
            operator.start_byte(),
            "The use of an assignment expression can be surprising and hard to read; consider factoring out the assignment to a separate statement.",
        );
    }
}

pub fn protected_members_in_final_class(context: &Context, node: Node) {
    const NAME: &str = "ProtectedMembersInFinalClass";
    if !(node.kind() == "record_declaration" || (node.kind() == "class_declaration" && has_modifier(node, "final"))) {
        return;
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    let mut names: Vec<&str> = Vec::new();
    let mut first = None;
    for member in children(body) {
        let field = member.kind() == "field_declaration";
        if !(field || is_method(member)) || !has_modifier(member, "protected") || context.suppressed(NAME, member) {
            continue;
        }
        if field {
            for declarator in declarators(member) {
                first.get_or_insert(name_start(declarator));
                names.extend(declarator.child_by_field_name("name").map(|name| context.text(name)));
            }
            continue;
        }
        let overrides = declared_method(context, member).is_some_and(|(origin, method)| !super_methods(context.resolver.index, origin, method).is_empty());
        if !overrides {
            first.get_or_insert(name_start(member));
            names.extend(member.child_by_field_name("name").map(|name| context.text(name)));
        }
    }
    if let Some(at) = first {
        context.report(NAME, node, at, &format!("Make members of final classes package-private: {}", names.join(", ")));
    }
}
