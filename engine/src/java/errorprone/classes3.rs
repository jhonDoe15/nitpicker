//! Checks on classes, methods and updates of variables that need their types and members.
use super::fix_helpers::add_modifiers;
use super::finals::{considered_final, rename_variable};
use super::fixes::Fix;
use super::parts::{enclosing_class, preferred};
use super::qualify::qualify;
use super::Context;
use super::symbol_key::same_symbol as same_variable;
use crate::engine::source::{ancestor, children, named_children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::Binding;
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::type_parameter;
use tree_sitter::Node;

fn type_parameter_name<'t>(context: &Context, object: Node<'t>) -> Option<Type> {
    if !matches!(object.kind(), "identifier" | "type_identifier") {
        return None;
    }
    let name = context.text(object);
    type_parameter(context.file, object, name)?;
    if context.resolver.is_variable(object, name) {
        return None;
    }
    context.resolver.type_node(object).filter(|kind| matches!(kind, Type::Class(..)))
}

pub fn type_parameter_qualifier(context: &Context, node: Node) {
    let message = "Type parameter used as type qualifier";
    match node.kind() {
        "field_access" | "method_invocation" => {
            let (Some(object), Some(member)) = (node.child_by_field_name("object"), node.child_by_field_name(if node.kind() == "field_access" { "field" } else { "name" })) else { return };
            let Some(Type::Class(bound, _)) = type_parameter_name(context, object) else { return };
            let name = context.text(member);
            let index = context.resolver.index;
            let owner = if node.kind() == "method_invocation" {
                index.methods(&bound, name).first().map(|(info, _)| info.name.clone())
            } else {
                index.field(&bound, name).map(|(info, _)| info.name.clone())
            };
            let Some(owner) = owner else { return };
            let end = member.end_byte();
            let fix = Fix::replace(node.start_byte().min(object.start_byte()), end, format!("{}.{name}", qualify(context, node, &owner)));
            let at = children(node).into_iter().find(|part| part.kind() == ".").map_or(node.start_byte(), |dot| dot.start_byte());
            context.report_fixed("TypeParameterQualifier", node, at, message, &[fix]);
        }
        "method_reference" => {
            let parts = children(node);
            let (Some(qualifier), Some(last)) = (parts.first(), parts.last()) else { return };
            let Some(Type::Class(bound, _)) = type_parameter_name(context, *qualifier) else { return };
            let name = context.text(*last);
            let Some((owner, _)) = context.resolver.index.methods(&bound, name).first().map(|(info, method)| (info.name.clone(), method.name.clone())) else { return };
            let fix = Fix::replace(qualifier.start_byte(), qualifier.end_byte(), qualify(context, node, &owner));
            context.report_fixed("TypeParameterQualifier", node, node.start_byte(), message, &[fix]);
        }
        _ => {}
    }
}

pub fn override_throwable_to_string(context: &Context, node: Node) {
    if node.kind() != "method_declaration" {
        return;
    }
    let Some(name) = node.child_by_field_name("name").filter(|name| context.text(*name) == "toString") else { return };
    let public = has_modifier(node, "public");
    let string = node.child_by_field_name("type").is_some_and(|kind| matches!(context.resolver.type_node(kind), Some(Type::Class(own, _)) if own == "java.lang.String"));
    if !public || !string || !super::hierarchy::formals(node).is_empty() {
        return;
    }
    let Some(class_body) = parent(node) else { return };
    let Some(class) = enclosing_class(context, node) else { return };
    if !context.resolver.index.is_subtype(&class, "java.lang.Throwable") {
        return;
    }
    let has_message = children(class_body).into_iter().any(|member| member.kind() == "method_declaration" && member.child_by_field_name("name").is_some_and(|own| context.text(own) == "getMessage"));
    if has_message {
        return;
    }
    let fix = Fix::replace(name.start_byte(), name.end_byte(), "getMessage");
    context.report_fixed("OverrideThrowableToString", node, name.start_byte(), "To return a custom message with a Throwable class, one should override getMessage() instead of toString().", &[fix]);
}

pub fn try_with_resources_variable(context: &Context, node: Node) {
    if node.kind() != "try_with_resources_statement" {
        return;
    }
    let resources = node.child_by_field_name("resources").map(named_children).unwrap_or_default();
    for resource in resources {
        let (Some(name), Some(value)) = (resource.child_by_field_name("name"), resource.child_by_field_name("value")) else { continue };
        if resource.child_by_field_name("type").is_none() || !(value.kind() == "this" || (value.kind() == "identifier" && considered_final(context, value))) {
            continue;
        }
        let used = context.text(value);
        let mut fix = Fix::replace(resource.start_byte(), value.end_byte(), used);
        if let Some(body) = node.child_by_field_name("body") {
            let local = super::finals::Local { name, declaration: resource, initialized: true, scope: node };
            let _ = body;
            fix = fix.merged(rename_variable(context, &local, context.text(name), used, false));
        }
        context.report_fixed(
            "TryWithResourcesVariable",
            resource,
            name.start_byte(),
            "This variable is unnecessary, the try-with-resources resource can be a reference to a final or effectively final variable",
            &[fix],
        );
    }
}

fn volatile(context: &Context, expression: Node) -> bool {
    let expression = crate::java::types::expr::unwrap(expression);
    match expression.kind() {
        "identifier" => matches!(context.resolver.binding(expression, context.text(expression)), Some(Binding::Field(_, _, field)) if field.flags & flag::VOLATILE != 0),
        "field_access" => {
            let (Some(object), Some(field)) = (expression.child_by_field_name("object"), expression.child_by_field_name("field")) else { return false };
            let owner = match context.resolver.receiver(object) {
                Some(crate::java::types::expr::Receiver::Static(owner)) => owner,
                Some(crate::java::types::expr::Receiver::Value(Type::Class(owner, _))) => owner,
                _ if object.kind() == "this" => match enclosing_class(context, expression) {
                    Some(owner) => owner,
                    None => return false,
                },
                _ => return false,
            };
            context.resolver.index.field(&owner, context.text(field)).is_some_and(|(_, field)| field.flags & flag::VOLATILE != 0)
        }
        _ => false,
    }
}

fn in_synchronized(node: Node) -> bool {
    if ancestor(node, &["synchronized_statement"]).is_some() {
        return true;
    }
    ancestor(node, &["method_declaration", "constructor_declaration"]).is_some_and(|method| has_modifier(method, "synchronized"))
}

pub fn non_atomic_volatile_update(context: &Context, node: Node) {
    let message = "This update of a volatile variable is non-atomic";
    match node.kind() {
        "update_expression" => {
            let Some(operand) = node.named_child(0) else { return };
            if volatile(context, operand) && !in_synchronized(node) {
                context.report_fixed("NonAtomicVolatileUpdate", node, preferred(node), message, &[]);
            }
        }
        "assignment_expression" => {
            let (Some(left), Some(right), Some(operator)) = (node.child_by_field_name("left"), node.child_by_field_name("right"), node.child_by_field_name("operator")) else { return };
            if !volatile(context, left) || in_synchronized(node) {
                return;
            }
            let op = context.text(operator);
            let hit = match op {
                "+=" | "-=" => true,
                "=" => {
                    right.kind() == "binary_expression"
                        && right.child_by_field_name("operator").is_some_and(|inner| matches!(context.text(inner), "+" | "-"))
                        && [right.child_by_field_name("left"), right.child_by_field_name("right")].into_iter().flatten().any(|side| same_variable(context, side, left))
                }
                _ => false,
            };
            if hit {
                context.report_fixed("NonAtomicVolatileUpdate", node, operator.start_byte(), message, &[]);
            }
        }
        _ => {}
    }
}

fn inner_member<'a>(context: &'a Context, name: &str) -> Option<&'a crate::java::types::model::ClassInfo> {
    let index = context.resolver.index;
    let info = index.get(name)?;
    let (outer, _) = name.rsplit_once('.')?;
    let outer_info = index.get(outer)?;
    let is_static = info.flags & flag::STATIC != 0 || info.is_interface || info.enum_constants.is_some() || info.flags & (flag::RECORD | flag::ANNOTATION) != 0 || outer_info.is_interface;
    (!is_static).then_some(info)
}

fn generic_inner(context: &Context, name: &str, own: &str) -> bool {
    let index = context.resolver.index;
    let mut current = name.to_string();
    while inner_member(context, &current).is_some() {
        let Some((outer, _)) = current.rsplit_once('.') else { return false };
        if index.get(outer).is_some_and(|info| !info.type_parameters.is_empty()) {
            let mut around = Some(own.to_string());
            while let Some(class) = around {
                if index.is_subtype(&class, outer) {
                    let variables = index.get(&class).map(|info| info.type_parameters.iter().map(|(variable, _)| Type::Variable(variable.clone())).collect()).unwrap_or_default();
                    let site = Type::Class(class.clone(), variables);
                    return class == outer || index.arguments_as(&site, outer).is_some_and(|arguments| arguments.iter().any(Type::mentions_variable));
                }
                around = class.rsplit_once('.').map(|(up, _)| up.to_string()).filter(|up| index.has(up));
            }
        }
        current = outer.to_string();
    }
    false
}

fn member_of_enclosing(context: &Context, own: &str, inner: &str) -> bool {
    let Some(info) = inner_member(context, inner) else { return false };
    let Some((outer, _)) = info.name.rsplit_once('.') else { return false };
    let index = context.resolver.index;
    let mut current = Some(own.to_string());
    while let Some(class) = current {
        if index.is_subtype(&class, outer) {
            return true;
        }
        current = class.rsplit_once('.').map(|(up, _)| up.to_string()).filter(|up| index.has(up));
    }
    false
}

/// The class a `this` belongs to: the nearest class declaration, or the body of an anonymous class or enum constant.
fn holder(node: Node) -> Option<Node> {
    let mut at = parent(node);
    while let Some(up) = at {
        let body = up.kind() == "class_body" && parent(up).is_some_and(|holder| matches!(holder.kind(), "object_creation_expression" | "enum_constant"));
        if body || matches!(up.kind(), "class_declaration" | "enum_declaration" | "record_declaration" | "interface_declaration") {
            return Some(up);
        }
        at = parent(up);
    }
    None
}

pub(super) fn references_outer(context: &Context, class: Node, own: &str) -> bool {
    let index = context.resolver.index;
    let owned = |declaring: &str| declaring == own || index.is_subtype(own, declaring);
    let mut found = false;
    let mut skip_until = 0usize;
    walk(class, |node| {
        if found || node.start_byte() < skip_until {
            return;
        }
        match node.kind() {
            "annotation" | "marker_annotation" => skip_until = node.end_byte(),
            "identifier" => {
                let Some(above) = parent(node) else { return };
                let value = match above.kind() {
                    "method_invocation" => above.child_by_field_name("object").is_some_and(|object| object.id() == node.id()),
                    "field_access" => above.child_by_field_name("object").is_some_and(|object| object.id() == node.id()),
                    "variable_declarator" | "resource" | "enhanced_for_statement" => above.child_by_field_name("value").is_some_and(|written| written.id() == node.id()),
                    "formal_parameter" | "method_declaration" | "scoped_identifier" | "labeled_statement" | "break_statement" | "continue_statement" | "scoped_type_identifier" | "enum_constant" | "class_declaration" | "interface_declaration" | "import_declaration" | "package_declaration" | "inferred_parameters" | "catch_formal_parameter" | "switch_label" | "annotation_type_element_declaration" | "record_declaration" | "enum_declaration" => false,
                    "lambda_expression" => above.child_by_field_name("parameters").is_none_or(|list| list.id() != node.id()),
                    _ => true,
                };
                if !value {
                    return;
                }
                if let Some(Binding::Field(_, info, field)) = context.resolver.binding(node, context.text(node)) {
                    if field.flags & flag::STATIC == 0 && !info.is_interface && !owned(&info.name) {
                        found = true;
                    }
                }
            }
            "method_invocation" => {
                if node.child_by_field_name("object").is_none() {
                    if let Some(call) = context.resolver.resolve_call(node) {
                        if !call.method.is_static && !owned(&call.declaring) {
                            found = true;
                        }
                    }
                } else if node.child_by_field_name("object").is_some_and(|object| context.text(object).ends_with(".super")) {
                    found = true;
                }
            }
            "field_access" => {
                if node.child_by_field_name("field").is_some_and(|field| matches!(context.text(field), "this" | "super")) {
                    found = true;
                }
            }
            "this" if parent(node).is_none_or(|above| !matches!(above.kind(), "explicit_constructor_invocation" | "receiver_parameter" | "formal_parameter")) => {
                found |= holder(node).is_some_and(|holder| holder.id() != class.id());
            }
            "object_creation_expression" => {
                let anonymous = children(node).iter().any(|part| part.kind() == "class_body");
                let first = named_children(node).into_iter().next();
                let qualified = first.is_some_and(|first| node.child_by_field_name("type").is_some_and(|kind| kind.start_byte() > first.start_byte()) && first.kind() != "type_arguments" && !first.kind().ends_with("annotation"));
                if anonymous && qualified {
                    found = true;
                }
                if let Some(name) = super::parts::class_of(context, node) {
                    if node.child_by_field_name("object").is_none() && member_of_enclosing(context, own, &name) {
                        found = true;
                    }
                }
            }
            "method_reference" => {
                let parts = children(node);
                if parts.last().is_some_and(|last| context.text(*last) == "new") {
                    if let Some(Type::Class(name, _)) = parts.first().and_then(|first| context.resolver.type_node(*first)) {
                        found |= member_of_enclosing(context, own, &name);
                    }
                }
            }
            "type_identifier" => {
                let name = context.text(node);
                if parent(node).is_some_and(|above| above.kind() == "type_parameter") {
                } else if let Some(declared) = type_parameter(context.file, node, name) {
                    let owner = parent(declared).and_then(parent);
                    if owner.is_none_or(|owner| owner.id() != class.id()) {
                        found = true;
                    }
                } else if parent(node).is_some_and(|above| above.kind() == "generic_type") {
                } else if let Some(full) = context.resolver.class_name(node, name) {
                    if generic_inner(context, &full, own) {
                        found = true;
                    }
                }
            }
            _ => {}
        }
    });
    found
}

pub fn class_can_be_static(context: &Context, node: Node) {
    if node.kind() != "class_declaration" {
        return;
    }
    let Some(mut body) = parent(node).filter(|body| matches!(body.kind(), "class_body" | "enum_body_declarations")) else { return };
    if body.kind() == "enum_body_declarations" {
        let Some(enum_body) = parent(body) else { return };
        body = enum_body;
    }
    let Some(outer_decl) = parent(body) else { return };
    if outer_decl.kind() == "object_creation_expression" || outer_decl.kind() == "enum_constant" || has_modifier(node, "static") {
        return;
    }
    if super::compiled::static_class(context, node) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&node.id()).cloned() else { return };
    if outer_decl.kind() == "class_declaration" && !matches!(parent(outer_decl).map(|up| up.kind()), Some("program" | "class_body" | "interface_body" | "enum_body" | "annotation_type_body" | "block" | "switch_block_statement_group" | "constructor_body")) {
        return;
    }
    if outer_decl.kind() != "class_declaration" && outer_decl.kind() != "enum_declaration" && outer_decl.kind() != "record_declaration" {
        return;
    }
    if let Some(extended) = node.child_by_field_name("superclass").and_then(|clause| clause.named_child(0)).and_then(|kind| context.resolver.type_node(kind)) {
        if inner_member(context, &extended.name()).is_some() {
            return;
        }
    }
    if references_outer(context, node, &own) || super::compiled::class(context, &own).is_some_and(|compiled| super::compiled::this_in_members(context, compiled)) {
        return;
    }
    if super::keep::should_keep(context, node, super::keep::CLASSES) {
        return;
    }
    if named_children(body).iter().any(|member| context.resolver.annotation_names(*member).iter().any(|name| name == "com.google.errorprone.refaster.annotation.BeforeTemplate")) {
        return;
    }
    let at = children(node).into_iter().find(|part| part.kind() == "class").map_or(node.start_byte(), |keyword| keyword.start_byte());
    let fix = add_modifiers(Fix::new(), node, &["static"]);
    context.report_fixed("ClassCanBeStatic", node, at, "Inner class is non-static but does not reference enclosing class", &[fix]);
}
