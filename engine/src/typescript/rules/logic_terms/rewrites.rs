//! `shared/logic/rewrites/expressions.mts` and `ordering.mts`: one rewrite step of an expression, the first that
//! applies, in the order the shared module lists them.
use super::purity::{cannot_throw, is_side_effect_free};
use super::{flipped_equality, is_boolean_valued, js_order, key, logical, not, Term};

fn truthiness_kept(operand: &Term, boolean_context: bool) -> bool {
    boolean_context || is_boolean_valued(operand)
}

fn literal(value: &str) -> Term {
    Term::new("literal", Some(value), Vec::new())
}

fn double_negation(node: &Term, boolean_context: bool) -> Option<Term> {
    let inner = node.children.first().filter(|inner| node.is_not() && inner.is_not())?;
    inner.children.first().filter(|operand| truthiness_kept(operand, boolean_context)).cloned()
}

fn de_morgan(node: &Term) -> Option<Term> {
    let operand = node.children.first().filter(|_| node.is_not())?;
    if !(operand.is_logical("&&") || operand.is_logical("||")) {
        return None;
    }
    let (left, right) = operand.pair()?;
    let flipped = if operand.value() == Some("&&") { "||" } else { "&&" };
    Some(logical(Some(flipped), vec![not(left.clone()), not(right.clone())]))
}

fn flipped(node: &Term) -> Option<Term> {
    let operand = node.children.first().filter(|operand| node.is_not() && operand.is_equality())?;
    Some(Term::new("binary", operand.value().and_then(flipped_equality), operand.children.clone()))
}

fn negated_boolean_literal(node: &Term) -> Option<Term> {
    let operand = node.children.first().filter(|operand| node.is_not() && operand.is_boolean_literal())?;
    Some(literal(if operand.value() == Some("true") { "false" } else { "true" }))
}

fn constant_operands(node: &Term, boolean_context: bool) -> Option<Term> {
    if !(node.is_logical("&&") || node.is_logical("||")) {
        return None;
    }
    let (left, right) = node.pair()?;
    let absorbing = if node.value() == Some("&&") { "false" } else { "true" };
    if left.is_boolean_literal() {
        return Some(if left.value() == Some(absorbing) { left.clone() } else { right.clone() });
    }
    if !(right.is_boolean_literal() && truthiness_kept(left, boolean_context)) {
        return None;
    }
    if right.value() != Some(absorbing) {
        return Some(left.clone());
    }
    cannot_throw(left).then(|| right.clone())
}

fn boolean_ternary(node: &Term, boolean_context: bool) -> Option<Term> {
    let [test, consequent, alternate] = node.children.as_slice() else { return None };
    if node.kind != "conditional" {
        return None;
    }
    let kept = truthiness_kept(test, boolean_context);
    let (test, consequent, alternate) = (test.clone(), consequent.clone(), alternate.clone());
    if consequent.is_literal("true") && alternate.is_literal("false") {
        return Some(if kept { test } else { not(not(test)) });
    }
    if consequent.is_literal("false") {
        return Some(if alternate.is_literal("true") { not(test) } else { logical(Some("&&"), vec![not(test), alternate]) });
    }
    if alternate.is_literal("true") {
        return Some(logical(Some("||"), vec![not(test), consequent]));
    }
    if !kept {
        return None;
    }
    if consequent.is_literal("true") {
        return Some(logical(Some("||"), vec![test, alternate]));
    }
    alternate.is_literal("false").then(|| logical(Some("&&"), vec![test, consequent]))
}

fn negated_ternary(node: &Term) -> Option<Term> {
    let [test, consequent, alternate] = node.children.as_slice() else { return None };
    if node.kind != "conditional" || !test.is_not() {
        return None;
    }
    let negated = test.children.first()?;
    Some(Term::new("conditional", None, vec![negated.clone(), alternate.clone(), consequent.clone()]))
}

fn comparison_orientation(node: &Term) -> Option<Term> {
    let oriented = match node.value() {
        Some(">") => "<",
        Some(">=") => "<=",
        _ => return None,
    };
    let (left, right) = node.pair().filter(|_| node.kind == "binary")?;
    (is_side_effect_free(left, false) && is_side_effect_free(right, false)).then(|| Term::new("binary", Some(oriented), vec![right.clone(), left.clone()]))
}

fn logical_grouping(node: &Term) -> Option<Term> {
    let [left, right, ..] = node.children.as_slice() else { return None };
    if node.kind != "logical" || right.kind != "logical" || right.value != node.value {
        return None;
    }
    let (middle, last) = right.pair()?;
    let grouped = logical(node.value(), vec![left.clone(), middle.clone()]);
    Some(logical(node.value(), vec![grouped, last.clone()]))
}

fn chain_operands<'t>(node: &'t Term, operator: Option<&str>, found: &mut Vec<&'t Term>) {
    if node.kind == "logical" && node.value() == operator {
        for child in &node.children {
            chain_operands(child, operator, found);
        }
    } else {
        found.push(node);
    }
}

fn chain_order(node: &Term) -> Option<Term> {
    let mut operands = Vec::new();
    chain_operands(node, node.value(), &mut operands);
    if !operands.iter().all(|operand| cannot_throw(operand) && is_side_effect_free(operand, false)) {
        return None;
    }
    let keyed: Vec<(String, &Term)> = operands.into_iter().map(|operand| (key(operand), operand)).collect();
    let mut sorted = keyed.clone();
    sorted.sort_by(|first, second| js_order(&first.0, &second.0));
    if sorted.iter().zip(&keyed).all(|(entry, original)| entry.0 == original.0) {
        return None;
    }
    let mut terms = sorted.into_iter().map(|(_, operand)| operand.clone());
    let first = terms.next()?;
    Some(terms.fold(first, |chain, operand| logical(node.value(), vec![chain, operand])))
}

fn commutative_order(node: &Term, boolean_context: bool) -> Option<Term> {
    if node.kind == "binary" {
        if !(node.is_equality() || matches!(node.value(), Some("&" | "|" | "^"))) {
            return None;
        }
        let (left, right) = node.pair()?;
        let swap = is_side_effect_free(left, false) && is_side_effect_free(right, false) && js_order(&key(left), &key(right)).is_gt();
        return swap.then(|| Term::new("binary", node.value(), vec![right.clone(), left.clone()]));
    }
    (node.kind == "logical" && node.value() != Some("??") && boolean_context).then(|| chain_order(node)).flatten()
}

pub fn rewrite_once(node: &Term, boolean_context: bool) -> Option<Term> {
    double_negation(node, boolean_context)
        .or_else(|| de_morgan(node))
        .or_else(|| flipped(node))
        .or_else(|| negated_boolean_literal(node))
        .or_else(|| constant_operands(node, boolean_context))
        .or_else(|| boolean_ternary(node, boolean_context))
        .or_else(|| negated_ternary(node))
        .or_else(|| comparison_orientation(node))
        .or_else(|| logical_grouping(node))
        .or_else(|| commutative_order(node, boolean_context))
}
