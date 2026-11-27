//! A method's code in the order javac writes it, reduced to what FindNonShortCircuit tracks: values a call, a null
//! test or an array read leave behind, booleans javac materializes, calls returning `boolean`, and jumps that reset
//! it all.
use super::super::Context;
use crate::engine::source::named_children;
use crate::java::types::expr::unwrap;
use super::shapes::{constant_branch, constant_switch, ends_abruptly, null_test};
use crate::java::types::model::Type;
use tree_sitter::Node;

const COMPARISONS: &[&str] = &["==", "!=", "<", ">", "<=", ">="];
const LOGICAL: &[&str] = &["&&", "||"];
const SKIPPED: &[&str] = &["class_body", "lambda_expression", "class_declaration", "record_declaration", "enum_declaration", "interface_declaration"];
const RESETS: &[&str] =
    &["break_statement", "continue_statement", "switch_expression", "switch_statement", "try_statement", "try_with_resources_statement", "synchronized_statement"];

#[derive(Clone, Copy, Default)]
pub struct Window {
    pub call: bool,
    pub null: bool,
    pub array: bool,
    /// Closed by a call returning `boolean`, not by a boolean javac materializes.
    pub by_call: bool,
}

/// An `&` or `|` the walk reached, with the last window closed before it since the last reset (S), the one before
/// (P), and whether an earlier one, not closed by a call, holds a null test.
pub struct Reached<'t> {
    pub op: Node<'t>,
    pub now: Option<Window>,
    pub before: Option<Window>,
    pub null_before: bool,
}

pub struct Stream<'c, 't> {
    context: &'c Context<'t>,
    open: Window,
    closed: Vec<Window>,
    /// How many closed windows hold a null test and were not closed by a call.
    nulls: usize,
    pub reached: Vec<Reached<'t>>,
}

fn operator<'a>(context: &'a Context, node: Node) -> &'a str {
    node.child_by_field_name("operator").map(|operator| context.text(operator)).unwrap_or_default()
}

fn boolean(context: &Context, node: Node) -> bool {
    matches!(context.resolver.type_of(node), Some(Type::Primitive("boolean")))
}

fn boxed(context: &Context, node: Node) -> Option<bool> {
    match context.resolver.type_of(node)? {
        Type::Class(name, _) => match name.as_str() {
            "java.lang.Boolean" => Some(true),
            "java.lang.Integer" | "java.lang.Long" | "java.lang.Double" | "java.lang.Float" | "java.lang.Short" | "java.lang.Byte" | "java.lang.Character" => Some(false),
            _ => None,
        },
        _ => None,
    }
}

impl<'c, 't> Stream<'c, 't> {
    pub fn new(context: &'c Context<'t>) -> Self {
        Stream { context, open: Window::default(), closed: Vec::new(), nulls: 0, reached: Vec::new() }
    }

    fn reset(&mut self) {
        self.open = Window::default();
        self.closed.clear();
        self.nulls = 0;
    }

    fn close(&mut self, by_call: bool) {
        let window = Window { by_call, ..self.open };
        self.nulls += usize::from(window.null && !window.by_call);
        self.closed.push(window);
        self.open = Window::default();
    }

    /// A value used where javac needs a primitive: a boxed one is unboxed by a call.
    fn unboxed(&mut self, node: Node<'t>) {
        match boxed(self.context, node) {
            Some(true) => self.close(true),
            Some(false) => self.open.call = true,
            None => {}
        }
    }

    fn operand(&mut self, node: Node<'t>, condition: bool) {
        self.walk(node, condition);
        self.unboxed(node);
    }

    pub fn walk(&mut self, node: Node<'t>, condition: bool) {
        let context = self.context;
        match node.kind() {
            kind if SKIPPED.contains(&kind) => {
                if kind == "lambda_expression" {
                    self.open.call = true;
                }
            }
            "parenthesized_expression" => {
                for part in named_children(node) {
                    self.walk(part, condition);
                }
            }
            "if_statement" => {
                node.child_by_field_name("condition").into_iter().for_each(|test| self.operand(test, true));
                let consequence = node.child_by_field_name("consequence");
                consequence.into_iter().for_each(|then| self.walk(then, false));
                if let Some(alternative) = node.child_by_field_name("alternative") {
                    if !consequence.is_some_and(ends_abruptly) {
                        self.reset();
                    }
                    self.walk(alternative, false);
                }
            }
            "while_statement" | "for_statement" => {
                let mut cursor = node.walk();
                let starts: Vec<Node> = node.children_by_field_name("init", &mut cursor).collect();
                starts.into_iter().for_each(|start| self.walk(start, false));
                node.child_by_field_name("condition").into_iter().for_each(|test| self.operand(test, true));
                node.child_by_field_name("body").into_iter().for_each(|body| self.walk(body, false));
                let mut cursor = node.walk();
                let updates: Vec<Node> = node.children_by_field_name("update", &mut cursor).collect();
                updates.into_iter().for_each(|update| self.walk(update, false));
                self.reset();
            }
            "enhanced_for_statement" => {
                let iterated = node.child_by_field_name("value");
                iterated.into_iter().for_each(|value| self.walk(value, false));
                if iterated.is_some_and(|value| matches!(context.resolver.type_of(value), Some(Type::Array(_)))) {
                    self.open.array = true;
                } else {
                    self.open.call = true;
                    self.close(true);
                    self.open.call = true;
                }
                node.child_by_field_name("body").into_iter().for_each(|body| self.walk(body, false));
                self.reset();
            }
            "do_statement" => {
                node.child_by_field_name("body").into_iter().for_each(|body| self.walk(body, false));
                node.child_by_field_name("condition").into_iter().for_each(|test| self.operand(test, true));
            }
            "assert_statement" => {
                if let Some(test) = named_children(node).into_iter().next() {
                    self.operand(test, true);
                }
                named_children(node).into_iter().skip(1).for_each(|part| self.walk(part, false));
            }
            "switch_expression" if constant_switch(context, node) => {
                node.child_by_field_name("condition").into_iter().for_each(|value| self.operand(value, false));
                self.close(false);
            }
            kind if RESETS.contains(&kind) => {
                self.reset();
                for part in named_children(node) {
                    self.walk(part, false);
                    if !part.kind().ends_with("expression") && !part.kind().ends_with("identifier") {
                        self.reset();
                    }
                }
                self.reset();
            }
            "ternary_expression" => {
                node.child_by_field_name("condition").into_iter().for_each(|test| self.operand(test, true));
                let consequence = node.child_by_field_name("consequence");
                consequence.into_iter().for_each(|value| self.walk(value, condition));
                let constant = consequence.is_some_and(|value| constant_branch(context, value));
                if !constant {
                    self.reset();
                }
                let materialized = consequence.is_some_and(|value| matches!(context.text(unwrap(value)), "1" | "true")) && (node.child_by_field_name("alternative").is_some_and(|value| matches!(context.text(unwrap(value)), "0" | "false")) || null_test(context, node.child_by_field_name("condition")));
                node.child_by_field_name("alternative").into_iter().for_each(|value| self.walk(value, condition));
                if materialized && !condition {
                    self.close(false);
                }

            }
            "unary_expression" if operator(context, node) == "!" => {
                named_children(node).into_iter().for_each(|part| self.operand(part, true));
                if !condition {
                    self.close(false);
                }
            }
            "binary_expression" => self.binary(node, condition),
            "assignment_expression" => {
                let (left, right) = (node.child_by_field_name("left"), node.child_by_field_name("right"));
                left.filter(|left| left.kind() != "identifier").into_iter().for_each(|left| self.walk_target(left));
                right.into_iter().for_each(|right| self.walk(right, false));
                if operator(context, node) == "&=" && left.is_some_and(|left| boolean(context, left)) {
                    self.reached(node);
                }
            }
            "instanceof_expression" => {
                named_children(node).into_iter().take(1).for_each(|part| self.walk(part, false));
            }
            "method_invocation" | "object_creation_expression" | "explicit_constructor_invocation" => {
                for part in named_children(node) {
                    if part.kind() != "class_body" && !(node.kind() == "method_invocation" && Some(part) == node.child_by_field_name("name")) {
                        self.walk(part, false);
                    }
                }
                self.invoked(node);
            }
            "array_access" => {
                named_children(node).into_iter().for_each(|part| self.operand(part, false));
                self.open.array = true;
            }
            _ => {
                for part in named_children(node) {
                    self.walk(part, false);
                }
            }
        }
    }

    fn walk_target(&mut self, target: Node<'t>) {
        match target.kind() {
            "array_access" => named_children(target).into_iter().for_each(|part| self.operand(part, false)),
            "field_access" => target.child_by_field_name("object").into_iter().for_each(|object| self.walk(object, false)),
            _ => {}
        }
    }

    fn invoked(&mut self, call: Node<'t>) {
        let context = self.context;
        if call.kind() == "method_invocation" && boolean(context, call) {
            self.close(true);
            return;
        }
        let length = call.kind() == "method_invocation"
            && call.child_by_field_name("name").is_some_and(|name| context.text(name) == "length")
            && call.child_by_field_name("object").and_then(|object| context.resolver.type_of(object)).is_some_and(|kind| kind.erased().name() == "java.lang.String");
        if !length {
            self.open.call = true;
        }
    }

    fn binary(&mut self, node: Node<'t>, condition: bool) {
        let context = self.context;
        let op = operator(context, node);
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
        if LOGICAL.contains(&op) {
            self.operand(left, true);
            self.operand(right, true);
            if !condition {
                self.close(false);
            }
            return;
        }
        let primitive = |side: Node| matches!(context.resolver.type_of(side), Some(Type::Primitive(_)));
        let references = matches!(op, "==" | "!=") && !primitive(left) && !primitive(right);
        for side in [left, right] {
            if references {
                self.walk(side, false);
            } else {
                self.operand(side, false);
            }
        }
        if COMPARISONS.contains(&op) {
            let null = [left, right].iter().any(|side| unwrap(*side).kind() == "null_literal");
            if null {
                self.open.null = true;
            }
            if !condition {
                self.close(false);
            }
            return;
        }
        let integral = matches!(context.resolver.type_of(node), Some(Type::Primitive("int" | "long" | "short" | "byte" | "char")));
        if matches!(op, "/" | "%") && integral {
            self.open.array = true;
        }
        if op == "+" && context.resolver.type_of(node).is_some_and(|kind| kind.erased().name() == "java.lang.String") {
            self.open.call = true;
        }
        let truth = |side: Node| matches!(context.resolver.type_of(side), Some(Type::Primitive("boolean"))) || boxed(context, side) == Some(true);
        let integral = |side: Node| matches!(context.resolver.type_of(side), Some(Type::Primitive(kind)) if kind != "boolean") || boxed(context, side) == Some(false);
        if matches!(op, "&" | "|") && (truth(left) || truth(right)) && !integral(left) && !integral(right) {
            self.reached(node);
        }
    }

    fn reached(&mut self, op: Node<'t>) {
        let counted = |window: &Window| window.null && !window.by_call;
        let now = self.closed.last().copied();
        let null_before = self.nulls > usize::from(now.as_ref().is_some_and(counted));
        let before = self.closed.len().checked_sub(2).map(|at| self.closed[at]);
        self.reached.push(Reached { op, now, before, null_before });
    }
}
