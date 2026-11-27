//! Error Prone's `Reachability`: whether a statement can complete normally (JLS 14.22), with `System.exit` as an
//! exception, and the switch cases as javac lists them.
use super::Context;
use super::call_match::static_on_class;
use super::consts::{Const, constant};
use crate::engine::source::{children, named_children, parent};
use std::collections::HashSet;
use tree_sitter::Node;

const LOOPS: [&str; 4] = ["while_statement", "do_statement", "for_statement", "enhanced_for_statement"];

/// Whether a statement can complete normally.
pub fn can_complete_normally(context: &Context, statement: Node) -> bool {
    Reach { context, breaks: HashSet::new(), continues: HashSet::new() }.scan(statement)
}

/// Whether a case can fall through to the next one: a rule never does.
pub fn can_fall_through(context: &Context, case: Node) -> bool {
    if case.kind() == "switch_rule" {
        return false;
    }
    case_statements(case).last().is_none_or(|last| can_complete_normally(context, *last))
}

/// The cases of a switch, one per javac case: tree-sitter gives each label of a group of labels its own group.
pub fn cases(switch: Node) -> Vec<Node> {
    let Some(body) = switch.child_by_field_name("body") else { return Vec::new() };
    named_children(body).into_iter().filter(|case| matches!(case.kind(), "switch_block_statement_group" | "switch_rule")).collect()
}

/// The statements of a case with a colon; a rule has none (javac's `getStatements` is null for it).
pub fn case_statements(case: Node) -> Vec<Node> {
    if case.kind() != "switch_block_statement_group" {
        return Vec::new();
    }
    children(case).into_iter().filter(|part| (part.is_named() || part.kind() == ";") && !matches!(part.kind(), "switch_label" | "line_comment" | "block_comment")).collect()
}

pub fn is_rule(case: Node) -> bool {
    case.kind() == "switch_rule"
}

/// `ASTHelpers.isSwitchDefault`: `default`, or `case null, default`, whose `default` the grammar reads as a name.
pub fn is_default(context: &Context, case: Node) -> bool {
    children(case)
        .into_iter()
        .filter(|part| part.kind() == "switch_label")
        .any(|label| children(label).into_iter().any(|part| part.kind() == "default" || (part.kind() == "identifier" && context.text(part) == "default")))
}

/// Where javac's case tree ends: its last statement, its rule body, or its label.
pub fn case_end(case: Node) -> usize {
    case.end_byte()
}

/// Whether a `switch` is a statement and not an expression.
pub fn is_statement_switch(switch: Node) -> bool {
    switch.kind() == "switch_expression" && super::switches::is_statement(switch)
}

struct Reach<'c, 'a> {
    context: &'c Context<'a>,
    breaks: HashSet<usize>,
    continues: HashSet<usize>,
}

impl Reach<'_, '_> {
    fn all(&mut self, statements: &[Node]) -> bool {
        let mut completes = true;
        for statement in statements {
            completes = self.scan(*statement);
        }
        completes
    }

    fn condition(&self, condition: Option<Node>) -> Option<bool> {
        match constant(self.context, condition?) {
            Some(Const::Bool(value)) => Some(value),
            _ => None,
        }
    }

    fn scan(&mut self, statement: Node) -> bool {
        match statement.kind() {
            "break_statement" => {
                if let Some(target) = target(self.context, statement, false) {
                    self.breaks.insert(target);
                }
                false
            }
            "continue_statement" => {
                if let Some(target) = target(self.context, statement, true) {
                    self.continues.insert(target);
                }
                false
            }
            "block" => self.all(&named_children(statement).into_iter().filter(|part| !is_comment(*part)).collect::<Vec<_>>()),
            "labeled_statement" => named_children(statement).into_iter().filter(|part| part.kind() != "identifier" && !is_comment(*part)).last().is_none_or(|body| self.scan(body)),
            "expression_statement" => !statement.named_child(0).is_some_and(|call| static_on_class(self.context, call, "java.lang.System", &["exit"])),
            "if_statement" => {
                let then = statement.child_by_field_name("consequence").is_none_or(|then| self.scan(then));
                let otherwise = statement.child_by_field_name("alternative").is_none_or(|otherwise| self.scan(otherwise));
                then || otherwise
            }
            "switch_expression" => self.switch(statement),
            "while_statement" => {
                let value = self.condition(statement.child_by_field_name("condition"));
                if value != Some(false) {
                    if let Some(body) = statement.child_by_field_name("body") {
                        self.scan(body);
                    }
                }
                value != Some(true) || self.breaks.contains(&statement.id())
            }
            "do_statement" => {
                let completes = statement.child_by_field_name("body").is_none_or(|body| self.scan(body));
                let always = self.condition(statement.child_by_field_name("condition")) == Some(true);
                (completes && !always) || (self.continues.contains(&statement.id()) && !always) || self.breaks.contains(&statement.id())
            }
            "for_statement" => {
                let condition = statement.child_by_field_name("condition");
                let value = self.condition(condition);
                if value != Some(false) {
                    if let Some(body) = statement.child_by_field_name("body") {
                        self.scan(body);
                    }
                }
                (condition.is_some() && value != Some(true)) || self.breaks.contains(&statement.id())
            }
            "enhanced_for_statement" => {
                if let Some(body) = statement.child_by_field_name("body") {
                    self.scan(body);
                }
                true
            }
            "return_statement" | "yield_statement" | "throw_statement" => false,
            "synchronized_statement" => statement.child_by_field_name("body").is_none_or(|body| self.scan(body)),
            "try_statement" | "try_with_resources_statement" => {
                let mut completes = statement.child_by_field_name("body").is_none_or(|body| self.scan(body));
                for part in named_children(statement) {
                    if part.kind() == "catch_clause" {
                        completes |= part.child_by_field_name("body").is_none_or(|body| self.scan(body));
                    }
                }
                if let Some(finally) = named_children(statement).into_iter().find(|part| part.kind() == "finally_clause") {
                    if named_children(finally).into_iter().find(|part| part.kind() == "block").is_some_and(|block| !self.scan(block)) {
                        completes = false;
                    }
                }
                completes
            }
            _ => true,
        }
    }

    fn switch(&mut self, switch: Node) -> bool {
        let cases = cases(switch);
        if !cases.iter().any(|case| is_default(self.context, *case)) {
            return true;
        }
        if cases.iter().any(|case| is_rule(*case)) {
            for case in &cases {
                if let Some(body) = rule_body(*case) {
                    if self.rule(body) {
                        return true;
                    }
                }
            }
            return self.breaks.contains(&switch.id());
        }
        if cases.iter().all(|case| case_statements(*case).is_empty()) {
            return true;
        }
        let mut last = true;
        for case in &cases {
            last = self.all(&case_statements(*case));
        }
        last || case_statements(*cases.last().unwrap()).is_empty() || self.breaks.contains(&switch.id())
    }

    fn rule(&mut self, body: Node) -> bool {
        match body.kind() {
            "block" | "throw_statement" | "expression_statement" => self.scan(body),
            _ => !static_on_class(self.context, body, "java.lang.System", &["exit"]),
        }
    }
}

fn is_comment(node: Node) -> bool {
    matches!(node.kind(), "line_comment" | "block_comment")
}

/// The body of a rule: a block, a `throw`, or an expression.
pub fn rule_body(case: Node) -> Option<Node> {
    named_children(case).into_iter().filter(|part| part.kind() != "switch_label" && !is_comment(*part)).last()
}

/// The statement a `break` or `continue` leaves, as javac resolves it: the body of a label, or the innermost loop
/// (or switch, for a `break`).
fn target(context: &Context, jump: Node, is_continue: bool) -> Option<usize> {
    let label = named_children(jump).into_iter().find(|part| part.kind() == "identifier").map(|name| context.text(name).to_string());
    let mut current = parent(jump);
    while let Some(node) = current {
        let kind = node.kind();
        if matches!(kind, "lambda_expression" | "class_body" | "method_declaration" | "constructor_declaration") {
            return None;
        }
        match &label {
            Some(name) => {
                if kind == "labeled_statement" && named_children(node).first().is_some_and(|first| context.text(*first) == name) {
                    return named_children(node).into_iter().filter(|part| part.kind() != "identifier" && !is_comment(*part)).last().map(|body| body.id());
                }
            }
            None => {
                if LOOPS.contains(&kind) || (!is_continue && kind == "switch_expression") {
                    return Some(node.id());
                }
            }
        }
        current = parent(node);
    }
    None
}
