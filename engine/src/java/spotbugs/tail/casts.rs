//! IDivResultCastToDouble rebuilt from what SpotBugs 4.9.8 reports on test code:
//! - ICAST_INT_CAST_TO_DOUBLE_PASSED_TO_CEIL: `Math.ceil` or `StrictMath.ceil` given an `int` or `long` value (an
//!   unboxed one too), converted on the way or by a `(double)` cast; priority 1.
//! - ICAST_INT_CAST_TO_FLOAT_PASSED_TO_ROUND: `Math.round(float)` or `StrictMath.round(float)` given an `int` or
//!   `long` value the same way; priority 2. A value javac folds to a constant has no conversion; neither has a
//!   value whose last instruction pushes a constant, such as `c ? x : 1`.
//! - ICAST_IDIV_CAST_TO_DOUBLE: an `int` or `long` division whose result javac converts to `float` or `double`
//!   right away: a cast, an assignment, an argument, a return, the other operand of an arithmetic or comparison,
//!   a branch of a `double` conditional or switch. Through `c ? a : x / y` only the last branch counts, as the
//!   conversion follows its instruction. A division handed on to `ceil` or `round` is reported as those; priority 2.
//!   A `final` local set from a constant expression is a constant too.
//! - Each pattern once per method, at its first place in the code.
use super::super::dumb::found::{Findings, Found};
use super::super::idioms::Compiled;
use super::super::taint::lines;
use super::super::{Context, place};
use super::in_order;
use crate::engine::source::{named_children, parent};
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub const DIVISION: &str = "ICAST_IDIV_CAST_TO_DOUBLE";
pub const CEIL: &str = "ICAST_INT_CAST_TO_DOUBLE_PASSED_TO_CEIL";
pub const ROUND: &str = "ICAST_INT_CAST_TO_FLOAT_PASSED_TO_ROUND";

const WHOLE: &[&str] = &["byte", "short", "char", "int", "long"];

fn primitive(kind: Option<Type>) -> Option<&'static str> {
    match kind?.unboxed_or_same() {
        Type::Primitive(name) => Some(name),
        _ => None,
    }
}

fn whole(context: &Context, node: Node) -> bool {
    primitive(context.resolver.type_of(node)).is_some_and(|name| WHOLE.contains(&name))
}

fn floating(kind: Option<Type>) -> bool {
    matches!(primitive(kind), Some("float" | "double"))
}

/// The node whose instruction javac writes last for an expression: the last branch of a conditional.
fn last(node: Node) -> Node {
    let node = unwrap(node);
    match node.kind() {
        "ternary_expression" => node.child_by_field_name("alternative").map_or(node, last),
        _ => node,
    }
}

fn constant(context: &Context, node: Node) -> bool {
    let node = unwrap(node);
    let parts = |names: &[&str]| names.iter().all(|name| node.child_by_field_name(name).is_some_and(|part| constant(context, part)));
    let folded = match node.kind() {
        "binary_expression" => parts(&["left", "right"]),
        "unary_expression" => parts(&["operand"]),
        "cast_expression" => parts(&["value"]) && node.child_by_field_name("type").is_some_and(|kind| matches!(kind.kind(), "integral_type" | "floating_point_type")),
        _ => false,
    };
    folded || context.resolver.constant_number(node).is_some() || constant_local(context, node) || matches!(node.kind(), "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" | "character_literal")
}

/// A `final` local set from a constant expression: a constant variable, which javac folds like a literal.
fn constant_local(context: &Context, node: Node) -> bool {
    if node.kind() != "identifier" {
        return false;
    }
    let Some(value) = super::super::dumb::numbers::values::local_value(context, node) else { return false };
    let declaration = crate::engine::source::ancestor(value, &["local_variable_declaration"]);
    declaration.is_some_and(|declaration| crate::java::helpers::has_modifier(declaration, "final")) && constant(context, value)
}

/// The `Math` or `StrictMath` method a call goes to, when it is `ceil(double)` or `round(float)`.
fn rounding(context: &Context, call: Node) -> Option<&'static str> {
    let name = context.text(call.child_by_field_name("name")?);
    let found = context.resolver.resolve_call(call)?;
    let math = matches!(found.declaring.as_str(), "java.lang.Math" | "java.lang.StrictMath") && found.method.is_static;
    match (name, found.method.parameters.as_slice()) {
        ("ceil", [Type::Primitive("double")]) if math => Some(CEIL),
        ("round", [Type::Primitive("float")]) if math => Some(ROUND),
        _ => None,
    }
}

fn argument(call: Node) -> Option<Node> {
    let list = call.child_by_field_name("arguments")?;
    match named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment")).collect::<Vec<_>>()[..] {
        [only] => Some(only),
        _ => None,
    }
}

/// The value converted on its way into `ceil` or `round`: the operand of a cast written there, or the argument.
fn converted<'a>(context: &Context, argument: Node<'a>, target: &str) -> Option<Node<'a>> {
    let argument = unwrap(argument);
    if argument.kind() == "cast_expression" {
        let kind = argument.child_by_field_name("type").map(|kind| context.text(kind))?;
        let value = argument.child_by_field_name("value")?;
        if kind == target {
            return whole(context, value).then_some(value);
        }
    }
    whole(context, argument).then_some(argument)
}

fn passed<'a>(context: &Context, call: Node<'a>) -> Option<(&'static str, Node<'a>)> {
    let pattern = rounding(context, call)?;
    let target = if pattern == CEIL { "double" } else { "float" };
    let value = converted(context, argument(call)?, target)?;
    (!constant(context, value) && !constant(context, last(value))).then_some((pattern, value))
}

/// The expression around a node that javac converts as a whole, through parentheses and conditionals of the same
/// whole type whose last branch it is.
fn carried<'a>(context: &Context, node: Node<'a>) -> (Node<'a>, Option<Node<'a>>) {
    let mut current = node;
    while let Some(up) = parent(current) {
        let last_branch = up.kind() == "ternary_expression" && up.child_by_field_name("alternative") == Some(current) && whole(context, up);
        if up.kind() == "parenthesized_expression" || last_branch {
            current = up;
            continue;
        }
        return (current, Some(up));
    }
    (current, None)
}

/// Whether javac converts the value of an expression to `float` or `double` right where it stands.
fn widened(context: &Context, current: Node, up: Node) -> bool {
    let side = |name: &str| up.child_by_field_name(name).filter(|side| *side != current);
    match up.kind() {
        "cast_expression" => matches!(up.child_by_field_name("type").map(|kind| context.text(kind)), Some("double" | "float")),
        "binary_expression" => {
            let operator = up.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default();
            let arithmetic = matches!(operator, "+" | "-" | "*" | "/" | "%" | "<" | "<=" | ">" | ">=" | "==" | "!=");
            arithmetic && side("left").or_else(|| side("right")).is_some_and(|other| floating(context.resolver.type_of(other)))
        }
        "assignment_expression" => {
            let operator = up.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default();
            up.child_by_field_name("right") == Some(current) && matches!(operator, "=" | "+=" | "-=" | "*=" | "/=" | "%=") && floating(up.child_by_field_name("left").and_then(|left| context.resolver.type_of(left)))
        }
        "ternary_expression" => up.child_by_field_name("condition") != Some(current) && floating(context.resolver.type_of(up)),
        "variable_declarator" | "return_statement" | "argument_list" | "array_initializer" | "lambda_expression" => {
            let declared_var = up.kind() == "variable_declarator" && parent(up).and_then(|declaration| declaration.child_by_field_name("type")).is_some_and(|kind| context.text(kind) == "var");
            !declared_var && floating(context.resolver.expected(current))
        }
        "expression_statement" | "yield_statement" => {
            let switch = crate::engine::source::ancestor(up, &["switch_expression"]);
            switch.is_some_and(|switch| floating(context.resolver.expected(switch).or_else(|| context.resolver.type_of(switch))))
        }
        _ => false,
    }
}

/// Whether the converted value goes straight into `ceil` or `round`, which report it themselves.
fn rounded(context: &Context, current: Node, up: Node) -> bool {
    let call = match up.kind() {
        "argument_list" => parent(up),
        "cast_expression" => parent(up).filter(|list| list.kind() == "argument_list").and_then(parent),
        _ => None,
    };
    call.filter(|call| call.kind() == "method_invocation").is_some_and(|call| rounding(context, call).is_some() && argument(call).is_some_and(|given| unwrap(given) == current || unwrap(given) == up))
}

fn divided(context: &Context, node: Node) -> bool {
    if node.kind() != "binary_expression" || node.child_by_field_name("operator").is_none_or(|operator| context.text(operator) != "/") {
        return false;
    }
    if !whole(context, node) || constant(context, node) {
        return false;
    }
    let (current, up) = carried(context, node);
    up.is_some_and(|up| widened(context, current, up) && !rounded(context, current, up))
}

pub fn check(context: &Context, methods: &[Compiled]) {
    if !context.wants(&[DIVISION, CEIL, ROUND]) {
        return;
    }
    for method in methods {
        let mut found = Findings::default();
        let label = &method.label;
        for node in in_order(&method.nodes) {
            let (pattern, line, priority) = if node.kind() == "method_invocation" {
                let Some((pattern, _)) = passed(context, node) else { continue };
                (pattern, lines::line(context, node), if pattern == CEIL { 1 } else { 2 })
            } else if divided(context, node) {
                (DIVISION, lines::after(context, node), 2)
            } else {
                continue;
            };
            let message = match pattern {
                DIVISION => format!("Integral division result cast to double or float in {label}"),
                CEIL => format!("Integral value cast to double and then passed to Math.ceil in {label}"),
                _ => format!("int value cast to float and then passed to Math.round in {label}"),
            };
            found.add(Found { pattern, node, line, priority, message, place: Some(place::function(label)), arguments: vec![label.clone()] });
        }
        found.report(context, label);
    }
}
