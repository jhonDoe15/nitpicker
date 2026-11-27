//! Which values the compiler knows: SpotBugs reports no dead store of a constant.
use super::super::super::Context;
use super::super::slots::Layout;
use crate::engine::source::{named_children, parent};
use crate::java::flow::cfg::unwrap;
use crate::java::helpers::has_modifier;
use crate::java::types::expr::Binding;
use crate::java::types::model::{ClassInfo, Field, Type, flag};
use tree_sitter::Node;

const LITERALS: &[&str] = &[
    "decimal_integer_literal", "hex_integer_literal", "octal_integer_literal", "binary_integer_literal",
    "decimal_floating_point_literal", "hex_floating_point_literal", "character_literal", "string_literal", "text_block", "true", "false",
];

/// Whether the compiler knows the value of an expression.
pub fn constant(context: &Context, layout: &Layout, node: Node) -> bool {
    let node = unwrap(node);
    match node.kind() {
        kind if LITERALS.contains(&kind) => true,
        "binary_expression" | "unary_expression" | "ternary_expression" => {
            named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).all(|part| constant(context, layout, part))
        }
        "cast_expression" => {
            let simple = node.child_by_field_name("type").is_some_and(|written| {
                matches!(written.kind(), "integral_type" | "floating_point_type" | "boolean_type") || matches!(context.text(written), "String" | "java.lang.String")
            });
            simple && node.child_by_field_name("value").is_some_and(|value| constant(context, layout, value))
        }
        "identifier" => match layout.uses.get(&node.id()) {
            Some(var) => layout.vars[*var].constant,
            None => context.resolver.constant_field_as(node, true) || fixed_member(context, node),
        },
        "field_access" => context.resolver.constant_field_as(node, true) || fixed_access(context, node),
        "scoped_identifier" => context.resolver.constant_field_as(node, true),
        _ => false,
    }
}

/// A `final` instance field of a class of the file with a constant value: javac writes the value where it is read.
fn fixed_member(context: &Context, node: Node) -> bool {
    let Some(Binding::Field(_, info, field)) = context.resolver.binding(node, context.text(node)) else { return false };
    fixed(context, info, field)
}

/// The same field read through an object, as `this.f` or `other.f`: javac still writes the value.
fn fixed_access(context: &Context, node: Node) -> bool {
    let receiver = node.child_by_field_name("object").and_then(|object| context.resolver.type_of(object));
    let name = node.child_by_field_name("field").map(|name| context.text(name)).unwrap_or_default();
    let found = receiver.and_then(|kind| context.resolver.index.field(&kind.erased().name(), name));
    found.is_some_and(|(info, field)| fixed(context, info, field))
}

fn fixed(context: &Context, info: &ClassInfo, field: &Field) -> bool {
    let simple = matches!(&field.kind, Type::Primitive(_)) || matches!(&field.kind, Type::Class(name, _) if name == "java.lang.String");
    let instance = field.flags & flag::STATIC == 0;
    instance && simple && initializer(context, info, field).is_some_and(|value| context.resolver.constant_shape(value, &mut Vec::new()))
}

/// The value a `final` field of a class of the file is declared with.
fn initializer<'a>(context: &Context<'a>, info: &ClassInfo, field: &Field) -> Option<Node<'a>> {
    if field.flags & flag::FINAL == 0 {
        return None;
    }
    let class = context.classes.get(&info.name)?;
    let members = class.child_by_field_name("body").map(named_children).unwrap_or_default();
    let declared = members.into_iter().filter(|member| member.kind() == "field_declaration").flat_map(crate::java::helpers::declarators);
    let found = declared.into_iter().find(|declarator| declarator.child_by_field_name("name").is_some_and(|name| context.text(name) == field.name));
    found.and_then(|declarator| declarator.child_by_field_name("value"))
}

/// The value of a condition the compiler knows, for which it writes only the arm that runs: a literal, its
/// negation, or a `final` field set to one.
pub fn known(context: &Context, node: Node) -> Option<bool> {
    let node = unwrap(node);
    match node.kind() {
        "true" => Some(true),
        "false" => Some(false),
        "unary_expression" if node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "!") => {
            node.child_by_field_name("operand").and_then(|operand| known(context, operand)).map(|value| !value)
        }
        "identifier" => match context.resolver.binding(node, context.text(node)) {
            Some(Binding::Field(_, info, field)) => initializer(context, info, field).and_then(|value| known(context, value)),
            _ => None,
        },
        _ => None,
    }
}

/// Whether a `long` or `double` constant is 0 or 1, which the compiler pushes without `ldc2_w`.
pub(super) fn small(context: &Context, node: Node) -> bool {
    let node = unwrap(node);
    if !LITERALS[..6].contains(&node.kind()) {
        return false;
    }
    let text: String = context.text(node).chars().filter(|c| *c != '_').collect();
    let digits = text.trim_end_matches(['l', 'L', 'd', 'D', 'f', 'F']);
    digits.parse::<f64>().is_ok_and(|value| value == 0.0 || value == 1.0)
}


/// A `final` local of a primitive type or `String` set to a constant: the compiler writes the value where it is read.
pub fn constant_local(context: &Context, layout: &Layout, declarator: Node) -> bool {
    let Some(statement) = parent(declarator).filter(|statement| statement.kind() == "local_variable_declaration") else { return false };
    let simple = statement.child_by_field_name("type").is_some_and(|written| {
        matches!(written.kind(), "integral_type" | "floating_point_type" | "boolean_type") || matches!(context.text(written), "String" | "java.lang.String" | "var")
    });
    let value = declarator.child_by_field_name("value");
    simple && has_modifier(statement, "final") && declarator.child_by_field_name("dimensions").is_none() && value.is_some_and(|value| constant(context, layout, value))
}

