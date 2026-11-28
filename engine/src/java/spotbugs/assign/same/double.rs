//! SA_FIELD_DOUBLE_ASSIGNMENT (FindSelfComparison), measured: a store into an instance field of the same object
//! (`this`, the same value of a variable, the same field read again) at most 9 bytes of code after another store
//! into that field ends (`f = a; f = b;`, `f = f = a`, `x = (x = 3) + 1`, `f = f++`, `f++; f = a`, `int v = f++;
//! f = v`, a field initializer then the constructor), on the same line or the next and not one before it, unless
//! the first stores a default value (`null`, `0`), with no jump in between (a `try` body runs on
//! into its `finally` copy, a `synchronized` body follows its lock), no other store into an instance field and no
//! read of that field; stores into static fields count for nothing. The priority is 1 when the class declares another field of the same type
//! (not static, not final; the first one is the place SpotBugs names, else the field), else 2; one more when both
//! stores store the same value: the same variable value or field, the same constant, the result of the same
//! method, the same cast, or two values nothing is known about. Reported at priority 2 or less, once per method,
//! field and priority, on the line of the second store.
use super::super::super::{Context, names, place};
use super::super::flow::values::Val;
use super::super::flow::{Put, Walk};
use super::Found;
use super::super::super::idioms::Compiled;
use crate::engine::source::{named_children, walk};
use crate::java::types::expr::unwrap;
use crate::java::types::model::flag;
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

pub const DOUBLE: &str = "SA_FIELD_DOUBLE_ASSIGNMENT";
const WINDOW: usize = 9;
const BLOCKS: &[&str] = &["block", "constructor_body", "switch_block_statement_group"];

/// The code of a block in order: statements, values with the bytes javac writes after them, and jumps.
enum Step<'a> {
    Statement(Node<'a>),
    Value(Node<'a>, usize),
    Jump,
}

/// Blocks, `try` and `synchronized` laid out as javac writes them: a `try` body then its `finally` copy (a
/// `catch` jumps), a lock then `dup`, `astore` and `monitorenter`; both end with a jump. A constructor that does
/// not call `this(...)` runs the field initializers and initializer blocks after its `super(...)`.
fn steps<'a>(node: Node<'a>, initializers: &[Node<'a>], out: &mut Vec<Step<'a>>) {
    let body = |out: &mut Vec<Step<'a>>| {
        if let Some(block) = node.child_by_field_name("body") {
            steps(block, initializers, out);
        }
    };
    match node.kind() {
        "constructor_body" => {
            let mut parts = named_children(node).into_iter().peekable();
            let delegation = parts.next_if(|part| part.kind() == "explicit_constructor_invocation");
            out.extend(delegation.map(Step::Statement));
            if !delegation.is_some_and(|call| call.child_by_field_name("constructor").is_some_and(|called| called.kind() == "this")) {
                for initializer in initializers {
                    match initializer.kind() {
                        "field_declaration" => out.extend(crate::java::helpers::declarators(*initializer).into_iter().filter(|part| part.child_by_field_name("value").is_some()).map(Step::Statement)),
                        _ => steps(*initializer, initializers, out),
                    }
                }
            }
            parts.for_each(|part| steps(part, initializers, out));
        }
        "block" | "switch_block_statement_group" => named_children(node).into_iter().for_each(|part| steps(part, initializers, out)),
        "switch_label" | "line_comment" | "block_comment" => {}
        "try_statement" => {
            body(out);
            let parts = named_children(node);
            if !parts.iter().any(|part| part.kind() == "catch_clause") {
                parts.iter().filter(|part| part.kind() == "finally_clause").flat_map(|part| named_children(*part)).for_each(|part| steps(part, initializers, out));
            }
            out.push(Step::Jump);
        }
        "synchronized_statement" => {
            match named_children(node).into_iter().find(|part| part.kind() == "parenthesized_expression") {
                Some(lock) => out.push(Step::Value(lock, 3)),
                None => out.push(Step::Jump),
            }
            body(out);
            out.push(Step::Jump);
        }
        _ => out.push(Step::Statement(node)),
    }
}

/// An instance field: stores into static fields count for nothing here.
fn instance(context: &Context, (declaring, name): &(String, String)) -> bool {
    let field = context.resolver.index.get(declaring).and_then(|info| info.fields.iter().find(|field| &field.name == name).map(|field| field.flags));
    field.is_some_and(|flags| flags & flag::STATIC == 0)
}

/// What FindSelfComparison knows about a stored value.
#[derive(PartialEq)]
enum Item {
    Constant(String),
    Value(Val),
    Returned(String),
    Cast(String, String),
    Unknown,
}

fn item(context: &Context, node: Node, value: &Val) -> Item {
    let node = unwrap(node);
    match node.kind() {
        kind if kind.ends_with("_literal") || matches!(kind, "true" | "false") => Item::Constant(context.text(node).to_string()),
        "unary_expression" if node.child_by_field_name("operand").is_some_and(|operand| operand.kind().ends_with("integer_literal")) => Item::Constant(context.text(node).replace(' ', "")),
        "identifier" | "field_access" | "this" => Item::Value(value.clone()),
        "method_invocation" => match context.resolver.resolve_call(node) {
            Some(call) => Item::Returned(format!("{}.{}{:?}", call.declaring, call.method.name, call.method.parameters)),
            None => Item::Unknown,
        },
        "cast_expression" => Item::Cast(node.child_by_field_name("type").map_or("", |kind| context.text(kind)).to_string(), node.child_by_field_name("value").map_or("", |value| context.text(value)).to_string()),
        _ => Item::Unknown,
    }
}

/// The plain store into a field a statement ends with.
fn store<'a, 'p>(statement: Node<'a>, puts: &'p HashMap<usize, &'p Put<'a>>) -> Option<&'p Put<'a>> {
    let expression = unwrap(statement.named_child(0).filter(|_| statement.kind() == "expression_statement")?);
    puts.get(&expression.id()).copied().filter(|put| put.at.kind() == "assignment_expression")
}

/// The store into a field a statement ends with, also an increment, a field initializer or the value of the one
/// local a declaration declares (with that local, whose store follows); none for a default value (`null`, `0`).
fn first_store<'a, 'p>(context: &Context, statement: Node<'a>, puts: &'p HashMap<usize, &'p Put<'a>>) -> Option<(&'p Put<'a>, Option<Node<'a>>)> {
    let (expression, local) = match statement.kind() {
        "expression_statement" => (unwrap(statement.named_child(0)?), None),
        "variable_declarator" => (statement, None),
        "local_variable_declaration" => match &crate::java::helpers::declarators(statement)[..] {
            [only] => (unwrap(only.child_by_field_name("value")?), Some(*only)),
            _ => return None,
        },
        _ => return None,
    };
    let put = puts.get(&expression.id()).copied()?;
    (!stored_value(put.at).is_some_and(|value| default_value(context, value))).then_some((put, local))
}

/// The line javac gives a store: a field initializer's is the line of its name.
fn stored_line(context: &Context, at: Node) -> usize {
    if at.kind() == "variable_declarator" { context.line(at) } else { super::line(context, at) }
}

/// The value a store stores, unless it is an increment.
fn stored_value(at: Node) -> Option<Node> {
    at.child_by_field_name("right").or_else(|| at.child_by_field_name("value"))
}

/// A literal javac writes as `aconst_null` or a zero constant.
fn default_value(context: &Context, value: Node) -> bool {
    let value = unwrap(value);
    let text = context.text(value).replace('_', "").to_ascii_lowercase();
    match value.kind() {
        "null_literal" | "false" => true,
        "character_literal" => matches!(text.as_str(), "'\\0'" | "'\\u0000'"),
        "decimal_floating_point_literal" => text.trim_end_matches(['f', 'd']).parse::<f64>().is_ok_and(|number| number == 0.0),
        kind if kind.ends_with("integer_literal") => {
            let digits = text.trim_end_matches('l');
            let digits = digits.strip_prefix("0x").or_else(|| digits.strip_prefix("0b")).unwrap_or(digits);
            !digits.is_empty() && digits.trim_start_matches('0').is_empty()
        }
        _ => false,
    }
}

/// Code javac writes a jump for, or a store into an instance field.
fn interrupts(context: &Context, node: Node) -> bool {
    let mut found = false;
    walk(node, |part| {
        let operator = part.child_by_field_name("operator").map(|operator| context.text(operator));
        found |= match part.kind() {
            "ternary_expression" | "switch_expression" | "lambda_expression" | "instanceof_expression" => true,
            "binary_expression" => matches!(operator, Some("&&" | "||" | "==" | "!=" | "<" | "<=" | ">" | ">=")),
            "unary_expression" => operator == Some("!"),
            "assignment_expression" => part.child_by_field_name("left").is_some_and(|left| stores(context, left)),
            "update_expression" => part.named_child(0).is_some_and(|target| stores(context, target)),
            _ => false,
        };
    });
    found
}

/// Whether a store into the target writes a `putfield`: a store into an array or an unknown field counts.
fn stores(context: &Context, target: Node) -> bool {
    let target = unwrap(target);
    match super::super::super::fields::field_key(context, target) {
        Some(field) => instance(context, &field),
        None => target.kind() != "identifier",
    }
}

fn reads(context: &Context, node: Node, field: &(String, String)) -> bool {
    let mut found = false;
    walk(node, |part| found |= matches!(part.kind(), "identifier" | "field_access") && super::super::super::fields::field_key(context, part).as_ref() == Some(field));
    found
}

fn plain(context: &Context, statement: Node) -> bool {
    matches!(statement.kind(), "expression_statement" | "local_variable_declaration" | ";") && !interrupts(context, statement)
}

/// The first field of the class that is not static or final, of the same type as the stored field.
fn candidate(context: &Context, own: &str, (declaring, name): &(String, String)) -> Option<String> {
    let kind = context.resolver.index.get(declaring)?.fields.iter().find(|field| &field.name == name)?.kind.clone();
    let info = context.resolver.index.get(own)?;
    let found = info.fields.iter().find(|field| &field.name != name && field.flags & (flag::STATIC | flag::FINAL) == 0 && field.kind == kind);
    found.map(|field| field.name.clone())
}

/// The second store of each pair, with whether both store the same value.
fn pairs<'a>(context: &Context<'a>, method: &Compiled<'a>, initializers: &[Node<'a>], walk: &Walk<'_, 'a>) -> Vec<(Node<'a>, bool, (String, String), String)> {
    let puts: HashMap<usize, &Put> = walk.puts.iter().filter(|put| instance(context, &put.field)).map(|put| (put.at.id(), put)).collect();
    let mut out = Vec::new();
    for put in walk.puts.iter().filter(|put| instance(context, &put.field)) {
        let inner = put.at.child_by_field_name("right").map(unwrap);
        let mut chained = false;
        if let Some(inner) = inner {
            crate::engine::source::walk(inner, |part| chained |= puts.get(&part.id()).is_some_and(|other| other.at.kind() == "assignment_expression" && other.field == put.field && other.receiver == put.receiver));
        }
        let bumped = inner.filter(|inner| inner.kind() == "update_expression").and_then(|inner| inner.named_child(0)).is_some_and(|target| {
            let key = super::super::super::fields::field_key(context, target);
            let object = |node: Node| node.child_by_field_name("object").map(|object| context.text(object).to_string()).unwrap_or_default();
            key.as_ref() == Some(&put.field) && object(unwrap(target)) == put.at.child_by_field_name("left").map(|left| object(unwrap(left))).unwrap_or_default()
        });
        if chained || bumped {
            out.push((put.at, false, put.field.clone(), put.qualifying.clone()));
        }
    }
    for block in method.nodes.iter().copied().filter(|node| BLOCKS.contains(&node.kind())) {
        let mut parts = Vec::new();
        steps(block, initializers, &mut parts);
        let statement = |step: &Step<'a>| if let Step::Statement(node) = step { Some(*node) } else { None };
        for (at, step) in parts.iter().enumerate() {
            let Some((first, local)) = statement(step).and_then(|node| first_store(context, node, &puts)) else { continue };
            let mut between = Vec::new();
            for later in &parts[at + 1..] {
                let (node, after) = match later {
                    Step::Statement(node) => (*node, None),
                    Step::Value(node, after) => (*node, Some(*after)),
                    Step::Jump => break,
                };
                if let Some(second) = store(node, &puts).filter(|second| second.field == first.field && second.receiver == first.receiver) {
                    let value = second.at.child_by_field_name("right");
                    let clean = value.is_some_and(|value| !interrupts(context, value) && !reads(context, value, &first.field));
                    let lines = super::line(context, second.at).checked_sub(stored_line(context, first.at));
                    if clean && lines.is_some_and(|lines| lines <= 1) && super::super::super::catches::store_gap(context, local, &between, second.at) <= WINDOW {
                        let values = (stored_value(first.at), value);
                        let same = matches!(values, (Some(one), Some(two)) if item(context, one, &first.value) == item(context, two, &second.value));
                        out.push((second.at, same, second.field.clone(), second.qualifying.clone()));
                    }
                    break;
                }
                let passes = if after.is_some() { !interrupts(context, node) } else { plain(context, node) };
                if !passes || reads(context, node, &first.field) {
                    break;
                }
                between.push((node, after));
            }
        }
    }
    out
}

pub fn check<'a>(context: &Context<'a>, own: &str, class: Node<'a>, method: &Compiled<'a>, walk: &Walk<'_, 'a>) -> Vec<(Node<'a>, Found)> {
    let mut seen = HashSet::new();
    let mut out = Vec::new();
    let mut found = pairs(context, method, &super::super::initializers(class, false), walk);
    found.sort_by_key(|(node, ..)| node.start_byte());
    for (node, same, field, qualifying) in found {
        let named = candidate(context, own, &field);
        let priority = 1 + u8::from(named.is_none()) + u8::from(same);
        if priority > 2 || !seen.insert((field.clone(), priority)) {
            continue;
        }
        let label = &method.label;
        let shown = names::field(context, own, &qualifying, &field.1);
        let place = match &named {
            Some(other) => format!("{}@{}", place::member(context, own, other), names::field(context, own, own, other)),
            None => format!("{}@{shown}", place::member(context, own, &field.1)),
        };
        let message = format!("Double assignment of field {shown} in {label}");
        let line = super::line(context, node);
        out.push((node, Found { pattern: DOUBLE, line, message, place, priority, arguments: vec![shown, label.clone()] }));
    }
    out
}
