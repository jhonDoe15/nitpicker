//! FindFloatEquality rebuilt from what SpotBugs 4.9.8 reports on test code. An `==` or `!=` that compares as
//! `double` or `float` (two boxed values compare references):
//! - FE_TEST_IF_EQUAL_TO_NOT_A_NUMBER, priority 1, when a side folds to NaN (also through a local);
//! - nothing when a side folds to a whole number or an infinity, both fold to one number, or both sides read one local
//!   or one field of one object (also through locals copied from it);
//! - FE_FLOATING_POINT_EQUALITY priority 1 when a side is floating point arithmetic (`values::math`); else, with a
//!   side folding to another number, priority 3 when the other side holds a parameter as passed
//!   (`values::parameter_like`) and 2 otherwise; else priority 3. A side javac converts to the compared type (`int`
//!   to `double`, `float` to `double`) is neither arithmetic nor a parameter.
//!
//! A field not `public` counts as arithmetic when any class of the run stores arithmetic in it, so findings wait for
//! the whole run. Each pattern once per method, the best priority, of equal ones the first; the line is javac's.
mod parameters;
mod values;

use super::idioms::compiled;
use super::taint::lines;
use super::{Context, place};
use crate::engine::finding::Finding;
use crate::engine::source::walk;
use crate::java::types::model::Type;
use crate::java::types::scope::TYPE_DECLARATIONS;
use std::collections::HashSet;
use std::sync::Mutex;
use tree_sitter::Node;
use parameters::Stores;
use values::{Folded, Key, Math};

pub const EQUALITY: &str = "FE_FLOATING_POINT_EQUALITY";
pub const NOT_A_NUMBER: &str = "FE_TEST_IF_EQUAL_TO_NOT_A_NUMBER";
pub const PATTERNS: &[&str] = &[EQUALITY, NOT_A_NUMBER];

/// One comparison waiting for the fields of the run: its priority, and 1 when one of the fields holds arithmetic.
struct Candidate {
    finding: Finding,
    priority: u8,
    fields: Vec<Key>,
}

#[derive(Default)]
pub struct Floats {
    math: Mutex<HashSet<Key>>,
    waiting: Mutex<Vec<Vec<Candidate>>>,
}

impl Floats {
    pub fn settle(&self, out: &mut Vec<Finding>) {
        let math = self.math.lock().unwrap_or_else(std::sync::PoisonError::into_inner);
        let waiting = std::mem::take(&mut *self.waiting.lock().unwrap_or_else(std::sync::PoisonError::into_inner));
        for method in waiting {
            let judged = method.into_iter().map(|candidate| {
                let priority = if candidate.fields.iter().any(|key| math.contains(key)) { 1 } else { candidate.priority };
                (priority, candidate.finding)
            });
            let best = judged.fold(None::<(u8, Finding)>, |best, (priority, finding)| match best {
                Some((kept, _)) if kept <= priority => best,
                _ => Some((priority, finding)),
            });
            if let Some((priority, finding)) = best.filter(|(priority, _)| *priority <= 2) {
                out.push(Finding { priority: Some(priority), ..finding });
            }
        }
    }
}

/// The two sides of an `==` or `!=` that compares as `double` or `float`, each with whether it has that type before
/// javac converts it.
fn sides<'t>(context: &Context, compare: Node<'t>) -> Option<((Node<'t>, bool), (Node<'t>, bool))> {
    let operator = compare.child_by_field_name("operator").map(|operator| context.text(operator))?;
    if !matches!(operator, "==" | "!=") {
        return None;
    }
    let (left, right) = (compare.child_by_field_name("left")?, compare.child_by_field_name("right")?);
    let (one, two) = (context.resolver.type_of(left)?, context.resolver.type_of(right)?);
    if !matches!(one, Type::Primitive(_)) && !matches!(two, Type::Primitive(_)) {
        return None;
    }
    let (one, two) = (values::numeric(&one)?, values::numeric(&two)?);
    let compared = if one == "double" || two == "double" { "double" } else if one == "float" || two == "float" { "float" } else { return None };
    Some(((left, one == compared), (right, two == compared)))
}

/// Notes the fields of a file that get arithmetic stored in them.
fn note_math(context: &Context, floats: &Floats) {
    let mut found = Vec::new();
    walk(context.file.tree.root_node(), |node| {
        let target = match node.kind() {
            "assignment_expression" => node.child_by_field_name("left"),
            "update_expression" => crate::engine::source::named_children(node).into_iter().next(),
            "variable_declarator" if crate::engine::source::parent(node).is_some_and(|holder| holder.kind() == "field_declaration") => Some(node),
            _ => None,
        };
        let Some(target) = target else { return };
        let key = if node.kind() == "variable_declarator" {
            let class = crate::java::types::scope::enclosing_types(context.resolver.scope, node).into_iter().next();
            class.zip(node.child_by_field_name("name")).map(|(class, name)| (class, context.text(name).to_string()))
        } else {
            super::fields::field_key(context, crate::java::types::expr::unwrap(target))
        };
        if let Some(key) = key.filter(|_| values::writes_math(context, node)) {
            found.push(key);
        }
    });
    floats.math.lock().unwrap_or_else(std::sync::PoisonError::into_inner).extend(found);
}

pub fn floats<'a>(context: &Context<'a>, declared: &[Node<'a>], floats: &Floats) {
    if !context.wants(PATTERNS) {
        return;
    }
    note_math(context, floats);
    let stores = Stores::new();
    let mut waiting = Vec::new();
    for class in declared {
        let named = TYPE_DECLARATIONS.contains(&class.kind()) || matches!(class.kind(), "object_creation_expression" | "enum_constant");
        let Some(own) = context.resolver.scope.names.get(&class.id()).cloned().filter(|_| named) else { continue };
        for method in compiled(context, &own, *class) {
            let mut candidates = Vec::new();
            let mut doomed = false;
            for compare in method.nodes.iter().copied().filter(|node| node.kind() == "binary_expression") {
                let Some(((left, left_kept), (right, right_kept))) = sides(context, compare) else { continue };
                let line = lines::after(context, compare);
                let place = place::function(&method.label);
                let folded = (values::constant(context, left), values::constant(context, right));
                if matches!(folded, (Some(Folded::NotANumber), _) | (_, Some(Folded::NotANumber))) {
                    if !doomed {
                        doomed = true;
                        let message = format!("Doomed test for equality to NaN in {}", method.label);
                        context.report_listed(NOT_A_NUMBER, compare, line, message, place, 1, vec![method.label.clone()]);
                    }
                    continue;
                }
                let integral = matches!(folded, (Some(Folded::Integral), _) | (_, Some(Folded::Integral)));
                if integral || values::same_constant(context, left, right) || values::same(context, left, right) {
                    continue;
                }
                let math = |side, kept| if kept { values::math(context, side, 0) } else { Math::No };
                let (priority, fields) = match math(left, left_kept).or_math(math(right, right_kept)) {
                    Math::Yes => (1, Vec::new()),
                    other => {
                        let fields = if let Math::Fields(fields) = other { fields } else { Vec::new() };
                        let priority = match folded {
                            (Some(Folded::Other), _) => if right_kept && stores.parameter_like(context, right, 0) { 3 } else { 2 },
                            (_, Some(Folded::Other)) => if left_kept && stores.parameter_like(context, left, 0) { 3 } else { 2 },
                            _ => 3,
                        };
                        (priority, fields)
                    }
                };
                let message = format!("Test for floating point equality in {}", method.label);
                let Some(finding) = context.finding_listed(EQUALITY, compare, line, message, place, vec![method.label.clone()]) else { continue };
                candidates.push(Candidate { finding, priority, fields });
            }
            if !candidates.is_empty() {
                waiting.push(candidates);
            }
        }
    }
    floats.waiting.lock().unwrap_or_else(std::sync::PoisonError::into_inner).extend(waiting);
}
