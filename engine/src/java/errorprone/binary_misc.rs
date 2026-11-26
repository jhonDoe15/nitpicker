//! BadShiftAmount, ComparingThisWithNull, EqualsNaN, DiscardedPostfixExpression, DeadThread and EqualsReference.
use super::Context;
use super::equals_methods::equals_declaration;
use super::fixes::Fix;
use super::positions::{arguments, preferred};
use crate::engine::source::{ancestor, children, named_children, parent, walk};
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::Type;
use tree_sitter::Node;

/// The value of an integer literal, with the minus sign javac's parser folds into a decimal one; `int` or `long`.
fn integer_value(context: &Context, node: Node) -> Option<(i64, bool)> {
    if node.kind() == "unary_expression" && node.child_by_field_name("operator").is_some_and(|sign| context.text(sign) == "-") {
        let operand = node.child_by_field_name("operand").filter(|operand| operand.kind() == "decimal_integer_literal")?;
        let (value, long) = integer_value(context, operand)?;
        return Some((value.wrapping_neg(), long));
    }
    if !matches!(node.kind(), "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal") {
        return None;
    }
    let text: String = context.text(node).chars().filter(|part| *part != '_').collect();
    let long = text.ends_with(['l', 'L']);
    let digits = text.trim_end_matches(['l', 'L']);
    let lower = digits.to_ascii_lowercase();
    let value = if let Some(hex) = lower.strip_prefix("0x") {
        u64::from_str_radix(hex, 16)
    } else if let Some(binary) = lower.strip_prefix("0b") {
        u64::from_str_radix(binary, 2)
    } else if lower.len() > 1 && lower.starts_with('0') {
        u64::from_str_radix(&lower[1..], 8)
    } else {
        lower.parse::<u64>()
    };
    value.ok().map(|value| (value as i64, long))
}

pub fn bad_shift_amount(context: &Context, node: Node) {
    if node.kind() != "binary_expression" {
        return;
    }
    let Some(operator) = node.child_by_field_name("operator").map(|operator| context.text(operator)) else { return };
    if !matches!(operator, "<<" | ">>" | ">>>") {
        return;
    }
    let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    let Some((value, _)) = integer_value(context, right) else { return };
    let amount = value as i32;
    if !(amount < 0 || amount > 31) || !matches!(context.resolver.type_of(left), Some(Type::Primitive("int" | "byte" | "short" | "char"))) {
        return;
    }
    let fix = if (32..=63).contains(&amount) {
        if integer_value(context, left).is_some_and(|(_, long)| !long) {
            Fix::new().insert(left.end_byte(), "L")
        } else {
            Fix::new().insert(node.start_byte(), "(long) ")
        }
    } else {
        Fix::replace(right.start_byte(), right.end_byte(), (amount & 0x1f).to_string())
    };
    context.report_fixed("BadShiftAmount", node, preferred(context, node), "Shift by an amount that is out of range", &[fix]);
}

pub fn comparing_this_with_null(context: &Context, node: Node) {
    if node.kind() != "binary_expression" {
        return;
    }
    let Some(operator) = node.child_by_field_name("operator").map(|operator| context.text(operator)) else { return };
    let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    let pair = (left.kind(), right.kind());
    if matches!(operator, "==" | "!=") && matches!(pair, ("this", "null_literal") | ("null_literal", "this")) {
        context.report_fixed("ComparingThisWithNull", node, preferred(context, node), "this == null is always false, this != null is always true", &[]);
    }
}

/// `Double` or `Float` when the expression names their `NaN` constant.
fn nan_owner(context: &Context, expression: Node) -> Option<&'static str> {
    let owner = match expression.kind() {
        "field_access" if expression.child_by_field_name("field").is_some_and(|field| context.text(field) == "NaN") => {
            let object = expression.child_by_field_name("object")?;
            let name = match context.resolver.receiver(object)? {
                Receiver::Static(name) => name,
                Receiver::Value(kind) => kind.name(),
            };
            context.resolver.index.field(&name, "NaN").map(|(info, _)| info.name.clone())?
        }
        "identifier" if context.text(expression) == "NaN" => imported_nan(context, expression)?,
        _ => return None,
    };
    match owner.as_str() {
        "java.lang.Double" => Some("Double"),
        "java.lang.Float" => Some("Float"),
        _ => None,
    }
}

fn imported_nan(context: &Context, identifier: Node) -> Option<String> {
    match context.resolver.binding(identifier, "NaN")? {
        Binding::Field(_, declaring, _) => Some(declaring.name.clone()),
        Binding::Local(_) => None,
    }
}

pub fn equals_nan(context: &Context, node: Node) {
    if node.kind() != "binary_expression" {
        return;
    }
    let Some(operator) = node.child_by_field_name("operator").map(|operator| context.text(operator)) else { return };
    let prefix = match operator {
        "==" => "",
        "!=" => "!",
        _ => return,
    };
    let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    let (owner, other) = match (nan_owner(context, left), nan_owner(context, right)) {
        (Some(owner), _) => (owner, right),
        (None, Some(owner)) => (owner, left),
        _ => return,
    };
    let fix = Fix::replace(node.start_byte(), node.end_byte(), format!("{prefix}{owner}.isNaN({})", context.text(other)));
    context.report_fixed("EqualsNaN", node, preferred(context, node), "== NaN always returns false; use the isNaN methods instead", &[fix]);
}

fn lambda_parameters(context: &Context, lambda: Node) -> Vec<String> {
    let name = |node: Node| context.text(node).to_string();
    let Some(list) = lambda.child_by_field_name("parameters") else { return Vec::new() };
    match list.kind() {
        "identifier" => vec![name(list)],
        "inferred_parameters" => children(list).into_iter().filter(|part| part.kind() == "identifier").map(name).collect(),
        _ => children(list).into_iter().filter(|part| part.kind() == "formal_parameter").filter_map(|part| part.child_by_field_name("name")).map(name).collect(),
    }
}

pub fn discarded_postfix_expression(context: &Context, node: Node) {
    if node.kind() != "update_expression" {
        return;
    }
    let parts = children(node);
    let (Some(first), Some(last)) = (parts.first(), parts.last()) else { return };
    let operator = context.text(*last);
    if first.kind() != "identifier" || !matches!(operator, "++" | "--") || parent(node).is_none_or(|lambda| lambda.kind() != "lambda_expression") {
        return;
    }
    let lambda = parent(node).unwrap_or(node);
    if lambda.child_by_field_name("body") != Some(node) || !lambda_parameters(context, lambda).iter().any(|name| name == context.text(*first)) {
        return;
    }
    let sign = if operator == "++" { "+" } else { "-" };
    let fix = Fix::replace(node.start_byte(), node.end_byte(), format!("{} {sign} 1", context.text(*first)));
    context.report_fixed("DiscardedPostfixExpression", node, preferred(context, node), "The result of this unary operation on a lambda parameter is discarded", &[fix]);
}

pub fn dead_thread(context: &Context, node: Node) {
    if node.kind() != "object_creation_expression" || parent(node).is_none_or(|statement| statement.kind() != "expression_statement") {
        return;
    }
    if children(node).iter().any(|part| part.kind() == "class_body") || node.child_by_field_name("type").is_none_or(|kind| !context.text(kind).ends_with("Thread")) {
        return;
    }
    if context.resolver.resolve_constructor(node).is_none_or(|created| created.declaring != "java.lang.Thread") {
        return;
    }
    let at = children(node).into_iter().find(|part| part.kind() == "new").map_or(node.start_byte(), |keyword| keyword.start_byte());
    let fix = Fix::new().insert(node.end_byte(), ".start()");
    context.report_fixed("DeadThread", node, at, "Thread created but not started", &[fix]);
}

const DECLARATIONS: [&str; 4] = ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration"];
const BODIES: [&str; 3] = ["class_body", "enum_body", "interface_body"];

fn is_parameter(argument: Node, text: &str, parameter: &str, method: Node) -> bool {
    argument.kind() == "identifier" && text == parameter && ancestor(argument, &["method_declaration", "constructor_declaration"]).is_some_and(|holder| holder.id() == method.id())
}

pub fn equals_reference(context: &Context, method: Node) {
    if method.kind() != "method_declaration" || !equals_declaration(context, method) {
        return;
    }
    let Some(body) = method.child_by_field_name("body") else { return };
    let Some(class) = ancestor(method, &DECLARATIONS) else { return };
    let Some(owner) = context.resolver.scope.names.get(&class.id()) else { return };
    let Some(own_body) = ancestor(method, &BODIES) else { return };
    let Some(parameter) = method.child_by_field_name("parameters").and_then(|list| named_children(list).into_iter().find(|part| part.kind() == "formal_parameter")).and_then(|part| part.child_by_field_name("name")) else { return };
    let parameter = context.text(parameter);
    let mut found = false;
    walk(body, |call| {
        if found || call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|name| context.text(name) != "equals") {
            return;
        }
        let [argument] = arguments(call)[..] else { return };
        if !is_parameter(argument, context.text(argument), parameter, method) {
            return;
        }
        let receiver = call.child_by_field_name("object");
        if receiver.is_some_and(|object| object.kind() != "this") {
            return;
        }
        if receiver.is_some() && ancestor(call, &BODIES).is_none_or(|inner| inner.id() != own_body.id()) {
            return;
        }
        let same = context.resolver.resolve_call(call).is_some_and(|resolved| resolved.declaring == *owner && !resolved.method.is_static && resolved.method.parameters == [Type::class("java.lang.Object")]);
        found = same;
    });
    if found {
        let at = method.child_by_field_name("name").map_or(method.start_byte(), |name| name.start_byte());
        let message = "== must be used in equals method to check equality to itself or an infinite loop will occur.";
        context.report_fixed("EqualsReference", method, at, message, &[]);
    }
}
