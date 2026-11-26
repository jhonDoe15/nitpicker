//! FloggerLogString: `log(String)` with an argument that is no compile-time constant.
use super::Context;
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::types::expr::{Binding, Receiver, unwrap};
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "Arguments to log(String) must be compile-time constants or parameters annotated with @CompileTimeConstant. If possible, use Flogger's formatting log methods instead.";
const CONSTANT_ANNOTATION: &str = "com.google.errorprone.annotations.CompileTimeConstant";

pub fn flogger_log_string(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|name| context.text(name) != "log") {
        return;
    }
    let list = arguments(call);
    if list.len() != 1 || call.child_by_field_name("object").is_none() {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if resolved.method.is_static || resolved.method.parameters != [Type::class("java.lang.String")] {
        return;
    }
    let Some(receiver) = receiver_class(context, call) else { return };
    if !context.resolver.index.is_subtype(&receiver, "com.google.common.flogger.LoggingApi") || compile_time_constant(context, list[0]) {
        return;
    }
    context.report_fixed("FloggerLogString", call, preferred(context, call), MESSAGE, &[]);
}

/// Error Prone's `CompileTimeConstantExpressionMatcher`.
pub(super) fn compile_time_constant(context: &Context, expression: Node) -> bool {
    let expression = unwrap(expression);
    match expression.kind() {
        "null_literal" => return true,
        "cast_expression" if expression.child_by_field_name("value").is_some_and(|value| unwrap(value).kind() == "null_literal") => return true,
        _ => {}
    }
    value_matcher(context, expression)
}

fn value_matcher(context: &Context, expression: Node) -> bool {
    let expression = unwrap(expression);
    match expression.kind() {
        "ternary_expression" => {
            let both = ["consequence", "alternative"].map(|field| expression.child_by_field_name(field));
            both.iter().all(|part| part.is_some_and(|part| value_matcher(context, part)))
        }
        "switch_expression" => switch_matcher(context, expression),
        "method_invocation" => immutable_factory(context, expression) && arguments(expression).into_iter().all(|argument| value_matcher(context, argument)),
        "binary_expression" => {
            if has_value(context, expression) {
                return true;
            }
            let plus = expression.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "+");
            plus && ["left", "right"].iter().all(|field| expression.child_by_field_name(field).is_some_and(|part| value_matcher(context, part)))
        }
        "identifier" => has_value(context, expression) || annotated_identifier(context, expression) || annotated_field(context, expression),
        "field_access" => has_value(context, expression) || annotated_field(context, expression),
        _ => has_value(context, expression),
    }
}

fn immutable_factory(context: &Context, call: Node) -> bool {
    if call.child_by_field_name("name").is_none_or(|name| context.text(name) != "of") {
        return false;
    }
    let owner = context.resolver.resolve_call(call).filter(|resolved| resolved.method.is_static).and_then(|_| super::odd_calls::receiver_class(context, call));
    matches!(owner.as_deref(), Some("com.google.common.collect.ImmutableList" | "com.google.common.collect.ImmutableSet"))
}

/// A switch expression whose rules are all a value or a throw.
fn switch_matcher(context: &Context, expression: Node) -> bool {
    let Some(body) = expression.child_by_field_name("body") else { return false };
    let parts = named_children(body);
    let rules: Vec<Node> = parts.iter().copied().filter(|part| part.kind() == "switch_rule").collect();
    if rules.len() != parts.iter().filter(|part| !part.kind().ends_with("comment")).count() {
        return false;
    }
    rules.iter().all(|rule| {
        let body = named_children(*rule).into_iter().filter(|part| !matches!(part.kind(), "switch_label") && !part.kind().ends_with("comment")).last();
        match body {
            Some(part) if part.kind() == "throw_statement" => true,
            Some(part) if part.kind() == "expression_statement" => part.named_child(0).is_some_and(|inner| value_matcher(context, inner)),
            _ => false,
        }
    })
}

const NUMBER_LITERALS: [&str; 8] = [
    "decimal_integer_literal", "hex_integer_literal", "octal_integer_literal", "binary_integer_literal", "decimal_floating_point_literal",
    "hex_floating_point_literal", "character_literal", "string_literal",
];

/// Whether the compiler knows a constant value for the expression.
fn has_value(context: &Context, expression: Node) -> bool {
    let expression = unwrap(expression);
    match expression.kind() {
        kind if NUMBER_LITERALS.contains(&kind) => true,
        "true" | "false" => true,
        "unary_expression" => expression.child_by_field_name("operand").is_some_and(|operand| has_value(context, operand)),
        "binary_expression" => ["left", "right"].iter().all(|field| expression.child_by_field_name(field).is_some_and(|part| has_value(context, part))),
        "ternary_expression" => ["condition", "consequence", "alternative"].iter().all(|field| expression.child_by_field_name(field).is_some_and(|part| has_value(context, part))),
        "cast_expression" => {
            let primitive = expression.child_by_field_name("type").is_some_and(|written| {
                matches!(context.text(written), "int" | "long" | "short" | "byte" | "char" | "boolean" | "double" | "float" | "String" | "java.lang.String")
            });
            primitive && expression.child_by_field_name("value").is_some_and(|value| has_value(context, value))
        }
        "identifier" => match context.resolver.binding(expression, context.text(expression)) {
            Some(Binding::Local(_)) => local_constant(context, expression),
            Some(Binding::Field(_, info, field)) if field.flags & crate::java::types::model::flag::STATIC == 0 => {
                field.flags & crate::java::types::model::flag::FINAL != 0 && field.strict && instance_initializer(context, &info.name, &field.name).is_some_and(|value| has_value(context, value))
            }
            Some(Binding::Field(..)) => context.resolver.constant_field_as(expression, true),
            None => false,
        },
        "field_access" => {
            let Some(object) = expression.child_by_field_name("object") else { return false };
            matches!(context.resolver.receiver(object), Some(Receiver::Static(_))) && context.resolver.constant_field_as(expression, true)
        }
        _ => false,
    }
}

/// The declaration of the local variable or parameter a name stands for.
pub(super) fn declaration_of<'t>(context: &Context, usage: Node<'t>) -> Option<(Node<'t>, Option<Node<'t>>)> {
    let name = context.text(usage);
    let mut inner = usage;
    let mut current = parent(usage);
    while let Some(at) = current {
        match at.kind() {
            "block" | "constructor_body" | "switch_block_statement_group" => {
                for statement in children(at).into_iter().filter(|part| part.kind() == "local_variable_declaration" && part.start_byte() < inner.start_byte()) {
                    let found = children(statement).into_iter().find(|part| part.kind() == "variable_declarator" && part.child_by_field_name("name").is_some_and(|n| context.text(n) == name));
                    if let Some(declarator) = found {
                        return Some((statement, Some(declarator)));
                    }
                }
            }
            "method_declaration" | "constructor_declaration" | "lambda_expression" => {
                let list = at.child_by_field_name("parameters");
                let holder = list.map(named_children).unwrap_or_default();
                let found = holder.into_iter().find(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter") && parameter_name(context, *part) == name);
                if let Some(parameter) = found {
                    return Some((parameter, None));
                }
            }
            kind if crate::java::types::scope::TYPE_DECLARATIONS.contains(&kind) => return None,
            _ => {}
        }
        inner = at;
        current = parent(at);
    }
    None
}

fn parameter_name<'f>(context: &'f Context, parameter: Node) -> &'f str {
    match parameter.child_by_field_name("name") {
        Some(name) => context.text(name),
        None => children(parameter).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name")).map_or("", |name| context.text(name)),
    }
}

fn local_constant(context: &Context, usage: Node) -> bool {
    let Some((statement, Some(declarator))) = declaration_of(context, usage) else { return false };
    let is_final = crate::java::helpers::has_modifier(statement, "final");
    let simple = statement.child_by_field_name("type").is_some_and(|written| {
        matches!(context.text(written), "int" | "long" | "short" | "byte" | "char" | "boolean" | "double" | "float" | "String" | "java.lang.String")
    });
    is_final && simple && declarator.child_by_field_name("value").is_some_and(|value| has_value(context, value))
}

fn annotated_identifier(context: &Context, usage: Node) -> bool {
    let Some((parameter, None)) = declaration_of(context, usage) else { return false };
    if !context.resolver.annotation_names(parameter).iter().any(|name| name == CONSTANT_ANNOTATION) {
        return false;
    }
    crate::java::helpers::has_modifier(parameter, "final") || !assigned_after(context, parameter, context.text(usage))
}

fn assigned_after(context: &Context, parameter: Node, name: &str) -> bool {
    let Some(owner) = crate::engine::source::ancestor(parameter, &["method_declaration", "constructor_declaration", "lambda_expression"]) else { return true };
    let mut found = false;
    walk(owner, |node| {
        let target = match node.kind() {
            "assignment_expression" => node.child_by_field_name("left"),
            "update_expression" => node.named_child(0),
            _ => None,
        };
        found |= target.is_some_and(|target| target.kind() == "identifier" && context.text(target) == name);
    });
    found
}

/// A final field with `@CompileTimeConstant`, written as its simple name or through its class.
fn annotated_field(context: &Context, expression: Node) -> bool {
    use crate::java::types::model::flag;
    let wanted = flag::COMPILE_TIME_CONSTANT | flag::FINAL;
    match expression.kind() {
        "identifier" => matches!(context.resolver.binding(expression, context.text(expression)), Some(Binding::Field(_, _, field)) if field.flags & wanted == wanted),
        "field_access" => {
            let (Some(object), Some(name)) = (expression.child_by_field_name("object"), expression.child_by_field_name("field")) else { return false };
            let Some(Receiver::Static(owner)) = context.resolver.receiver(object) else { return false };
            context.resolver.index.field(&owner, context.text(name)).is_some_and(|(_, field)| field.flags & wanted == wanted && field.flags & flag::STATIC != 0)
        }
        _ => false,
    }
}

/// The initializer of a field of a class written in this file.
fn instance_initializer<'t>(context: &Context<'t>, class: &str, field: &str) -> Option<Node<'t>> {
    let mut found = None;
    walk(context.file.tree.root_node(), |node| {
        if found.is_some() || context.resolver.scope.names.get(&node.id()).is_none_or(|name| name != class) {
            return;
        }
        for member in super::junit_init::members(node).into_iter().filter(|member| member.kind() == "field_declaration") {
            for declarator in children(member).into_iter().filter(|part| part.kind() == "variable_declarator") {
                if declarator.child_by_field_name("name").is_some_and(|name| context.text(name) == field) {
                    found = declarator.child_by_field_name("value");
                }
            }
        }
    });
    found
}
