//! `operand-chains.mts`: the repeated operands and the contradicting or redundant comparisons of one `&&`/`||`
//! chain, one report per problem.
use super::comparisons::{comparison_verdict, constant_comparison, Verdict};
use super::terms::{is_effect_free, is_stable, normal_term};
use crate::typescript::rules::logic_terms::estree::text_of;
use crate::typescript::rules::logic_terms::print::print;
use crate::typescript::rules::logic_terms::{key, Term};
use crate::typescript::rules::support::view::Node;

const ASSERTION_WRAPPERS: [&str; 4] = ["TSAsExpression", "TSSatisfiesExpression", "TSTypeAssertion", "TSNonNullExpression"];

struct Operand {
    term: Term,
    key: String,
    text: String,
}

#[derive(PartialEq)]
pub enum Slip {
    Repeated { operand: String },
    Impossible,
    Always,
    Implied { redundant: String, deciding: String },
    Covered { redundant: String, deciding: String },
}

fn unwrapped(node: Node) -> Node {
    let mut current = node;
    while ASSERTION_WRAPPERS.contains(&current.kind()) {
        match current.node("expression") {
            Some(inner) => current = inner,
            None => break,
        }
    }
    current
}

fn is_same_chain(node: Node, operator: &str) -> bool {
    node.is("LogicalExpression") && node.text("operator").as_deref() == Some(operator)
}

fn source_operands<'v>(node: Node<'v>, operator: &str, found: &mut Vec<Node<'v>>) {
    let current = unwrapped(node);
    if !is_same_chain(current, operator) {
        found.push(node);
        return;
    }
    for side in [current.node("left"), current.node("right")].into_iter().flatten() {
        source_operands(side, operator, found);
    }
}

fn term_operands<'t>(term: &'t Term, operator: &str, found: &mut Vec<&'t Term>) {
    if !term.is_logical(operator) {
        found.push(term);
        return;
    }
    for child in &term.children {
        term_operands(child, operator, found);
    }
}

fn operands_of(chain: Node, operator: &str, source: &str, boolean_context: bool) -> Vec<Operand> {
    let mut nodes = Vec::new();
    source_operands(chain, operator, &mut nodes);
    let mut operands = Vec::new();
    for node in nodes {
        let term = normal_term(node, source, boolean_context);
        if !term.is_logical(operator) {
            operands.push(Operand { key: key(&term), text: text_of(source, node).to_string(), term });
            continue;
        }
        let mut parts = Vec::new();
        term_operands(&term, operator, &mut parts);
        operands.extend(parts.into_iter().map(|part| Operand { term: part.clone(), key: key(part), text: print(part) }));
    }
    operands
}

fn segments(operands: Vec<Operand>) -> Vec<Vec<Operand>> {
    let mut runs: Vec<Vec<Operand>> = vec![Vec::new()];
    for operand in operands {
        let ends_run = !is_effect_free(&operand.term);
        if let Some(run) = runs.last_mut() {
            run.push(operand);
        }
        if ends_run {
            runs.push(Vec::new());
        }
    }
    runs
}

fn repeated(run: &[Operand], found: &mut Vec<Slip>) {
    let mut seen = std::collections::HashSet::new();
    for operand in run.iter().filter(|operand| is_stable(&operand.term)) {
        if !seen.insert(operand.key.as_str()) {
            found.push(Slip::Repeated { operand: operand.text.clone() });
        }
    }
}

fn comparison_pairs(operator: &str, run: &[Operand], found: &mut Vec<Slip>) {
    let compared: Vec<(&Operand, _)> = run.iter().filter_map(|operand| constant_comparison(&operand.term).map(|comparison| (operand, comparison))).collect();
    for (index, (first, first_comparison)) in compared.iter().enumerate() {
        for (second, second_comparison) in compared.iter().skip(index + 1).filter(|(second, _)| second.key != first.key) {
            let decided = |first_redundant: bool| {
                let (redundant, deciding) = if first_redundant { (first, second) } else { (second, first) };
                (redundant.text.clone(), deciding.text.clone())
            };
            found.push(match comparison_verdict(operator, first_comparison, second_comparison) {
                None => continue,
                Some(Verdict::Impossible) => Slip::Impossible,
                Some(Verdict::Always) => Slip::Always,
                Some(Verdict::Implied { first_redundant }) => {
                    let (redundant, deciding) = decided(first_redundant);
                    Slip::Implied { redundant, deciding }
                }
                Some(Verdict::Covered { first_redundant }) => {
                    let (redundant, deciding) = decided(first_redundant);
                    Slip::Covered { redundant, deciding }
                }
            });
        }
    }
}

pub fn chain_slips(chain: Node, operator: &str, source: &str, boolean_context: bool) -> Vec<Slip> {
    let mut found = Vec::new();
    for run in segments(operands_of(chain, operator, source, boolean_context)) {
        repeated(&run, &mut found);
        comparison_pairs(operator, &run, &mut found);
    }
    let mut distinct: Vec<Slip> = Vec::new();
    for slip in found {
        if !distinct.contains(&slip) {
            distinct.push(slip);
        }
    }
    distinct
}
