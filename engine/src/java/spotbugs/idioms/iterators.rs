//! IT_NO_SUCH_ELEMENT: a `next()` of a class that is an `Iterator`, whose code makes no call SpotBugs counts as one
//! that could throw: no instance method call and no object creation (static calls do not count). A class whose own
//! `hasNext()` always returns true is left alone. The line is the last instruction of `next()`.
use super::super::{Context, place};
use super::Compiled;
use crate::engine::source::named_children;
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub const PATTERN: &str = "IT_NO_SUCH_ELEMENT";

fn statements(body: Node) -> Vec<Node> {
    named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn no_parameters(method: Node) -> bool {
    method.child_by_field_name("parameters").is_some_and(|list| named_children(list).iter().all(|part| part.kind().ends_with("comment")))
}

fn named(context: &Context, method: Node, name: &str) -> bool {
    method.kind() == "method_declaration" && method.child_by_field_name("name").is_some_and(|written| context.text(written) == name) && no_parameters(method)
}

/// `hasNext()` that only returns `true`, with no test on the way.
fn always_true(context: &Context, method: Node) -> bool {
    let Some(body) = method.child_by_field_name("body") else { return false };
    let parts = statements(body);
    let Some((last, before)) = parts.split_last() else { return false };
    let straight = before.iter().all(|part| matches!(part.kind(), "local_variable_declaration" | "expression_statement" | "empty_statement") && !branches(*part));
    straight && last.kind() == "return_statement" && last.named_child(0).is_some_and(|value| matches!(constant(context, body, value), Some(Value::Bool(true))))
}

#[derive(Clone, PartialEq)]
enum Value {
    Bool(bool),
    Number(f64),
    Text(String),
}

/// What javac folds a constant expression to, as far as `hasNext()` needs: truth, numbers and strings, including
/// a `final` local of the method set from a constant.
fn constant(context: &Context, body: Node, node: Node) -> Option<Value> {
    let node = crate::java::types::expr::unwrap(node);
    let text = context.text(node);
    let fold = |inner: Node| constant(context, body, inner);
    match node.kind() {
        "true" => Some(Value::Bool(true)),
        "false" => Some(Value::Bool(false)),
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" => super::super::folds::number(context, node).map(|value| Value::Number(value as f64)).or_else(|| {
            let digits = text.trim_end_matches(['l', 'L']).replace('_', "");
            digits.parse::<i64>().ok().map(|value| Value::Number(value as f64))
        }),
        "decimal_floating_point_literal" => text.trim_end_matches(['f', 'F', 'd', 'D']).replace('_', "").parse::<f64>().ok().map(Value::Number),
        "character_literal" => {
            let inner = text.trim_matches('\'');
            (inner.chars().count() == 1).then(|| Value::Number(f64::from(u32::from(inner.chars().next().unwrap_or_default()))))
        }
        "string_literal" => context.resolver.constant_string(node).map(Value::Text),
        "cast_expression" => fold(node.child_by_field_name("value")?),
        "ternary_expression" => match fold(node.child_by_field_name("condition")?)? {
            Value::Bool(test) => fold(node.child_by_field_name(if test { "consequence" } else { "alternative" })?),
            _ => None,
        },
        "unary_expression" => match (context.text(node.child(0)?), fold(node.child_by_field_name("operand")?)?) {
            ("!", Value::Bool(value)) => Some(Value::Bool(!value)),
            ("-", Value::Number(value)) => Some(Value::Number(-value)),
            ("+", Value::Number(value)) => Some(Value::Number(value)),
            _ => None,
        },
        "binary_expression" => {
            let operator = context.text(node.child_by_field_name("operator")?);
            let (left, right) = (fold(node.child_by_field_name("left")?)?, fold(node.child_by_field_name("right")?)?);
            match (left, right) {
                (Value::Bool(a), Value::Bool(b)) => match operator {
                    "&&" | "&" => Some(Value::Bool(a && b)),
                    "||" | "|" => Some(Value::Bool(a || b)),
                    "==" => Some(Value::Bool(a == b)),
                    "!=" | "^" => Some(Value::Bool(a != b)),
                    _ => None,
                },
                (Value::Number(a), Value::Number(b)) => match operator {
                    "==" => Some(Value::Bool(a == b)),
                    "!=" => Some(Value::Bool(a != b)),
                    "<" => Some(Value::Bool(a < b)),
                    ">" => Some(Value::Bool(a > b)),
                    "<=" => Some(Value::Bool(a <= b)),
                    ">=" => Some(Value::Bool(a >= b)),
                    "+" => Some(Value::Number(a + b)),
                    "-" => Some(Value::Number(a - b)),
                    "*" => Some(Value::Number(a * b)),
                    _ => None,
                },
                (Value::Text(a), Value::Text(b)) => match operator {
                    "==" => Some(Value::Bool(a == b)),
                    "!=" => Some(Value::Bool(a != b)),
                    "+" => Some(Value::Text(a + &b)),
                    _ => None,
                },
                _ => None,
            }
        }
        "identifier" | "field_access" => {
            if let Some(value) = super::super::folds::fixed(context, Some(node)) {
                return Some(Value::Bool(value));
            }
            if let Some(value) = super::super::folds::number(context, node) {
                return Some(Value::Number(value as f64));
            }
            if let Some(value) = context.resolver.constant_string(node) {
                return Some(Value::Text(value));
            }
            if node.kind() == "identifier" {
                if let Some(crate::java::types::expr::Binding::Field(_, _, field)) = context.resolver.binding(node, text) {
                    return field_value(field);
                }
                return local_constant(context, body, node);
            }
            let object = node.child_by_field_name("object")?;
            let crate::java::types::expr::Receiver::Static(owner) = context.resolver.receiver(object)? else { return None };
            let (_, field) = context.resolver.index.field(&owner, context.text(node.child_by_field_name("field")?))?;
            field_value(field)
        }
        _ => None,
    }
}

/// A constant field's number: as written, or as the class file holds it for a whole number.
fn field_value(field: &crate::java::types::model::Field) -> Option<Value> {
    let written = field.constant.as_deref().and_then(|written| written.trim_end_matches(['L', 'l']).parse::<f64>().ok());
    let whole = || field.number.filter(|_| !matches!(field.kind.name().as_str(), "float" | "double")).map(|number| number as f64);
    written.or_else(whole).map(Value::Number)
}

/// The value of a `final` local declared earlier in the method with a constant initializer.
fn local_constant(context: &Context, body: Node, name: Node) -> Option<Value> {
    let wanted = context.text(name);
    for statement in statements(body) {
        if statement.start_byte() >= name.start_byte() || statement.kind() != "local_variable_declaration" {
            continue;
        }
        let modifiers = named_children(statement).into_iter().find(|part| part.kind() == "modifiers");
        if !modifiers.is_some_and(|modifiers| context.text(modifiers).split_whitespace().any(|word| word == "final")) {
            continue;
        }
        for declarator in crate::java::helpers::declarators(statement) {
            if declarator.child_by_field_name("name").is_some_and(|declared| context.text(declared) == wanted) {
                return constant(context, body, declarator.child_by_field_name("value")?);
            }
        }
    }
    None
}

fn branches(node: Node) -> bool {
    matches!(node.kind(), "ternary_expression" | "lambda_expression" | "switch_expression") || named_children(node).into_iter().any(branches)
        || (node.kind() == "binary_expression" && node.child_by_field_name("operator").is_some_and(|operator| matches!(operator.kind(), "&&" | "||")))
}

fn boxed(kind: &Type) -> bool {
    matches!(kind.erased().name().as_str(), "java.lang.Integer" | "java.lang.Long" | "java.lang.Short" | "java.lang.Byte" | "java.lang.Character" | "java.lang.Boolean" | "java.lang.Float" | "java.lang.Double")
}

/// Whether javac writes a call SpotBugs counts for the node: a call of an instance method, a constructor (also of
/// an anonymous class), an unboxing, or the calls behind a `for` over an `Iterable`, a `switch` on a string or enum
/// and a `try` with resources.
fn calls(context: &Context, node: Node) -> bool {
    let resolver = context.resolver;
    match node.kind() {
        "object_creation_expression" | "explicit_constructor_invocation" => true,
        "method_invocation" => resolver.resolve_call(node).is_none_or(|call| !call.method.is_static),
        "enhanced_for_statement" => node.child_by_field_name("value").and_then(|value| resolver.type_of(value)).is_none_or(|kind| !matches!(kind, Type::Array(_))),
        "switch_statement" | "switch_expression" => node.child_by_field_name("condition").and_then(|value| resolver.type_of(value)).is_none_or(|kind| !matches!(kind, Type::Primitive(_))),
        "try_with_resources_statement" | "assert_statement" => true,
        "binary_expression" | "unary_expression" | "update_expression" => named_children(node).into_iter().any(|operand| resolver.type_of(operand).is_some_and(|kind| boxed(&kind))),
        _ => false,
    }
}

/// The line of the last instruction javac writes for a statement.
fn last_line(context: &Context, statement: Node) -> usize {
    match statement.kind() {
        "block" => statements(statement).last().map_or_else(|| context.line(statement), |last| last_line(context, *last)),
        "if_statement" => match statement.child_by_field_name("alternative").or(statement.child_by_field_name("consequence")) {
            Some(branch) => last_line(context, branch),
            None => context.line(statement),
        },
        "try_statement" => {
            let parts = named_children(statement);
            match parts.iter().rev().find(|part| matches!(part.kind(), "catch_clause" | "finally_clause")) {
                Some(clause) => clause.child_by_field_name("body").or_else(|| named_children(*clause).into_iter().rev().find(|part| part.kind() == "block")).map_or_else(|| context.line(*clause), |body| last_line(context, body)),
                None => statement.child_by_field_name("body").map_or_else(|| context.line(statement), |body| last_line(context, body)),
            }
        }
        "labeled_statement" => named_children(statement).into_iter().last().map_or_else(|| context.line(statement), |inner| last_line(context, inner)),
        "while_statement" | "for_statement" | "do_statement" | "enhanced_for_statement" | "synchronized_statement" => statement.child_by_field_name("body").or_else(|| named_children(statement).into_iter().last()).map_or_else(|| context.line(statement), |body| last_line(context, body)),
        _ => context.line(statement),
    }
}

pub fn check(context: &Context, own: &str, class: Node, methods: &[Compiled]) {
    if !context.wants(&[PATTERN]) || class.kind() == "annotation_type_declaration" {
        return;
    }
    if !context.resolver.index.is_subtype(own, "java.util.Iterator") {
        return;
    }
    if methods.iter().any(|method| !method.lambda && named(context, method.member, "hasNext") && always_true(context, method.member)) {
        return;
    }
    for method in methods.iter().filter(|method| !method.lambda && named(context, method.member, "next")) {
        let member = method.member;
        if has_modifier(member, "static") || has_modifier(member, "abstract") || has_modifier(member, "native") || member.child_by_field_name("body").is_none() {
            continue;
        }
        let Some(body) = member.child_by_field_name("body") else { continue };
        if method.nodes.iter().any(|node| calls(context, *node)) {
            continue;
        }
        let line = statements(body).last().map_or_else(|| context.line_at(body.end_byte().saturating_sub(1)), |last| last_line(context, *last));
        let message = format!("{} cannot throw NoSuchElementException", method.label);
        context.report_listed(PATTERN, member, line, message, place::function(&method.label), 2, vec![method.label.clone()]);
    }
}
