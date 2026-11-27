//! `constant-comparisons.mts` with `shared/logic/comparisons/constant-verdicts.mts`: two comparisons of one value
//! against constants, tried on sample values to see whether they contradict, always hold, or one decides the other.
use super::terms::is_stable;
use crate::typescript::rules::logic_terms::{key, Term};

#[derive(Clone, PartialEq, Debug)]
enum Constant {
    Number(f64),
    Text(String),
}

#[derive(Clone, Copy, PartialEq)]
enum SampleKind {
    Number,
    Other,
    Text,
}

struct Sample {
    kind: SampleKind,
    number: f64,
    text: Option<String>,
}

pub struct Comparison {
    operator: &'static str,
    constant: Constant,
    subject_key: String,
}

pub enum Verdict {
    Impossible,
    Always,
    Implied { first_redundant: bool },
    Covered { first_redundant: bool },
}

fn mirrored(operator: &str) -> Option<&'static str> {
    match operator {
        "<" => Some(">"),
        "<=" => Some(">="),
        ">" => Some("<"),
        ">=" => Some("<="),
        "===" => Some("==="),
        "!==" => Some("!=="),
        _ => None,
    }
}

fn is_relation(operator: &str) -> bool {
    matches!(operator, "<" | "<=" | ">" | ">=")
}

fn number_constant(node: &Term) -> Option<Constant> {
    let negated = node.kind == "unary" && node.value() == Some("-");
    let literal = if negated { node.children.first()? } else { node };
    let text = literal.value().filter(|_| literal.kind == "literal")?;
    let is_text = text.starts_with('"') || text.trim_matches(is_js_space).is_empty();
    let value = if is_text { f64::NAN } else { js_number_of(text) };
    value.is_finite().then(|| Constant::Number(if negated { -value } else { value }))
}

fn is_js_space(character: char) -> bool {
    matches!(character, '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}')
        || matches!(character, '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}')
}

/// `Number(text)` for the literal spellings a term holds: decimal numbers, or words that are not numbers.
fn js_number_of(text: &str) -> f64 {
    let trimmed = text.trim_matches(is_js_space);
    let plain = trimmed.strip_prefix(['+', '-']).unwrap_or(trimmed);
    if plain == "Infinity" {
        return if trimmed.starts_with('-') { f64::NEG_INFINITY } else { f64::INFINITY };
    }
    let numeric = !plain.is_empty() && plain.bytes().all(|byte| byte.is_ascii_digit() || matches!(byte, b'.' | b'e' | b'E' | b'+' | b'-'));
    if numeric { trimmed.parse().unwrap_or(f64::NAN) } else { f64::NAN }
}

fn constant_of(node: &Term) -> Option<Constant> {
    if let Some(number) = number_constant(node) {
        return Some(number);
    }
    let text = node.value().filter(|text| node.kind == "literal" && text.starts_with('"'))?;
    Some(Constant::Text(text.to_string()))
}

pub fn constant_comparison(term: &Term) -> Option<Comparison> {
    let operator = term.value().filter(|_| term.kind == "binary").and_then(canonical)?;
    let (left, right) = term.pair()?;
    let (subject, operator, constant) = match constant_of(right) {
        Some(constant) => (left, operator, constant),
        None => (right, mirrored(operator)?, constant_of(left)?),
    };
    if !is_stable(subject) || (is_relation(operator) && !matches!(constant, Constant::Number(_))) {
        return None;
    }
    Some(Comparison { operator, constant, subject_key: key(subject) })
}

fn canonical(operator: &str) -> Option<&'static str> {
    mirrored(operator).and_then(mirrored)
}

fn number_samples(first: f64, second: f64) -> Vec<Sample> {
    let low = first.min(second);
    let high = first.max(second);
    let below = low - 1f64.max(low.abs());
    let above = high + 1f64.max(high.abs());
    let values = [below, low, low / 2.0 + high / 2.0, high, above];
    let mut samples: Vec<Sample> = values.iter().map(|value| Sample { kind: SampleKind::Number, number: *value, text: None }).collect();
    samples.extend(values.iter().map(|value| Sample { kind: SampleKind::Other, number: *value, text: None }));
    samples.push(Sample { kind: SampleKind::Number, number: f64::NAN, text: None });
    samples
}

fn holds(comparison: &Comparison, sample: &Sample) -> bool {
    let Constant::Number(constant) = &comparison.constant else {
        let Constant::Text(constant) = &comparison.constant else { return false };
        let equal = sample.kind == SampleKind::Text && sample.text.as_ref() == Some(constant);
        return (comparison.operator == "===") == equal;
    };
    let value = sample.number;
    match comparison.operator {
        "<" => value < *constant,
        "<=" => value <= *constant,
        ">" => *constant < value,
        ">=" => *constant <= value,
        operator => (operator == "===") == (sample.kind == SampleKind::Number && value == *constant),
    }
}

fn implies(samples: &[Sample], premise: &Comparison, conclusion: &Comparison) -> bool {
    samples.iter().all(|sample| !holds(premise, sample) || holds(conclusion, sample))
}

/// How two comparisons of one operand against constants combine under `&&` or `||`, if wrongly.
pub fn comparison_verdict(operator: &str, first: &Comparison, second: &Comparison) -> Option<Verdict> {
    let samples = match (&first.constant, &second.constant) {
        _ if first.subject_key != second.subject_key => return None,
        (Constant::Number(one), Constant::Number(other)) => number_samples(*one, *other),
        (Constant::Text(one), Constant::Text(other)) => [Some(one.clone()), Some(other.clone()), None]
            .into_iter()
            .map(|text| Sample { kind: SampleKind::Text, number: f64::NAN, text })
            .collect(),
        _ => return None,
    };
    if operator == "&&" {
        if !samples.iter().any(|sample| holds(first, sample) && holds(second, sample)) {
            return Some(Verdict::Impossible);
        }
        if implies(&samples, first, second) {
            return Some(Verdict::Implied { first_redundant: false });
        }
        return implies(&samples, second, first).then_some(Verdict::Implied { first_redundant: true });
    }
    if samples.iter().all(|sample| holds(first, sample) || holds(second, sample)) {
        return Some(Verdict::Always);
    }
    if implies(&samples, first, second) {
        return Some(Verdict::Covered { first_redundant: true });
    }
    implies(&samples, second, first).then_some(Verdict::Covered { first_redundant: false })
}
