//! FindNonShortCircuit rebuilt from what SpotBugs 4.9.8 reports on test code. SpotBugs reads the bytecode javac
//! writes, so `stream` walks each method in that order, constructors with the field initializers and initializer
//! blocks, static initializers with the static ones. Between jumps that reset it (a `goto` javac writes for an
//! `else`, the end of a loop, `break`, `continue`, `switch`, `try`, `synchronized` and a ternary whose first value is
//! not `0`, `1` or a boolean javac materializes), the code splits into windows, each closed by a boolean javac
//! materializes (a comparison, `!`, `&&` or `||` used as a value, `c ? true : false`, `x == null ? 1 : …`, a switch
//! of `true` and `false`) or by a call returning `boolean`. A window notes a call (any but `String.length()`,
//! constructors included), a null test, and an array read or an integer `/` or `%`.
//!
//! A boolean `&` is judged when the next instruction is a test (a condition, the operand of `!`, `&&` or `||`, a
//! branch of a tested ternary or switch), a `return` of a `boolean` or a store into a `boolean` field (`&=` too); a
//! `|` only before a test. The value right before it decides (the right side, or the right side of the `&`, `|` or
//! `^` the right side is): a local or a constant is never reported, nor, after such an operator, a value that does
//! not close a window. S is the last window closed and P the one before. With a null test in an earlier window not
//! closed by a call, and a call or array read in S or P closed by a call: NS_NON_SHORT_CIRCUIT priority 1; else with
//! a call in S or P closed by a call: NS_DANGEROUS_NON_SHORT_CIRCUIT priority 1; else with an array read in S:
//! NS_NON_SHORT_CIRCUIT priority 2; else priority 3. Each pattern once per method, the first of the best priority;
//! the line is that of the instruction after the operator.
mod shapes;
mod stream;

use super::dumb::found::{Found, Findings};
use super::dumb::numbers::stores::local;
use super::idioms::{compiled, delegates, initializes};
use super::taint::lines;
use super::{Context, fields};
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
use crate::java::types::scope::TYPE_DECLARATIONS;
use stream::{Reached, Stream};
use tree_sitter::Node;

pub const QUESTIONABLE: &str = "NS_NON_SHORT_CIRCUIT";
pub const DANGEROUS: &str = "NS_DANGEROUS_NON_SHORT_CIRCUIT";
pub const PATTERNS: &[&str] = &[QUESTIONABLE, DANGEROUS];

/// The node an `&` or `|` hands its value to, past parentheses.
fn user(node: Node) -> Option<(Node, Node)> {
    let mut child = node;
    let mut above = parent(node)?;
    while above.kind() == "parenthesized_expression" {
        child = above;
        above = parent(above)?;
    }
    Some((above, child))
}

const CONDITIONS: &[&str] = &["if_statement", "while_statement", "do_statement", "for_statement", "assert_statement"];

fn boolean(context: &Context, node: Node) -> bool {
    matches!(context.resolver.type_of(node), Some(Type::Primitive("boolean")))
}

fn boolean_field(context: &Context, target: Node) -> bool {
    fields::field_key(context, unwrap(target)).is_some() && boolean(context, target)
}

/// Whether javac tests the value of an expression next: a condition, the operand of `!`, `&&` or `||`, or a branch of
/// a conditional or a switch whose value is tested.
fn tested(context: &Context, node: Node) -> bool {
    let Some((above, child)) = user(node) else { return false };
    let operator = above.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default();
    match above.kind() {
        kind if CONDITIONS.contains(&kind) => above.child_by_field_name("condition").is_none_or(|test| test == child),
        "ternary_expression" if above.child_by_field_name("condition") == Some(child) => true,
        "ternary_expression" => tested(context, above),
        "expression_statement" => parent(above).filter(|rule| rule.kind() == "switch_rule").and_then(parent).and_then(parent).is_some_and(|switch| switch.kind() == "switch_expression" && tested(context, switch)),
        "unary_expression" => operator == "!",
        "binary_expression" => matches!(operator, "&&" | "||"),
        _ => false,
    }
}

/// Whether javac writes a test, a `boolean` return or a `boolean` field store right after the operator.
fn judged(context: &Context, op: Node) -> bool {
    if op.kind() == "assignment_expression" {
        return op.child_by_field_name("left").is_some_and(|left| boolean_field(context, left));
    }
    if tested(context, op) {
        return true;
    }
    if context.text(op.child_by_field_name("operator").unwrap_or(op)) != "&" {
        return false;
    }
    let Some((above, child)) = user(op) else { return false };
    let operator = above.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default();
    match above.kind() {
        "return_statement" | "lambda_expression" => matches!(context.resolver.returned_type(op), Some(Type::Primitive("boolean"))),
        "assignment_expression" => operator == "=" && above.child_by_field_name("right") == Some(child) && above.child_by_field_name("left").is_some_and(|left| boolean_field(context, left)),
        "variable_declarator" => parent(above).is_some_and(|holder| holder.kind() == "field_declaration"),
        _ => false,
    }
}

fn logical(context: &Context, node: Node) -> bool {
    node.kind() == "binary_expression" && matches!(context.text(node.child_by_field_name("operator").unwrap_or(node)), "&" | "|" | "^")
}

/// The value whose last instruction comes right before the operator: the right side, or the right side of the
/// `&`, `|` or `^` it is.
fn last<'t>(context: &Context, right: Node<'t>) -> Node<'t> {
    let right = unwrap(right);
    match right.child_by_field_name("right") {
        Some(inner) if logical(context, right) => last(context, inner),
        _ => right,
    }
}

/// Whether the right side leaves a value SpotBugs does not judge: a local or a constant.
fn silent(context: &Context, right: Node) -> bool {
    let judged = match right.kind() {
        "identifier" => !local(context, right),
        "field_access" | "instanceof_expression" | "array_access" | "method_invocation" => true,
        _ => false,
    };
    !(judged || strong(context, right))
}

/// Whether the right side ends by closing a window itself.
fn strong(context: &Context, right: Node) -> bool {
    let operator = right.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default();
    match right.kind() {
        "binary_expression" => !logical(context, right),
        "unary_expression" => operator == "!",
        "method_invocation" => boolean(context, right),
        "ternary_expression" => right.child_by_field_name("consequence").is_some_and(|value| shapes::constant_branch(context, value)),
        "switch_expression" => shapes::constant_switch(context, right),
        _ => context.resolver.type_of(right).is_some_and(|kind| kind.erased().name() == "java.lang.Boolean"),
    }
}

/// The line of the instruction after the operator: javac starts the line of a `return` again before returning.
fn line(context: &Context, op: Node) -> usize {
    match user(op) {
        Some((above, _)) if above.kind() == "return_statement" => context.line(above),
        _ => lines::after(context, op),
    }
}

fn judge(context: &Context, reached: &Reached) -> Option<(&'static str, u8)> {
    let written = unwrap(reached.op.child_by_field_name("right")?);
    let right = last(context, written);
    let nested = reached.op.child_by_field_name("left").map(unwrap).is_some_and(|left| logical(context, left)) || logical(context, written);
    if silent(context, right) || (nested && !strong(context, right)) {
        return None;
    }
    let now = reached.now?;
    let null_before = reached.null_before;
    let called_before = reached.before.is_some_and(|window| window.by_call);
    Some(if null_before && (now.call || now.array || called_before) {
        (QUESTIONABLE, 1)
    } else if now.call || called_before {
        (DANGEROUS, 1)
    } else if now.array {
        (QUESTIONABLE, 2)
    } else {
        (QUESTIONABLE, 3)
    })
}

/// The code javac writes into a method, in order: a constructor runs the field initializers and initializer blocks
/// after `super(...)`, unless it starts with `this(...)`; the static initializer runs the static ones.
fn code<'t>(class: Node<'t>, member: Node<'t>, statics: bool) -> Vec<Node<'t>> {
    let interface = matches!(class.kind(), "interface_declaration" | "annotation_type_declaration");
    let initializers = || {
        let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"));
        body.map(super::place::members).unwrap_or_default().into_iter().filter(|part| initializes(*part, interface, statics)).collect::<Vec<_>>()
    };
    match member.kind() {
        "method_declaration" | "lambda_expression" => member.child_by_field_name("body").into_iter().collect(),
        "constructor_declaration" | "compact_constructor_declaration" => {
            let Some(body) = member.child_by_field_name("body") else { return Vec::new() };
            let mut parts = named_children(body);
            let mut out: Vec<Node> = Vec::new();
            if parts.first().is_some_and(|first| first.kind() == "explicit_constructor_invocation") {
                out.push(parts.remove(0));
            }
            if !delegates(member) {
                out.extend(initializers());
            }
            out.extend(parts);
            out
        }
        _ => initializers(),
    }
}

pub fn circuits<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(PATTERNS) {
        return;
    }
    let declared = TYPE_DECLARATIONS.contains(&class.kind()) || matches!(class.kind(), "object_creation_expression" | "enum_constant");
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned().filter(|_| declared) else { return };
    let mut any = false;
    walk(class, |node| any |= matches!(node.kind(), "binary_expression" | "assignment_expression") && matches!(node.child_by_field_name("operator").map(|operator| context.text(operator)), Some("&" | "|" | "&=")));
    if !any {
        return;
    }
    for method in compiled(context, &own, class) {
        let statics = method.label.contains(".<static initializer for ");
        let mut stream = Stream::new(context);
        for part in code(class, method.member, statics) {
            if part.kind() == "block" {
                named_children(part).into_iter().for_each(|statement| stream.walk(statement, false));
            } else {
                stream.walk(part, false);
            }
        }
        let mut findings = Findings::default();
        for reached in stream.reached.iter().filter(|reached| judged(context, reached.op)) {
            let Some((pattern, priority)) = judge(context, reached) else { continue };
            let message = if pattern == DANGEROUS { "Potentially dangerous use of non-short-circuit logic" } else { "Questionable use of non-short-circuit logic" };
            findings.add(Found {
                pattern,
                node: reached.op,
                line: line(context, reached.op),
                priority,
                message: format!("{message} in {}", method.label),
                place: None,
                arguments: vec![method.label.clone()],
            });
        }
        findings.report(context, &method.label);
    }
}
