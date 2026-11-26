//! IntLiteralCast, PublicApiNamedStreamShouldReturnStream, StaticAssignmentInConstructor and EqualsUnsafeCast.
use super::Context;
use super::fixes::Fix;
use super::lookup::field_of;
use super::positions::preferred;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

const INT_LITERAL_CAST: &str = "Consider using a literal of the desired type instead of casting an int literal";
const STREAM_NAME: &str = "Public methods named stream() are generally expected to return a type whose name ends with Stream. Consider choosing a different method name instead.";
const STATIC_ASSIGNMENT: &str = "This assignment is to a static field. Mutating static state from a constructor is highly error-prone.";
const UNSAFE_CAST: &str = "The contract of #equals states that it should return false for incompatible types, while this implementation may throw ClassCastException.";

const INT_LITERALS: [&str; 4] = ["decimal_integer_literal", "hex_integer_literal", "octal_integer_literal", "binary_integer_literal"];

fn is_int_literal(context: &Context, node: Node) -> bool {
    INT_LITERALS.contains(&node.kind()) && !context.text(node).ends_with(['l', 'L'])
}

/// The tree javac builds for an int literal: a decimal literal after a minus sign is one literal.
fn int_literal_tree<'t>(context: &Context, node: Node<'t>) -> Option<Node<'t>> {
    if is_int_literal(context, node) {
        return Some(node);
    }
    let minus = node.kind() == "unary_expression" && node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "-");
    let operand = node.child_by_field_name("operand").filter(|operand| operand.kind() == "decimal_integer_literal" && !context.text(*operand).ends_with(['l', 'L']));
    operand.filter(|_| minus).map(|_| node)
}

pub fn int_literal_cast(context: &Context, cast: Node) {
    if cast.kind() != "cast_expression" {
        return;
    }
    let (Some(kind), Some(value)) = (cast.child_by_field_name("type"), cast.child_by_field_name("value")) else { return };
    let Some(literal) = int_literal_tree(context, value) else { return };
    let source = context.text(literal);
    let decimal = !source.starts_with('0') || source == "0";
    let suffix = match context.text(kind) {
        "long" => "L",
        "float" if decimal => ".0f",
        "double" if decimal => ".0",
        _ => return,
    };
    let fix = Fix::new().and(cast.start_byte(), literal.start_byte(), "").insert(literal.end_byte(), suffix);
    context.report_fixed("IntLiteralCast", literal, literal.start_byte(), INT_LITERAL_CAST, &[fix]);
}

/// The simple name javac gives the class of a written type: the name of a type, `Array` for an array.
fn type_symbol_name<'f>(context: &'f Context, written: Node) -> &'f str {
    match written.kind() {
        "array_type" => "Array",
        "generic_type" => written.named_child(0).map_or("", |inner| type_symbol_name(context, inner)),
        "scoped_type_identifier" => context.text(written).rsplit('.').next().unwrap_or_default().trim(),
        "annotated_type" => named_children(written).into_iter().rev().find(|part| !part.kind().ends_with("annotation")).map_or("", |inner| type_symbol_name(context, inner)),
        _ => context.text(written),
    }
}

pub fn public_api_named_stream(context: &Context, method: Node) {
    if method.kind() != "method_declaration" || method.child_by_field_name("name").is_none_or(|name| context.text(name) != "stream") {
        return;
    }
    let interface = parent(method).and_then(parent).is_some_and(|owner| owner.kind() == "interface_declaration" || owner.kind() == "annotation_type_declaration");
    let public = has_modifier(method, "public") || (interface && !has_modifier(method, "private"));
    let Some(returned) = method.child_by_field_name("type") else { return };
    if !public || type_symbol_name(context, returned).ends_with("Stream") {
        return;
    }
    let at = method.child_by_field_name("name").map_or(method.start_byte(), |name| name.start_byte());
    context.report_fixed("PublicApiNamedStreamShouldReturnStream", method, at, STREAM_NAME, &[]);
}

fn scan_assignments(context: &Context, node: Node) {
    for part in children(node) {
        match part.kind() {
            "class_body" | "lambda_expression" | "method_declaration" | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" => continue,
            "assignment_expression" => {
                if part.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=") {
                    check_assignment(context, part);
                }
            }
            _ => {}
        }
        scan_assignments(context, part);
    }
}

fn check_assignment(context: &Context, assignment: Node) {
    let Some(target) = assignment.child_by_field_name("left") else { return };
    if !matches!(target.kind(), "identifier" | "field_access") {
        return;
    }
    let is_static = field_of(context, target).is_some_and(|(_, field)| field.flags & flag::STATIC != 0);
    let this_value = assignment.child_by_field_name("right").is_some_and(|value| value.kind() == "this");
    if is_static && !this_value {
        context.report_fixed("StaticAssignmentInConstructor", assignment, preferred(context, assignment), STATIC_ASSIGNMENT, &[]);
    }
}

pub fn static_assignment_in_constructor(context: &Context, node: Node) {
    if !matches!(node.kind(), "constructor_declaration" | "compact_constructor_declaration") {
        return;
    }
    if let Some(body) = node.child_by_field_name("body").or_else(|| children(node).into_iter().find(|part| part.kind() == "constructor_body" || part.kind() == "block")) {
        scan_assignments(context, body);
    }
}

fn is_equals_declaration(context: &Context, method: Node) -> bool {
    let formals = super::hierarchy::formals(method);
    method.child_by_field_name("name").is_some_and(|name| context.text(name) == "equals")
        && has_modifier(method, "public")
        && method.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "boolean")
        && formals.len() == 1
        && context.resolver.declared_type(formals[0], None).is_some_and(|kind| kind.name() == "java.lang.Object")
}

struct Unsafe<'a, 'c> {
    context: &'a Context<'c>,
    parameter: &'a str,
    invoked: bool,
    checked: Vec<Type>,
}

impl Unsafe<'_, '_> {
    fn visit(&mut self, node: Node) {
        match node.kind() {
            "method_invocation" => {
                self.invoked = true;
                return;
            }
            "instanceof_expression" => {
                let written = node.child_by_field_name("right").or_else(|| children(node).into_iter().find(|part| part.kind() == "type_pattern" || part.kind() == "record_pattern"));
                let written = written.and_then(|part| if part.kind() == "type_pattern" { part.named_child(0).and_then(|inner| if inner.kind() == "identifier" { None } else { Some(inner) }) } else { Some(part) });
                if let Some(kind) = written.and_then(|part| self.context.resolver.type_node(part)) {
                    self.checked.push(kind);
                }
            }
            "cast_expression" => self.cast(node),
            _ => {}
        }
        for part in children(node) {
            self.visit(part);
        }
    }

    fn cast(&mut self, node: Node) {
        let context = self.context;
        let (Some(kind), Some(value)) = (node.child_by_field_name("type"), node.child_by_field_name("value")) else { return };
        if self.invoked || value.kind() != "identifier" || context.text(value) != self.parameter {
            return;
        }
        let target = context.resolver.type_node(kind).map(|found| found.erased());
        let safe = self.checked.iter().any(|seen| target.as_ref().is_some_and(|target| context.resolver.assignable(&seen.erased(), target, true)));
        if safe {
            return;
        }
        let Some(statement) = super::positions::enclosing_statement(node, false) else { return };
        let text = format!("if (!({} instanceof {})) {{ return false; }}", context.text(value), context.text(kind));
        context.report_fixed("EqualsUnsafeCast", node, preferred(context, node), UNSAFE_CAST, &[Fix::new().insert(statement.start_byte(), text)]);
    }
}

pub fn equals_unsafe_cast(context: &Context, method: Node) {
    if method.kind() != "method_declaration" || !is_equals_declaration(context, method) {
        return;
    }
    let formals = super::hierarchy::formals(method);
    let Some(name) = formals[0].child_by_field_name("name").map(|name| context.text(name)) else { return };
    let mut scan = Unsafe { context, parameter: name, invoked: false, checked: Vec::new() };
    if let Some(body) = method.child_by_field_name("body") {
        scan.visit(body);
    }
}
