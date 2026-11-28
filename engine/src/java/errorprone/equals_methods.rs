//! EqualsHashCode, EqualsUsingHashCode, ThrowableEqualsHashCode and NonOverridingEquals.
use super::fixes::Fix;
use super::nodes::{enclosing, is_variable_use, name_position, position, statements, token};
use super::Context;
use crate::engine::source::{children, named_children, walk};
use crate::java::helpers::{has_modifier, in_interface_or_annotation, modifiers};
use crate::java::types::model::{OBJECT, Type};
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

pub(super) fn is_public(method: Node) -> bool {
    has_modifier(method, "public") || in_interface_or_annotation(method)
}

pub(super) fn formals(method: Node) -> Vec<Node> {
    method.child_by_field_name("parameters").map(named_children).unwrap_or_default().into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter")).collect()
}

pub(super) fn name_of<'a>(context: &'a Context, method: Node) -> &'a str {
    method.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

fn returns_boolean(context: &Context, method: Node, boxed: bool) -> bool {
    let Some(kind) = method.child_by_field_name("type").and_then(|kind| context.resolver.written(kind, true)) else { return false };
    kind == Type::Primitive("boolean") || (boxed && kind == Type::class("java.lang.Boolean"))
}

/// The type of a single formal parameter when it is exactly `Object`.
fn takes_exactly_object(context: &Context, parameter: Node) -> bool {
    parameter.kind() == "formal_parameter"
        && parameter.child_by_field_name("dimensions").is_none()
        && parameter.child_by_field_name("type").and_then(|kind| context.resolver.written(kind, true)) == Some(Type::class(OBJECT))
}

/// Error Prone's `Matchers.equalsMethodDeclaration`.
pub fn equals_declaration(context: &Context, method: Node) -> bool {
    if method.kind() != "method_declaration" || name_of(context, method) != "equals" || !is_public(method) {
        return false;
    }
    let parameters = formals(method);
    parameters.len() == 1 && takes_exactly_object(context, parameters[0]) && returns_boolean(context, method, true)
}

pub(super) fn hash_code_declaration(context: &Context, method: Node) -> bool {
    method.kind() == "method_declaration"
        && name_of(context, method) == "hashCode"
        && is_public(method)
        && formals(method).is_empty()
        && method.child_by_field_name("type").and_then(|kind| context.resolver.written(kind, true)) == Some(Type::Primitive("int"))
}

/// A call of `equals(Object)` that gives a boolean, on any class.
pub(super) fn instance_equals_call(context: &Context, expression: Node) -> bool {
    if expression.kind() != "method_invocation" || expression.child_by_field_name("name").is_none_or(|name| context.text(name) != "equals") {
        return false;
    }
    context.resolver.resolve_call(expression).is_some_and(|call| {
        let method = call.method;
        !method.is_static && method.parameters == [Type::class(OBJECT)] && method.returns == Type::Primitive("boolean")
    })
}

fn single_return_of_equals(context: &Context, method: Node) -> bool {
    let Some(body) = method.child_by_field_name("body") else { return false };
    let all = statements(body);
    let [only] = all.as_slice() else { return false };
    only.kind() == "return_statement" && named_children(*only).into_iter().find(|part| !part.kind().ends_with("comment")).is_some_and(|value| instance_equals_call(context, value))
}

fn members<'t>(class: Node<'t>) -> Vec<Node<'t>> {
    let body = if class.kind() == "class_declaration" { class.child_by_field_name("body") } else { token(class, "class_body") };
    body.map(children).unwrap_or_default()
}

pub fn equals_hash_code(context: &Context, node: Node) {
    if !matches!(node.kind(), "class_declaration" | "object_creation_expression") {
        return;
    }
    if node.kind() == "object_creation_expression" && token(node, "class_body").is_none() {
        return;
    }
    let Some(equals) = members(node).into_iter().filter(|member| equals_declaration(context, *member) && !single_return_of_equals(context, *member)).last() else { return };
    let Some(class) = context.resolver.scope.names.get(&node.id()) else { return };
    let inherited = context.resolver.index.methods(class, "hashCode").into_iter().find(|(_, method)| method.parameters.is_empty());
    if inherited.is_none_or(|(info, _)| info.name == OBJECT) {
        context.report_fixed("EqualsHashCode", equals, name_position(equals), "Classes that override equals should also override hashCode.", &[]);
    }
}

/// Whether the expression holds the call, scanning only the right operand of every binary expression.
fn reaches(expression: Node, target: Node) -> bool {
    if expression.id() == target.id() {
        return true;
    }
    if expression.kind() == "binary_expression" {
        return expression.child_by_field_name("right").is_some_and(|right| reaches(right, target));
    }
    children(expression).into_iter().any(|part| reaches(part, target))
}

const EQUALS_USING_HASH_CODE: &str = "Implementing #equals by just comparing hashCodes is fragile. Hashes collide frequently, and this will lead to false positives in #equals.";

pub fn equals_using_hash_code(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|name| context.text(name) != "hashCode") {
        return;
    }
    let Some(method) = enclosing(node, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"]) else { return };
    if !equals_declaration(context, method) || !context.resolver.resolve_call(node).is_some_and(|call| !call.method.is_static) {
        return;
    }
    let Some(statement) = enclosing(node, &["return_statement"]) else { return };
    if named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")).is_some_and(|value| reaches(value, node)) {
        context.report_fixed("EqualsUsingHashCode", node, position(node), EQUALS_USING_HASH_CODE, &[]);
    }
}

pub fn throwable_equals_hash_code(context: &Context, node: Node) {
    if node.kind() != "method_declaration" || !(equals_declaration(context, node) || hash_code_declaration(context, node)) {
        return;
    }
    let Some(class) = enclosing_type(context.file, context.resolver.scope, node) else { return };
    if context.resolver.index.is_subtype(&class, "java.lang.Throwable") {
        let fix = Fix::replace(node.start_byte(), node.end_byte(), "");
        context.report_fixed("ThrowableEqualsHashCode", node, name_position(node), "Overriding Throwable.equals() or hashCode() is discouraged.", &[fix]);
    }
}

const NON_OVERRIDING: &str = "equals method doesn't override Object.equals";

/// Whether the class declares an instance `boolean equals(Object)`.
fn overrides_equals(context: &Context, class: Node) -> bool {
    members(class).into_iter().any(|member| {
        member.kind() == "method_declaration"
            && name_of(context, member) == "equals"
            && returns_boolean(context, member, false)
            && !has_modifier(member, "static")
            && matches!(formals(member).as_slice(), [only] if takes_exactly_object(context, *only))
    })
}

fn is_identifier_use(node: Node, name: &str, context: &Context) -> bool {
    node.kind() == "identifier" && context.text(node) == name && is_variable_use(node)
}

fn has_override(context: &Context, method: Node) -> bool {
    modifiers(method).map(children).unwrap_or_default().into_iter().any(|part| {
        matches!(part.kind(), "marker_annotation" | "annotation")
            && part.child_by_field_name("name").is_some_and(|name| context.resolver.class_name(part, context.text(name)).is_some_and(|full| full == "java.lang.Override"))
    })
}

fn covariant_fix(context: &Context, method: Node, parameter: Node) -> Fix {
    let mut fix = Fix::new();
    if !has_override(context, method) {
        fix = fix.insert(method.start_byte(), "@Override\n");
    }
    let (Some(kind), Some(name)) = (parameter.child_by_field_name("type"), parameter.child_by_field_name("name")) else { return fix };
    let written = context.text(kind).to_string();
    let variable = context.text(name).to_string();
    fix = fix.and(kind.start_byte(), kind.end_byte(), "Object");
    let Some(body) = method.child_by_field_name("body") else { return fix };
    if let Some(first) = statements(body).first() {
        fix = fix.insert(first.start_byte(), format!("if (!({variable} instanceof {written})) {{\n  return false;\n}}\n"));
    }
    walk(body, |part| {
        if is_identifier_use(part, &variable, context) {
            fix = std::mem::take(&mut fix).and(part.start_byte(), part.end_byte(), format!("(({written}) {variable})"));
        }
    });
    fix
}

pub fn non_overriding_equals(context: &Context, node: Node) {
    if node.kind() != "method_declaration" || name_of(context, node) != "equals" || !returns_boolean(context, node, true) {
        return;
    }
    let parameters = formals(node);
    let [parameter] = parameters.as_slice() else { return };
    if takes_exactly_object(context, *parameter) {
        return;
    }
    let at = name_position(node);
    let Some(class) = enclosing(node, &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration", "object_creation_expression"]) else { return };
    if overrides_equals(context, class) {
        let helper = format!("{NON_OVERRIDING}; if this is a type-specific helper for a method that does override Object.equals, either inline it into the callers or rename it to avoid ambiguity");
        context.report_fixed("NonOverridingEquals", node, at, &helper, &[]);
        return;
    }
    if has_modifier(node, "static") || !is_public(node) || !returns_boolean(context, node, false) {
        context.report_fixed("NonOverridingEquals", node, at, NON_OVERRIDING, &[]);
        return;
    }
    if class.kind() == "enum_declaration" {
        let message = format!("{NON_OVERRIDING}; enum instances can safely be compared by reference equality, so please delete this");
        context.report_fixed("NonOverridingEquals", node, at, &message, &[Fix::replace(node.start_byte(), node.end_byte(), "")]);
        return;
    }
    context.report_fixed("NonOverridingEquals", node, at, NON_OVERRIDING, &[covariant_fix(context, node, *parameter)]);
}

