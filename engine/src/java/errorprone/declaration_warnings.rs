//! TraditionalSwitchExpression, TransientMisuse, RecordComponentOverride, ToStringReturnsNull, SwigMemoryLeak and SystemConsoleNull.
use super::call_match::static_on_class;
use super::fix_helpers::remove_modifiers;
use super::fixes::Fix;
use super::finals::{considered_final, local_of};
use super::nodes::{name_position, position};
use super::Context;
use crate::engine::source::{ancestor, children, named_children, parent, walk};
use crate::java::helpers::{declarators, has_modifier, modifiers};
use crate::java::types::expr::{literal_text, Binding};
use crate::java::types::model::Type;
use tree_sitter::Node;

pub fn traditional_switch_expression(context: &Context, node: Node) {
    if node.kind() != "switch_block_statement_group" {
        return;
    }
    let Some(switch) = parent(node).and_then(parent).filter(|switch| switch.kind() == "switch_expression" && !super::switches::is_statement(*switch)) else { return };
    for label in children(node).into_iter().filter(|part| part.kind() == "switch_label") {
        context.report_fixed("TraditionalSwitchExpression", label, switch.start_byte(), "Prefer -> switches for switch expressions", &[]);
    }
}

pub fn transient_misuse(context: &Context, node: Node) {
    if node.kind() != "field_declaration" || !has_modifier(node, "static") || !has_modifier(node, "transient") {
        return;
    }
    for declarator in declarators(node) {
        let fix = remove_modifiers(Fix::new(), node, &["transient"]);
        context.report_fixed("TransientMisuse", node, name_position(declarator), "Static fields are implicitly transient, so the explicit modifier is unnecessary", &[fix]);
    }
}

pub fn record_component_override(context: &Context, node: Node) {
    if node.kind() != "record_declaration" {
        return;
    }
    let Some(components) = node.child_by_field_name("parameters") else { return };
    for component in named_children(components).into_iter().filter(|part| part.kind() == "formal_parameter") {
        let Some(holder) = modifiers(component) else { continue };
        for annotation in children(holder).into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")) {
            let Some(name) = annotation.child_by_field_name("name") else { continue };
            if context.resolver.class_name(annotation, context.text(name)).as_deref() != Some("java.lang.Override") {
                continue;
            }
            let start = annotation.start_byte();
            let mut fixes = Vec::new();
            if context.file.text.get(start..start + 9) == Some("@Override") {
                fixes.push(Fix::replace(start, start + 9, ""));
            }
            context.report_fixed("RecordComponentOverride", component, component.child_by_field_name("name").map_or(start, |at| at.start_byte()), "@Override annotations on record components don't do anything.", &fixes);
        }
    }
}

fn is_string(context: &Context, node: Node) -> bool {
    matches!(context.resolver.type_node(node), Some(Type::Class(name, _)) if name == "java.lang.String")
}

fn null_in_returned(expression: Node) -> bool {
    match expression.kind() {
        "null_literal" => true,
        "parenthesized_expression" | "ternary_expression" => named_children(expression).into_iter().any(null_in_returned),
        _ => false,
    }
}

fn returns_null(node: Node) -> bool {
    match node.kind() {
        "lambda_expression" | "class_body" | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration" => false,
        "return_statement" => named_children(node).into_iter().any(null_in_returned),
        _ => children(node).into_iter().any(returns_null),
    }
}

pub fn to_string_returns_null(context: &Context, node: Node) {
    if node.kind() != "method_declaration" || node.child_by_field_name("name").is_none_or(|name| context.text(name) != "toString") {
        return;
    }
    let (Some(body), Some(kind), Some(parameters)) = (node.child_by_field_name("body"), node.child_by_field_name("type"), node.child_by_field_name("parameters")) else { return };
    if !has_modifier(node, "public") || parameters.named_child_count() != 0 || !is_string(context, kind) || !returns_null(body) {
        return;
    }
    context.report_fixed("ToStringReturnsNull", node, name_position(node), "An implementation of Object.toString() should never return null.", &[]);
}

pub fn swig_memory_leak(context: &Context, node: Node) {
    if node.kind() != "string_literal" || literal_text(context.file, node).as_deref() != Some("C++ destructor does not have public access") {
        return;
    }
    let Some(method) = ancestor(node, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"]) else { return };
    if method.child_by_field_name("name").is_none_or(|name| context.text(name) != "delete") {
        return;
    }
    let Some(class) = ancestor(node, &["class_body", "interface_body", "annotation_type_body", "enum_body"]) else { return };
    let mut members = children(class);
    for declarations in children(class).into_iter().filter(|part| part.kind() == "enum_body_declarations") {
        members.extend(children(declarations));
    }
    let finalizer = members.into_iter().any(|member| member.kind() == "method_declaration" && member.child_by_field_name("name").is_some_and(|name| context.text(name) == "finalize"));
    if !finalizer {
        context.report_fixed("SwigMemoryLeak", node, node.start_byte(), "SWIG generated code that can't call a C++ destructor will leak memory", &[]);
    }
}

fn is_null_check(context: &Context, node: Node) -> Option<usize> {
    if node.kind() != "binary_expression" {
        return None;
    }
    let operator = node.child_by_field_name("operator")?;
    if !matches!(context.text(operator), "==" | "!=") {
        return None;
    }
    let is_null = |side: &str| node.child_by_field_name(side).is_some_and(|operand| operand.kind() == "null_literal");
    (is_null("left") || is_null("right")).then(|| position(node))
}

pub fn system_console_null(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !static_on_class(context, node, "java.lang.System", &["console"]) || context.suppressed("SystemConsoleNull", node) {
        return;
    }
    let Some(above) = parent(node) else { return };
    let message = "System.console() no longer returns null in JDK 22 and newer versions";
    if let Some(at) = is_null_check(context, above) {
        context.report_fixed("SystemConsoleNull", above, at, message, &[]);
        return;
    }
    if above.kind() != "variable_declarator" || above.child_by_field_name("value").is_none_or(|value| value.id() != node.id()) {
        return;
    }
    let (Some(name), Some(declaration)) = (above.child_by_field_name("name"), parent(above)) else { return };
    let field = declaration.kind() == "field_declaration";
    if field && !has_modifier(declaration, "final") {
        return;
    }
    let owner = if field { super::parts::enclosing_class(context, declaration) } else { None };
    let variable = context.text(name);
    let mut found = Vec::new();
    walk(context.file.tree.root_node(), |usage| {
        if usage.kind() != "identifier" || context.text(usage) != variable || !parent(usage).is_some_and(|up| is_null_check(context, up).is_some()) {
            return;
        }
        let same = if field {
            matches!(context.resolver.binding(usage, variable), Some(Binding::Field(_, info, _)) if Some(&info.name) == owner.as_ref())
        } else {
            local_of(context, usage, variable).is_some_and(|local| local.name.id() == name.id()) && considered_final(context, usage)
        };
        if same {
            found.push(usage);
        }
    });
    for usage in found {
        context.report_fixed("SystemConsoleNull", usage, usage.start_byte(), message, &[]);
    }
}
