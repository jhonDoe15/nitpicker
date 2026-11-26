//! AlreadyChecked: a condition repeats what an enclosing `if` or conditional expression, or an earlier early exit, settled.
use super::Context;
use super::already_pure::{Ce, Constants};
use super::shape::preferred;
use crate::engine::source::{children, parent};
use crate::java::types::model::Type;
use std::collections::HashMap;
use tree_sitter::Node;

const NAME: &str = "AlreadyChecked";
const BLOCKS: [&str; 2] = ["block", "constructor_body"];
const METHODS: [&str; 4] = ["method_declaration", "constructor_declaration", "compact_constructor_declaration", "lambda_expression"];
const SUPPRESSIBLE: [&str; 8] = [
    "class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration", "method_declaration",
    "constructor_declaration", "field_declaration",
];

/// What a condition settles: the expressions that must hold, and those that must not.
#[derive(Default)]
struct Truthiness {
    required_true: Vec<Ce>,
    required_false: Vec<Ce>,
}

#[derive(Default)]
struct Counts(HashMap<String, usize>);

impl Counts {
    fn add(&mut self, ces: &[Ce]) {
        for ce in ces {
            *self.0.entry(ce.key.clone()).or_insert(0) += 1;
        }
    }
    fn remove(&mut self, ces: &[Ce]) {
        for ce in ces {
            if let Some(count) = self.0.get_mut(&ce.key) {
                *count -= 1;
                if *count == 0 {
                    self.0.remove(&ce.key);
                }
            }
        }
    }
    fn has(&self, ce: &Ce) -> bool {
        self.0.contains_key(&ce.key)
    }
    fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

struct Scanner<'c, 'a> {
    context: &'c Context<'a>,
    constants: Constants<'c, 'a, 'c>,
    truths: Counts,
    falsehoods: Counts,
    enclosing: Vec<usize>,
    truths_in_method: Vec<Vec<Ce>>,
    falsehoods_in_method: Vec<Vec<Ce>>,
}

fn unique(ces: &[Ce]) -> Vec<Ce> {
    let mut seen: Vec<Ce> = Vec::new();
    for ce in ces {
        if !seen.iter().any(|known| known.key == ce.key) {
            seen.push(ce.clone());
        }
    }
    seen
}

impl<'c, 'a> Scanner<'c, 'a> {
    fn truthiness(&mut self, condition: Node<'c>, not: bool) -> Truthiness {
        let mut found = Truthiness::default();
        let mut failed = false;
        self.collect(condition, not, &mut found, &mut failed);
        if failed {
            return Truthiness::default();
        }
        found.required_true = unique(&found.required_true);
        found.required_false = unique(&found.required_false);
        found
    }

    fn collect(&mut self, node: Node<'c>, negated: bool, found: &mut Truthiness, failed: &mut bool) {
        let context = self.context;
        let mut add = |ce: Ce, negated: bool| if negated { found.required_false.push(ce) } else { found.required_true.push(ce) };
        match node.kind() {
            "parenthesized_expression" => {
                if let Some(inner) = children(node).into_iter().find(|part| part.is_named() && !part.kind().ends_with("comment")) {
                    self.collect(inner, negated, found, failed);
                }
            }
            "unary_expression" => {
                let bang = node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "!");
                if bang {
                    if let Some(operand) = node.child_by_field_name("operand") {
                        self.collect(operand, !negated, found, failed);
                    }
                }
            }
            "binary_expression" => {
                let operator = node.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default();
                match operator {
                    "==" | "!=" => {
                        if let Some(ce) = self.constants.expression(node) {
                            add(ce, if operator == "!=" { !negated } else { negated });
                        }
                    }
                    "&&" if !negated => self.both(node, negated, found, failed),
                    "||" if negated => self.both(node, negated, found, failed),
                    _ => *failed = true,
                }
            }
            "method_invocation" | "identifier" => {
                if let Some(ce) = self.constants.expression(node) {
                    add(ce, negated);
                }
            }
            _ => {}
        }
    }

    fn both(&mut self, node: Node<'c>, negated: bool, found: &mut Truthiness, failed: &mut bool) {
        for side in ["left", "right"] {
            if let Some(part) = node.child_by_field_name(side) {
                self.collect(part, negated, found, failed);
            }
        }
    }

    fn within_scope(&mut self, truthiness: Truthiness, statement: Option<Node<'c>>) {
        self.truths.add(&truthiness.required_true);
        self.falsehoods.add(&truthiness.required_false);
        if let Some(statement) = statement {
            self.visit(statement);
        }
        self.truths.remove(&truthiness.required_true);
        self.falsehoods.remove(&truthiness.required_false);
    }

    fn branches(&mut self, node: Node<'c>, then: &str, otherwise: &str) {
        let Some(condition) = node.child_by_field_name("condition") else { return };
        self.visit(condition);
        let when_true = self.truthiness(condition, false);
        self.within_scope(when_true, node.child_by_field_name(then));
        let when_false = self.truthiness(condition, true);
        self.within_scope(when_false, node.child_by_field_name(otherwise));
    }

    fn within_method(&mut self, node: Node<'c>) {
        self.enclosing.push(node.id());
        self.truths_in_method.push(Vec::new());
        self.falsehoods_in_method.push(Vec::new());
        self.visit_children(node);
        self.enclosing.pop();
        let truths = self.truths_in_method.pop().unwrap_or_default();
        let falsehoods = self.falsehoods_in_method.pop().unwrap_or_default();
        self.truths.remove(&unique(&truths));
        self.falsehoods.remove(&unique(&falsehoods));
    }

    /// After a `return` or `throw` that ends the branch of an `if`, the rest of the method knows the other branch was taken.
    fn method_exit(&mut self, node: Node<'c>) {
        let mut previous = node;
        let mut at = parent(node);
        while let Some(block) = at.filter(|at| BLOCKS.contains(&at.kind())) {
            previous = block;
            at = parent(block);
        }
        let Some(if_node) = at.filter(|at| at.kind() == "if_statement") else { return };
        let mut method = parent(if_node);
        while let Some(block) = method.filter(|at| BLOCKS.contains(&at.kind())) {
            method = parent(block);
        }
        let Some(method) = method else { return };
        if self.enclosing.last() != Some(&method.id()) {
            return;
        }
        let Some(condition) = if_node.child_by_field_name("condition") else { return };
        let then = if_node.child_by_field_name("consequence").is_some_and(|branch| branch.id() == previous.id());
        let truthiness = self.truthiness(condition, then);
        self.truths.add(&truthiness.required_true);
        self.falsehoods.add(&truthiness.required_false);
        if let Some(last) = self.truths_in_method.last_mut() {
            last.extend(truthiness.required_true);
        }
        if let Some(last) = self.falsehoods_in_method.last_mut() {
            last.extend(truthiness.required_false);
        }
    }

    fn check(&mut self, node: Node<'c>) {
        if self.truths.is_empty() && self.falsehoods.is_empty() {
            return;
        }
        let context = self.context;
        let candidate = match node.kind() {
            "identifier" => super::values::value_name(node),
            "field_access" | "method_invocation" => true,
            "binary_expression" => node.child_by_field_name("operator").is_some_and(|operator| matches!(context.text(operator), "==" | "!=")),
            _ => false,
        };
        let Some(holder) = parent(node) else { return };
        if !candidate || holder.kind() == "argument_list" {
            return;
        }
        if node.kind() == "identifier" && holder.kind() == "assignment_expression" && holder.child_by_field_name("left").is_some_and(|left| left.id() == node.id()) {
            return;
        }
        if node.kind() != "binary_expression" && context.resolver.type_of(node) != Some(Type::Primitive("boolean")) {
            return;
        }
        let Some(ce) = self.constants.expression(node) else { return };
        let at = preferred(node);
        if self.truths.has(&ce) {
            let message = format!("This condition (on {}) is already known to be true; it (or its complement) has already been checked.", ce.shown);
            context.report_fixed(NAME, node, at, &message, &[]);
        }
        if self.falsehoods.has(&ce) {
            let message = format!("This condition (on {}) is known to be false here. It (or its complement) has already been checked.", ce.shown);
            context.report_fixed(NAME, node, at, &message, &[]);
        }
    }

    fn visit_children(&mut self, node: Node<'c>) {
        for child in children(node) {
            if child.is_named() && !child.kind().ends_with("comment") {
                self.visit(child);
            }
        }
    }

    fn visit(&mut self, node: Node<'c>) {
        if SUPPRESSIBLE.contains(&node.kind()) && self.context.suppressed(NAME, node) {
            return;
        }
        self.check(node);
        match node.kind() {
            "if_statement" => self.branches(node, "consequence", "alternative"),
            "ternary_expression" => self.branches(node, "consequence", "alternative"),
            "return_statement" | "throw_statement" => {
                self.visit_children(node);
                self.method_exit(node);
            }
            kind if METHODS.contains(&kind) => self.within_method(node),
            _ => self.visit_children(node),
        }
    }
}

pub fn already_checked(context: &Context, root: Node) {
    let mut scanner = Scanner {
        context,
        constants: Constants::new(context),
        truths: Counts::default(),
        falsehoods: Counts::default(),
        enclosing: Vec::new(),
        truths_in_method: Vec::new(),
        falsehoods_in_method: Vec::new(),
    };
    scanner.visit(root);
}
