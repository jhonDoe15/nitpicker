//! Whether javac writes a call or an instance field read into a method's code, the two things FindSecBugs looks
//! for in a trust manager or hostname verifier method. A call is a method call, `new`, a lambda or method
//! reference, a `+` or `+=` that joins strings, a value boxed or unboxed (in a declaration, an assignment, a
//! `return` or an operator), a `for` over something not an array, a `switch` on anything but
//! an `int`-like value, `try` with resources or `assert`. A read is an instance field read by name, through a value
//! or by a compound assignment (a plain `=` only stores), `Outer.this`, or a local captured from the method
//! around an anonymous or local class, and a record component. Constants read by simple name and strings javac
//! folds are written in place. Lambda bodies and classes declared inside are code of their own.
use super::super::Context;
use crate::engine::source::{children, parent, walk};
use crate::java::types::expr::Binding;
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

const CALLS: &[&str] = &["method_invocation", "object_creation_expression", "explicit_constructor_invocation", "lambda_expression", "method_reference", "assert_statement", "resource_specification"];
const SMALL: &[&str] = &["int", "char", "short", "byte"];

fn is_string(context: &Context, node: Node) -> bool {
    context.resolver.type_of(node).is_some_and(|kind| kind.name() == "java.lang.String")
}

/// Whether javac folds an expression into a constant: literals and constants of any kind joined by operators.
fn folded(context: &Context, node: Node) -> bool {
    let node = crate::java::types::expr::unwrap(node);
    if constant(context, node) || matches!(node.kind(), "string_literal" | "character_literal" | "true" | "false" | "decimal_floating_point_literal") {
        return true;
    }
    node.kind() == "binary_expression" && ["left", "right"].iter().all(|side| node.child_by_field_name(side).is_some_and(|part| folded(context, part)))
}

fn joins(context: &Context, node: Node) -> bool {
    let operator = node.child_by_field_name("operator").map(|operator| context.text(operator));
    match node.kind() {
        "binary_expression" => operator == Some("+") && !folded(context, node) && is_string(context, node),
        "assignment_expression" => operator == Some("+=") && node.child_by_field_name("left").is_some_and(|left| is_string(context, left)),
        _ => false,
    }
}

const BOXES: &[&str] = &["java.lang.Integer", "java.lang.Long", "java.lang.Short", "java.lang.Byte", "java.lang.Character", "java.lang.Boolean", "java.lang.Float", "java.lang.Double"];

fn boxed(kind: &Option<Type>) -> bool {
    kind.as_ref().is_some_and(|kind| BOXES.contains(&kind.erased().name().as_str()))
}

fn primitive(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Primitive(name)) if *name != "void")
}

/// Whether a value moves between a primitive and its box, which javac does with a call.
fn converts(target: Option<Type>, value: Option<Type>) -> bool {
    (boxed(&target) && primitive(&value)) || (primitive(&target) && boxed(&value))
}

fn boxes(context: &Context, member: Node, node: Node) -> bool {
    let type_of = |part: Option<Node>| part.and_then(|part| context.resolver.type_of(part));
    let written = |part: Option<Node>| part.and_then(|part| context.resolver.type_node(part));
    match node.kind() {
        "variable_declarator" => {
            let declared = parent(node).and_then(|holder| holder.child_by_field_name("type"));
            node.child_by_field_name("value").is_some_and(|value| value.kind() != "array_initializer" && converts(written(declared), type_of(Some(value))))
        }
        "assignment_expression" => converts(type_of(node.child_by_field_name("left")), type_of(node.child_by_field_name("right"))),
        "return_statement" => node.named_child(0).is_some_and(|value| converts(written(member.child_by_field_name("type")), type_of(Some(value)))),
        "binary_expression" | "unary_expression" | "update_expression" => children(node).into_iter().filter(|part| part.is_named()).any(|part| boxed(&type_of(Some(part)))),
        _ => false,
    }
}

fn hidden_call(context: &Context, node: Node) -> bool {
    match node.kind() {
        "enhanced_for_statement" => !node.child_by_field_name("value").and_then(|value| context.resolver.type_of(value)).is_some_and(|kind| matches!(kind, Type::Array(_))),
        "switch_expression" | "switch_statement" => {
            let condition = node.child_by_field_name("condition");
            let inner = condition.and_then(|condition| condition.named_child(0)).or(condition);
            !inner.and_then(|inner| context.resolver.type_of(inner)).is_some_and(|kind| matches!(kind, Type::Primitive(name) if SMALL.contains(&name)))
        }
        _ => joins(context, node),
    }
}

/// Whether a plain `=` stores into the node, so that it is not read.
fn only_stored(context: &Context, node: Node) -> bool {
    parent(node).is_some_and(|holder| {
        holder.kind() == "assignment_expression"
            && holder.child_by_field_name("left") == Some(node)
            && holder.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=")
    })
}

fn constant(context: &Context, node: Node) -> bool {
    context.resolver.constant_string(node).is_some() || context.resolver.constant_number(node).is_some() || context.resolver.constant_boolean(node).is_some()
}

fn instance_field(context: &Context, node: Node, name: &str) -> bool {
    matches!(context.resolver.binding(node, name), Some(Binding::Field(_, _, field)) if field.flags & flag::STATIC == 0)
}

/// Whether a local of this name is declared in the method's own code, a parameter included.
fn declared_in(context: &Context, member: Node, name: &str) -> bool {
    let mut found = false;
    walk(member, |node| {
        let named = match node.kind() {
            "type_pattern" => children(node).into_iter().filter(|part| part.kind() == "identifier").last(),
            _ => node.child_by_field_name("name").filter(|named| named.kind() == "identifier"),
        };
        found |= named.is_some_and(|named| context.text(named) == name);
    });
    found
}

/// Whether the record the method belongs to has a component of this name, which javac reads as a field.
fn component(context: &Context, member: Node, name: &str) -> bool {
    let record = parent(member).and_then(parent).filter(|holder| holder.kind() == "record_declaration");
    let listed = record.and_then(|record| record.child_by_field_name("parameters")).map(children).unwrap_or_default();
    listed.into_iter().any(|part| part.child_by_field_name("name").is_some_and(|named| context.text(named) == name))
}

fn reads(context: &Context, member: Node, node: Node, nested: bool) -> bool {
    match node.kind() {
        "identifier" => {
            let holder = parent(node);
            let named_here = holder.is_some_and(|holder| {
                let field = |name: &str| holder.child_by_field_name(name) == Some(node);
                match holder.kind() {
                    "field_access" => field("field"),
                    "method_invocation" => field("name"),
                    "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "enhanced_for_statement" | "resource" | "lambda_expression" => field("name"),
                    "labeled_statement" | "break_statement" | "continue_statement" | "inferred_parameters" => true,
                    _ => false,
                }
            });
            if named_here || only_stored(context, node) || constant(context, node) {
                return false;
            }
            let name = context.text(node);
            match context.resolver.binding(node, name) {
                Some(Binding::Field(_, _, field)) => field.flags & flag::STATIC == 0,
                Some(Binding::Local(_)) if !declared_in(context, member, name) => nested || component(context, member, name),
                None => !declared_in(context, member, name) && component(context, member, name),
                _ => false,
            }
        }
        "field_access" => {
            let Some(field) = node.child_by_field_name("field") else { return false };
            let name = context.text(field);
            if name == "this" {
                return true;
            }
            let own = node.child_by_field_name("object").is_some_and(|object| object.kind() == "this");
            !only_stored(context, node) && name != "length" && (instance_field(context, field, name) || (own && component(context, member, name)))
        }
        _ => false,
    }
}

/// Whether the method's code makes a call or reads an instance field. `nested` says the class is anonymous or
/// declared in a method, so that it may read captured locals.
pub fn busy(context: &Context, member: Node, nested: bool) -> bool {
    let Some(body) = member.child_by_field_name("body") else { return true };
    let mut stack = vec![body];
    while let Some(node) = stack.pop() {
        if CALLS.contains(&node.kind()) || hidden_call(context, node) || boxes(context, member, node) || reads(context, member, node, nested) {
            return true;
        }
        if node.kind() != "class_body" {
            stack.extend(children(node));
        }
    }
    false
}
