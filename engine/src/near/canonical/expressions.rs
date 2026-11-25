use super::effects::is_pure;
use super::library::{as_reference, collapsed_negation, library_match, same_reference};
use crate::near::keys::{KeyMode, key_of};
use crate::near::tree::{Node, Tree, compare_text, make, with_children};
use std::cmp::Ordering;
use std::rc::Rc;

fn is_logical(value: Option<&str>) -> bool {
    matches!(value, Some("&&" | "||"))
}

fn is_bitwise(value: Option<&str>) -> bool {
    matches!(value, Some("&" | "|" | "^"))
}

fn shape_order(mode: &KeyMode, left: &Node, right: &Node) -> Ordering {
    compare_text(&key_of(left, mode), &key_of(right, mode))
}

fn same_operator(node: &Node, current: &Node) -> bool {
    current.is("binary") && current.value == node.value
}

fn collect_operands(node: &Node, current: &Tree, operands: &mut Vec<Tree>) {
    if same_operator(node, current) {
        for child in &current.children {
            collect_operands(node, child, operands);
        }
    } else {
        operands.push(current.clone());
    }
}

fn chain(node: &Tree, sortable: bool, mode: &KeyMode) -> Tree {
    let mut operands = Vec::new();
    collect_operands(node, node, &mut operands);
    if sortable && operands.iter().all(|operand| is_pure(operand)) {
        let keys: Vec<String> = operands.iter().map(|operand| key_of(operand, mode)).collect();
        let mut order: Vec<usize> = (0..operands.len()).collect();
        order.sort_by(|left, right| compare_text(&keys[*left], &keys[*right]));
        operands = order.into_iter().map(|index| operands[index].clone()).collect();
    }
    operands
        .into_iter()
        .reduce(|left, right| {
            let mut joined = make("binary", vec![left, right]);
            joined.value = node.value.clone();
            joined.commutes = node.commutes;
            Rc::new(joined)
        })
        .expect("operands")
}

fn swapped(node: &Tree, mode: &KeyMode) -> Tree {
    let (left, right) = (node.child(0), node.child(1));
    if is_pure(left) && is_pure(right) && shape_order(mode, left, right) == Ordering::Greater {
        return with_children(node, vec![right.clone(), left.clone()]);
    }
    node.clone()
}

fn binary(node: &Tree, mode: &KeyMode) -> Tree {
    let value = node.value.as_deref();
    if is_logical(value) {
        return chain(node, node.commutes == Some(true), mode);
    }
    if is_bitwise(value) {
        return chain(node, true, mode);
    }
    let equality = matches!(value, Some("==" | "!=" | "===" | "!=="));
    if equality || (matches!(value, Some("+" | "*")) && node.commutes == Some(true)) {
        return swapped(node, mode);
    }
    node.clone()
}

pub fn is_chain_interior(parent: &Node, child: &Node) -> bool {
    parent.is("binary")
        && (is_logical(parent.value.as_deref()) || is_bitwise(parent.value.as_deref()))
        && same_operator(parent, child)
}

pub fn negation_of(node: &Node) -> Option<&Tree> {
    if node.is("unary") && node.value_is("!") { node.children.first() } else { None }
}

pub fn rewrite_expression(node: &Tree, mode: &KeyMode) -> Tree {
    if node.is("binary") {
        return binary(node, mode);
    }
    let library = library_match(node)
        .or_else(|| as_reference(node))
        .or_else(|| same_reference(node))
        .or_else(|| collapsed_negation(node));
    if let Some(library) = library {
        return library;
    }
    let first = node.children.first().filter(|_| node.is("conditional"));
    let negated = first.and_then(|first| negation_of(first));
    match negated {
        Some(negated) => with_children(node, vec![negated.clone(), node.child(2).clone(), node.child(1).clone()]),
        None => node.clone(),
    }
}

fn as_condition(node: &Tree) -> Tree {
    if node.is("binary") && is_logical(node.value.as_deref()) {
        let children = node.children.iter().map(as_condition).collect();
        return Rc::new(Node { commutes: Some(true), children, ..(**node).clone() });
    }
    if negation_of(node).is_some() {
        return with_children(node, node.children.iter().map(as_condition).collect());
    }
    node.clone()
}

fn condition_position(kind: &str) -> Option<usize> {
    match kind {
        "if" | "while" | "conditional" => Some(0),
        "do" | "for" => Some(1),
        _ => None,
    }
}

pub fn with_conditions(node: &Node, children: Vec<Tree>) -> Tree {
    let Some(position) = condition_position(&node.kind) else {
        return with_children(node, children);
    };
    let children = children
        .into_iter()
        .enumerate()
        .map(|(index, child)| if index == position { as_condition(&child) } else { child });
    with_children(node, children.collect())
}

pub fn mark_conditions(node: &Tree) -> Tree {
    with_conditions(node, node.children.iter().map(mark_conditions).collect())
}
