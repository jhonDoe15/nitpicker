//! `exhaustive-union-predicate`: a boolean result computed by comparing a value with only some members of its
//! union, so a member added later is silently classified as the default.
use super::union_forms::{Comparison, Literal, is_plain_reference, literal_value, membership_comparisons, switch_comparisons};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use std::cell::RefCell;

const RULE: &str = "exhaustive-union-predicate";
const MESSAGE: &str = "These comparisons list only some members of {union}, so a member added later is silently classified as the default. Classify every member with a `switch` that has no `default`, or a `Record<Union, boolean>` lookup, so adding a member fails to compile.";
const MINIMUM_MEMBERS: usize = 3;

fn comparison_for(operator: &str) -> Option<&'static str> {
    match operator {
        "||" => Some("==="),
        "&&" => Some("!=="),
        _ => None,
    }
}

fn operator_of(node: Node) -> String {
    node.text("operator").map(|operator| operator.into_owned()).unwrap_or_default()
}

fn comparison_of<'v>(node: Node<'v>, operator: &str) -> Option<Comparison<'v>> {
    if !node.is("BinaryExpression") || operator_of(node) != operator {
        return None;
    }
    let (left, right) = (node.node("left")?, node.node("right")?);
    let (subject, literal) = if literal_value(right).is_some() { (left, right) } else { (right, left) };
    let value = literal_value(literal)?;
    is_plain_reference(subject).then_some(Comparison { subject, value })
}

fn operand_comparisons<'v>(node: Node<'v>, logical: &str) -> Option<Vec<Comparison<'v>>> {
    if let Some(comparison) = comparison_of(node, comparison_for(logical).unwrap_or_default()) {
        return Some(vec![comparison]);
    }
    let negated = if node.is("UnaryExpression") && operator_of(node) == "!" { node.node("argument") } else { None };
    if logical == "||" {
        return if negated.is_none() { membership_comparisons(node) } else { None };
    }
    negated.and_then(membership_comparisons)
}

fn is_chain_operand(call: Node) -> bool {
    let Some(parent) = call.parent() else { return false };
    let negated = parent.is("UnaryExpression") && operator_of(parent) == "!";
    let operand = if negated { parent } else { call };
    operand.parent().is_some_and(|above| above.is("LogicalExpression") && operator_of(above) == if negated { "&&" } else { "||" })
}

fn is_value_slot(parent: Node, node: Node) -> bool {
    match parent.kind() {
        "ArrowFunctionExpression" => parent.node("body") == Some(node),
        "ReturnStatement" => true,
        "VariableDeclarator" => parent.node("init") == Some(node),
        "AssignmentExpression" => parent.node("right") == Some(node),
        _ => false,
    }
}

fn is_wrapping_value(parent: Node, node: Node) -> bool {
    match parent.kind() {
        "ConditionalExpression" => parent.node("test") != Some(node),
        "LogicalExpression" => true,
        "UnaryExpression" => operator_of(parent) == "!",
        _ => false,
    }
}

fn is_predicate_value(node: Node) -> bool {
    let mut current = node;
    while let Some(parent) = current.parent() {
        if !is_wrapping_value(parent, current) {
            return is_value_slot(parent, current);
        }
        current = parent;
    }
    false
}

fn returns_type_predicate(node: Node) -> bool {
    let owner = node.ancestors().find(|ancestor| matches!(ancestor.kind(), "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression"));
    owner.and_then(|owner| owner.node("returnType")).and_then(|annotation| annotation.node("typeAnnotation")).is_some_and(|annotation| annotation.is("TSTypePredicate"))
}

fn logical_operands<'v>(node: Node<'v>, operator: &str) -> Vec<Node<'v>> {
    let mut operands = Vec::new();
    let mut pending = vec![node];
    while let Some(part) = pending.pop() {
        if part.is("LogicalExpression") && operator_of(part) == operator {
            pending.extend(part.node("left"));
            pending.extend(part.node("right"));
        } else {
            operands.push(part);
        }
    }
    operands.sort_by_key(|operand| operand.start());
    operands
}

fn chain_comparisons(node: Node) -> Option<Vec<Comparison>> {
    let operator = operator_of(node);
    let continues_chain = node.parent().is_some_and(|parent| parent.is("LogicalExpression") && operator_of(parent) == operator);
    if comparison_for(&operator).is_none() || continues_chain || !is_predicate_value(node) || returns_type_predicate(node) {
        return None;
    }
    let operands: Option<Vec<Vec<Comparison>>> = logical_operands(node, &operator).into_iter().map(|operand| operand_comparisons(operand, &operator)).collect();
    Some(operands?.into_iter().flatten().collect())
}

fn call_comparisons(node: Node) -> Option<Vec<Comparison>> {
    let comparisons = membership_comparisons(node)?;
    (!is_chain_operand(node) && is_predicate_value(node) && !returns_type_predicate(node)).then_some(comparisons)
}

fn shared_subject<'v>(text: &str, comparisons: &[Comparison<'v>]) -> Option<Node<'v>> {
    let first = comparisons.first()?.subject;
    let source = |node: Node| &text[node.start() as usize..node.end() as usize];
    comparisons.iter().all(|comparison| source(comparison.subject) == source(first)).then_some(first)
}

fn partial_union(types: &RefCell<Types>, text: &str, comparisons: &[Comparison]) -> Option<String> {
    let subject = shared_subject(text, comparisons)?;
    let mut types = types.borrow_mut();
    let Some((kind, members)) = types.literal_members(subject.start(), subject.end()) else {
        types.refuse("no type for a compared value");
        return None;
    };
    let mut compared: Vec<&Literal> = Vec::new();
    for comparison in comparisons {
        if !compared.contains(&&comparison.value) {
            compared.push(&comparison.value);
        }
    }
    let is_subset = members.len() >= MINIMUM_MEMBERS && compared.len() < members.len() && compared.iter().all(|value| members.contains(value));
    if !is_subset {
        return None;
    }
    let alias = types.alias_of_value(&kind, subject.start(), subject.end());
    let in_project = types.is_written_in_project(alias.as_ref(), subject.start(), subject.end());
    let narrows = subject.is("MemberExpression") && subject.node("object").is_some_and(|object| types.is_union_at(object.start(), object.end()).unwrap_or(false));
    if !in_project || narrows {
        return None;
    }
    Some(alias.map_or_else(|| "the union".to_string(), |alias| format!("`{}`", alias.name)))
}

pub fn check(context: &mut Context) {
    let (Some((view, _)), Some(types)) = (context.estree, context.types) else { return };
    let text = context.file.slice(0, context.file.text.len() as u32);
    let mut found = Vec::new();
    for node in view.nodes() {
        let comparisons = match node.kind() {
            "LogicalExpression" => chain_comparisons(node),
            "CallExpression" => call_comparisons(node),
            "SwitchStatement" if !returns_type_predicate(node) => switch_comparisons(node),
            _ => None,
        };
        let Some(comparisons) = comparisons else { continue };
        let union = partial_union(types, text, &comparisons);
        if types.borrow().refused.is_some() {
            return;
        }
        if let Some(union) = union {
            found.push((node.start(), node.end(), MESSAGE.replace("{union}", &union)));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
