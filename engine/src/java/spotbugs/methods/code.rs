//! The instructions javac writes for a method body, in their order in the class file, reduced to the kinds that
//! FindNakedNotify tells apart. Jumps to the next instruction are left out, as javac leaves them out.
use super::super::{Context, folds};
use super::ends::{completes, has};
use crate::engine::source::{children, named_children};
use crate::java::helpers::declarators;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

/// A jump whose target is never the next instruction: a jump back, or one past code that follows.
pub const AWAY: usize = usize::MAX;

#[derive(Clone, Copy, PartialEq)]
pub enum Op<'a> {
    /// Pushes a local variable, `this` or a static field.
    Load,
    /// Reads a field of the object on the stack.
    Field,
    /// `notify()` or `notifyAll()` called with `invokevirtual`, at its argument list, whose `(` gives the line.
    Notify(Node<'a>),
    /// Any other instruction.
    Other,
    /// Code this model does not follow: taken for a read.
    Kill,
    Return,
    Goto(usize),
    Label(usize),
    Enter,
    Exit,
}

pub(super) enum Frame<'a> {
    Sync,
    Finally(Node<'a>),
    /// A loop, switch or labelled statement: its label, end and continue targets.
    Jumps(Option<String>, usize, Option<usize>),
}

pub struct Code<'c, 'a> {
    pub context: &'c Context<'a>,
    pub ops: Vec<Op<'a>>,
    pub(super) frames: Vec<Frame<'a>>,
    labels: usize,
    /// The method has no `this`.
    pub is_static: bool,
}

impl<'c, 'a> Code<'c, 'a> {
    pub fn new(context: &'c Context<'a>, is_static: bool) -> Self {
        Code { context, ops: Vec::new(), frames: Vec::new(), labels: 0, is_static }
    }

    pub fn push(&mut self, op: Op<'a>) {
        self.ops.push(op);
    }

    fn label(&mut self) -> usize {
        self.labels += 1;
        self.labels
    }

    pub(super) fn place(&mut self, label: usize) {
        if let Some(last) = self.ops.iter().rposition(|op| !matches!(op, Op::Label(_))) {
            if self.ops[last] == Op::Goto(label) {
                self.ops.remove(last);
            }
        }
        self.ops.push(Op::Label(label));
    }

    pub fn statement(&mut self, node: Node<'a>) {
        let field = |name: &str| node.child_by_field_name(name);
        match node.kind() {
            "block" | "constructor_body" => named_children(node).into_iter().for_each(|part| self.statement(part)),
            "local_variable_declaration" => {
                for value in declarators(node).into_iter().filter_map(|declarator| declarator.child_by_field_name("value")) {
                    self.value(value);
                    self.push(Op::Other);
                }
            }
            "expression_statement" => {
                if let Some(expression) = node.named_child(0) {
                    self.effect(expression);
                }
            }
            "if_statement" => self.branch(node),
            "while_statement" => self.looped(node, field("condition"), &[], &[]),
            "for_statement" => {
                let mut cursor = node.walk();
                let init: Vec<Node> = node.children_by_field_name("init", &mut cursor).collect();
                let mut cursor = node.walk();
                let update: Vec<Node> = node.children_by_field_name("update", &mut cursor).collect();
                self.looped(node, field("condition"), &init, &update);
            }
            "do_statement" => {
                let (end, next) = (self.label(), self.label());
                self.frames.push(Frame::Jumps(None, end, Some(next)));
                self.statement_of(field("body"));
                self.frames.pop();
                self.place(next);
                match folds::fixed(self.context, field("condition")) {
                    Some(true) => self.push(Op::Goto(AWAY)),
                    _ => {
                        self.value_of(field("condition"));
                        self.push(Op::Other);
                    }
                }
                self.place(end);
            }
            "enhanced_for_statement" => {
                let (end, next) = (self.label(), self.label());
                self.push(Op::Kill);
                self.frames.push(Frame::Jumps(None, end, Some(next)));
                self.statement_of(field("body"));
                self.frames.pop();
                self.place(next);
                self.push(Op::Other);
                self.push(Op::Goto(AWAY));
                self.place(end);
            }
            "labeled_statement" => {
                let name = node.named_child(0).map(|name| self.context.text(name).to_string());
                let end = self.label();
                self.frames.push(Frame::Jumps(name, end, None));
                named_children(node).into_iter().skip(1).for_each(|part| self.statement(part));
                self.frames.pop();
                self.place(end);
            }
            "synchronized_statement" => self.guarded(node.named_child(0), field("body")),
            "try_statement" => self.attempt(node),
            "try_with_resources_statement" => {
                self.push(Op::Kill);
                self.statement_of(field("body"));
                self.push(Op::Kill);
            }
            "return_statement" => match node.named_child(0) {
                Some(value) => {
                    self.value(value);
                    self.unwind(0);
                    self.push(Op::Other);
                }
                None => {
                    self.unwind(0);
                    self.push(Op::Return);
                }
            },
            "break_statement" | "continue_statement" => self.jump(node),
            "throw_statement" => {
                self.value_of(node.named_child(0));
                self.push(Op::Other);
            }
            "switch_expression" => self.switch(node),
            "explicit_constructor_invocation" => {
                self.push(Op::Load);
                self.arguments(field("arguments"));
                self.push(Op::Other);
            }
            ";" | "empty_statement" | "line_comment" | "block_comment" => {}
            kind if TYPE_DECLARATIONS.contains(&kind) => {}
            _ => self.push(Op::Kill),
        }
    }

    pub(super) fn statement_of(&mut self, node: Option<Node<'a>>) {
        if let Some(node) = node {
            self.statement(node);
        }
    }

    /// A `synchronized` block; without a lock expression, Lombok's `@Synchronized`, which locks a field it writes.
    pub fn guarded(&mut self, lock: Option<Node<'a>>, body: Option<Node<'a>>) {
        let end = self.label();
        match lock {
            Some(lock) => self.value(lock),
            None => self.ops.extend([Op::Load, Op::Field]),
        }
        self.push(Op::Other);
        self.push(Op::Enter);
        self.frames.push(Frame::Sync);
        self.statement_of(body);
        self.frames.pop();
        if body.is_some_and(|body| completes(self.context, body)) {
            self.ops.extend([Op::Load, Op::Exit, Op::Goto(end)]);
        }
        self.ops.extend([Op::Other, Op::Load, Op::Exit, Op::Load, Op::Other]);
        self.place(end);
    }

    fn branch(&mut self, node: Node<'a>) {
        let (condition, then, otherwise) = (node.child_by_field_name("condition"), node.child_by_field_name("consequence"), node.child_by_field_name("alternative"));
        match folds::fixed(self.context, condition) {
            Some(true) => self.statement_of(then),
            Some(false) => self.statement_of(otherwise),
            None => {
                self.value_of(condition);
                self.push(Op::Other);
                self.statement_of(then);
                if let Some(otherwise) = otherwise {
                    let end = self.label();
                    if then.is_some_and(|then| completes(self.context, then)) {
                        self.push(Op::Goto(end));
                    }
                    self.statement(otherwise);
                    self.place(end);
                }
            }
        }
    }

    /// `while` and `for`: javac tests the condition at the top and jumps back from the bottom.
    fn looped(&mut self, node: Node<'a>, condition: Option<Node<'a>>, init: &[Node<'a>], update: &[Node<'a>]) {
        for part in init {
            if part.kind() == "local_variable_declaration" { self.statement(*part) } else { self.effect(*part) }
        }
        let (end, next) = (self.label(), self.label());
        let endless = condition.is_none() || folds::fixed(self.context, condition) == Some(true);
        if !endless {
            self.value_of(condition);
            self.push(Op::Other);
        }
        let body = node.child_by_field_name("body");
        self.frames.push(Frame::Jumps(None, end, Some(next)));
        self.statement_of(body);
        self.frames.pop();
        self.place(next);
        if body.is_none_or(|body| completes(self.context, body) || has(body, "continue_statement")) {
            update.iter().for_each(|part| self.effect(*part));
            self.push(Op::Goto(AWAY));
        }
        self.place(end);
    }

    fn attempt(&mut self, node: Node<'a>) {
        let parts = children(node);
        let catches: Vec<Node> = parts.iter().copied().filter(|part| part.kind() == "catch_clause").collect();
        let finally = parts.iter().find(|part| part.kind() == "finally_clause").and_then(|clause| named_children(*clause).into_iter().find(|part| part.kind() == "block"));
        let finally = finally.filter(|block| named_children(*block).iter().any(|part| !part.kind().ends_with("comment")));
        let end = self.label();
        let depth = self.frames.len();
        if let Some(block) = finally {
            self.frames.push(Frame::Finally(block));
        }
        let body = node.child_by_field_name("body");
        self.statement_of(body);
        let handled = !catches.is_empty() || finally.is_some();
        if body.is_some_and(|body| completes(self.context, body)) {
            self.inline(depth, finally);
            if handled {
                self.push(Op::Goto(end));
            }
        }
        for clause in &catches {
            self.push(Op::Other);
            let block = clause.child_by_field_name("body");
            self.statement_of(block);
            if block.is_some_and(|block| completes(self.context, block)) {
                self.inline(depth, finally);
                self.push(Op::Goto(end));
            }
        }
        self.frames.truncate(depth);
        if let Some(block) = finally {
            self.push(Op::Other);
            self.statement(block);
            self.ops.extend([Op::Load, Op::Other]);
        }
        self.place(end);
    }

    fn switch(&mut self, node: Node<'a>) {
        self.value_of(node.child_by_field_name("condition"));
        self.push(Op::Kill);
        let end = self.label();
        self.frames.push(Frame::Jumps(None, end, None));
        for part in node.child_by_field_name("body").map(named_children).unwrap_or_default() {
            let rule = part.kind() == "switch_rule";
            for statement in named_children(part).into_iter().filter(|statement| statement.kind() != "switch_label") {
                if rule && !statement.kind().ends_with("statement") && statement.kind() != "block" {
                    self.effect(statement);
                } else {
                    self.statement(statement);
                }
            }
            if rule {
                self.push(Op::Goto(end));
            }
        }
        self.frames.pop();
        self.place(end);
    }
}
