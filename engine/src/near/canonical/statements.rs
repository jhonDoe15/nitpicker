use super::effects::{accesses_of, continues_loop, is_pure};
use super::expressions::negation_of;
use super::library::loop_match;
use crate::near::keys::{OWN, key_of};
use crate::near::tree::{Node, Tree, contains, is_jump, make, none, spanning, with_children};
use std::rc::Rc;

fn own(node: &Node) -> String {
    key_of(node, &OWN)
}

fn true_literal() -> Tree {
    let mut node = make("literal", Vec::new());
    node.literal = Some("boolean".into());
    node.value = Some("true".into());
    Rc::new(node)
}

fn binary(value: &str, left: Tree, right: Tree) -> Tree {
    let mut node = make("binary", vec![left, right]);
    node.value = Some(value.into());
    node.commutes = Some(true);
    Rc::new(node)
}

fn guard_of(statement: Option<&Tree>) -> Option<&Tree> {
    let statement = statement.filter(|statement| statement.is("if"))?;
    if !statement.child(2).is("none") {
        return None;
    }
    let body = &statement.child(1).children;
    body.first().filter(|first| body.len() == 1 && first.is_jump())
}

fn plain_assignment(statements: &[Tree]) -> Option<&Tree> {
    let only = statements.first().filter(|only| statements.len() == 1 && only.is("evaluate"))?;
    only.children.first().filter(|expression| expression.is("assign") && expression.value_is("="))
}

fn loop_as_while(statement: &Tree) -> Vec<Tree> {
    let (init, condition) = (statement.child(0), statement.child(1));
    let (update, body) = (statement.child(2), statement.child(3));
    if continues_loop(body) || contains(statement, &|node| node.is("lambda"), &|_| false) {
        return vec![statement.clone()];
    }
    let test = if condition.is("none") { true_literal() } else { condition.clone() };
    let loop_body = make("block", body.children.iter().chain(&update.children).cloned().collect());
    let mut result = init.children.clone();
    result.push(spanning(make("while", vec![test, Rc::new(loop_body)]), statement, statement));
    result
}

fn joined_assignment(statement: &Tree) -> Option<Tree> {
    let (condition, then, otherwise) = (statement.child(0), statement.child(1), statement.child(2));
    let left = plain_assignment(&then.children)?;
    let right = plain_assignment(&otherwise.children)?;
    let target = left.child(0);
    if own(target) != own(right.child(0)) || !is_pure(target) {
        return None;
    }
    let value = Rc::new(make("conditional", vec![condition.clone(), left.child(1).clone(), right.child(1).clone()]));
    let assigned = with_children(left, vec![target.clone(), value]);
    Some(spanning(make("evaluate", vec![assigned]), statement, statement))
}

fn without_else(statement: &Tree) -> Vec<Tree> {
    let (condition, then) = (statement.child(0), statement.child(1));
    let inner = then.children.first().filter(|inner| then.children.len() == 1 && inner.is("if"));
    match inner.filter(|inner| inner.child(2).is("none")) {
        Some(inner) => {
            let both = binary("&&", condition.clone(), inner.child(0).clone());
            vec![with_children(statement, vec![both, inner.child(1).clone(), none()])]
        }
        None => vec![statement.clone()],
    }
}

fn with_else(statement: &Tree) -> Vec<Tree> {
    let (condition, then, otherwise) = (statement.child(0), statement.child(1), statement.child(2));
    if let Some(negated) = negation_of(condition) {
        return vec![with_children(statement, vec![negated.clone(), otherwise.clone(), then.clone()])];
    }
    if is_jump(then.children.last()) {
        let mut result = vec![with_children(statement, vec![condition.clone(), then.clone(), none()])];
        result.extend(otherwise.children.iter().cloned());
        return result;
    }
    vec![joined_assignment(statement).unwrap_or_else(|| statement.clone())]
}

fn branches_of(statement: &Tree) -> Vec<Tree> {
    let (condition, then, otherwise) = (statement.child(0), statement.child(1), statement.child(2));
    if otherwise.is("block") && otherwise.children.is_empty() {
        return vec![with_children(statement, vec![condition.clone(), then.clone(), none()])];
    }
    if otherwise.is("none") { without_else(statement) } else { with_else(statement) }
}

fn expanded(statement: &Tree) -> Vec<Tree> {
    match &*statement.kind {
        "for" => loop_as_while(statement),
        "if" => branches_of(statement),
        "block" => statement.children.clone(),
        _ => vec![statement.clone()],
    }
}

fn return_value(statement: &Tree) -> Option<&Tree> {
    let value = if statement.is("return") { statement.children.first() } else { None };
    value.filter(|value| !value.is("none"))
}

fn merged_guard(previous: &Tree, statement: &Tree, jump: &Tree) -> Option<Tree> {
    let condition = previous.child(0);
    if let (Some(early), Some(late)) = (return_value(jump), return_value(statement)) {
        let value = Rc::new(make("conditional", vec![condition.clone(), early.clone(), late.clone()]));
        return Some(spanning(make("return", vec![value]), previous, statement));
    }
    let second = guard_of(Some(statement))?;
    if own(second) != own(jump) {
        return None;
    }
    let either = binary("||", condition.clone(), statement.child(0).clone());
    Some(with_children(previous, vec![either, previous.child(1).clone(), none()]))
}

fn merged_declaration(previous: Option<&Tree>, statement: &Tree) -> Option<Tree> {
    let previous = previous.filter(|previous| previous.is("declare"))?;
    if !previous.child(2).is("none") {
        return None;
    }
    let assignment = plain_assignment(std::slice::from_ref(statement));
    let target = assignment.map(|assignment| assignment.child(0));
    let joinable = target.is_some_and(|target| {
        target.is_bound()
            && previous.children.get(1).is_some_and(|name| name.value == target.value)
            && !accesses_of(assignment.expect("assignment").child(1)).reads.contains(&target.value)
    });
    if !joinable {
        return None;
    }
    let value = assignment.expect("assignment").child(1).clone();
    Some(with_children(previous, vec![previous.child(0).clone(), previous.child(1).clone(), value]))
}

fn merged(previous: Option<&Tree>, statement: &Tree) -> Option<Tree> {
    if let Some(found) = loop_match(previous, statement) {
        return Some(found);
    }
    match (guard_of(previous), previous) {
        (Some(jump), Some(previous)) => merged_guard(previous, statement, jump),
        _ => merged_declaration(previous, statement),
    }
}

pub fn rewrite_statements(statements: &[Tree]) -> Vec<Tree> {
    let mut result: Vec<Tree> = Vec::new();
    for statement in statements.iter().flat_map(expanded) {
        match merged(result.last(), &statement) {
            Some(joined) => *result.last_mut().expect("previous") = joined,
            None => result.push(statement),
        }
    }
    result
}
