//! Lowers a body to basic blocks. Each block lists the nodes evaluated in it, in evaluation order: every
//! expression after its operands, plus the declarations that bind a name. `&&`, `||`, `!`, `?:` and `switch`
//! become branches, so a fact learnt from a test holds only on the side it was learnt on.
use crate::engine::source::{SourceFile, children, named_children};
use std::collections::HashMap;
use tree_sitter::Node;

pub enum Exit<'t> {
    End,
    Jump(usize),
    /// A test that was evaluated as the last step: where to go when it holds and when it does not.
    Branch(Node<'t>, usize, usize),
    Any(Vec<usize>),
}

/// A handler block and the types it catches; no types means everything (a `finally`).
#[derive(Clone)]
pub struct Catch<'t> {
    pub block: usize,
    pub types: Vec<Node<'t>>,
}

fn caught<'t>(clause: Node<'t>) -> Vec<Node<'t>> {
    let parameter = children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter");
    let listed = parameter.and_then(|parameter| children(parameter).into_iter().find(|part| part.kind() == "catch_type"));
    listed.map(named_children).unwrap_or_default()
}

pub struct Block<'t> {
    pub steps: Vec<Node<'t>>,
    pub exit: Exit<'t>,
    /// Handler blocks an exception thrown in this block can reach.
    /// Enclosing `try` statements, innermost first, each with its handlers in order.
    pub catches: Vec<Vec<Catch<'t>>>,
    /// A `finally` body is lowered once for leaving normally and once for leaving by an exception; blocks of
    /// the second lowering carry their own number, so the same node can hold a value per lowering.
    pub copy: usize,
}

pub struct Cfg<'t> {
    pub blocks: Vec<Block<'t>>,
    /// For a `switch` used as a value: the expressions that give its result.
    pub results: HashMap<usize, Vec<Node<'t>>>,
}

struct Target {
    label: Option<String>,
    breaks: usize,
    continues: Option<usize>,
    /// A plain `break` stops here: loops and switches, not labelled blocks.
    plain: bool,
}

struct Builder<'t, 'f> {
    file: &'f SourceFile,
    guards: &'f dyn Fn(Node) -> bool,
    cfg: Cfg<'t>,
    current: usize,
    targets: Vec<Target>,
    handlers: Vec<Vec<Catch<'t>>>,
    label: Option<String>,
    switches: Vec<(usize, usize)>,
    copy: usize,
    copies: usize,
}

const TYPE_PARTS: &[&str] = &[
    "type_identifier", "generic_type", "scoped_type_identifier", "integral_type", "floating_point_type", "boolean_type", "void_type",
    "array_type", "dimensions", "type_arguments", "annotation", "marker_annotation", "modifiers", "class_body", "annotated_type",
    "line_comment", "block_comment", "type_parameters", "superclass", "super_interfaces",
];
const NESTED: &[&str] =
    &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

pub fn unwrap(mut node: Node) -> Node {
    while node.kind() == "parenthesized_expression" {
        match named_children(node).into_iter().find(|inner| !inner.kind().ends_with("comment")) {
            Some(inner) => node = inner,
            None => break,
        }
    }
    node
}

/// The graph of a method, constructor or initializer body, a lambda body, or a field's initial value.
/// `guards` names the calls that throw unless their first argument holds (Guava's `checkState`, for instance).
pub fn build<'t>(file: &SourceFile, body: Node<'t>, guards: &dyn Fn(Node) -> bool) -> Cfg<'t> {
    let mut builder = Builder {
        file,
        guards,
        cfg: Cfg { blocks: Vec::new(), results: HashMap::new() },
        current: 0,
        targets: Vec::new(),
        handlers: Vec::new(),
        label: None,
        switches: Vec::new(),
        copy: 0,
        copies: 0,
    };
    builder.block();
    if matches!(body.kind(), "block" | "constructor_body") {
        builder.statement(body);
    } else {
        builder.expression(body);
    }
    builder.cfg
}

impl<'t> Builder<'t, '_> {
    fn block(&mut self) -> usize {
        let catches = self.handlers.iter().rev().cloned().collect();
        self.cfg.blocks.push(Block { steps: Vec::new(), exit: Exit::End, catches, copy: self.copy });
        self.cfg.blocks.len() - 1
    }
    fn step(&mut self, node: Node<'t>) {
        self.cfg.blocks[self.current].steps.push(node);
    }
    fn leave(&mut self, exit: Exit<'t>) {
        self.cfg.blocks[self.current].exit = exit;
    }
    fn jump(&mut self, to: usize) {
        self.leave(Exit::Jump(to));
    }
    /// After a statement that does not fall through: what follows cannot be reached.
    fn dead(&mut self) {
        self.current = self.block();
    }
    fn text(&self, node: Node) -> &str {
        self.file.text_of(node)
    }

    fn test(&mut self, node: Node<'t>, holds: usize, fails: usize) {
        let node = unwrap(node);
        let operator = node.child_by_field_name("operator").map(|operator| operator.kind());
        match (node.kind(), operator) {
            ("binary_expression", Some("&&")) => {
                let middle = self.block();
                self.test(node.child_by_field_name("left").expect("left"), middle, fails);
                self.current = middle;
                self.test(node.child_by_field_name("right").expect("right"), holds, fails);
            }
            ("binary_expression", Some("||")) => {
                let middle = self.block();
                self.test(node.child_by_field_name("left").expect("left"), holds, middle);
                self.current = middle;
                self.test(node.child_by_field_name("right").expect("right"), holds, fails);
            }
            ("unary_expression", Some("!")) => self.test(node.child_by_field_name("operand").expect("operand"), fails, holds),
            _ => {
                self.expression(node);
                self.leave(Exit::Branch(node, holds, fails));
            }
        }
    }

    fn joined(&mut self, node: Node<'t>) {
        let (holds, fails, after) = (self.block(), self.block(), self.block());
        self.test(node, holds, fails);
        self.cfg.blocks[holds].exit = Exit::Jump(after);
        self.cfg.blocks[fails].exit = Exit::Jump(after);
        self.current = after;
        self.step(node);
    }

    fn expression(&mut self, node: Node<'t>) {
        let operator = node.child_by_field_name("operator").map(|operator| operator.kind());
        match node.kind() {
            "binary_expression" if matches!(operator, Some("&&" | "||")) => self.joined(node),
            "unary_expression" if operator == Some("!") => self.joined(node),
            "ternary_expression" => {
                let (holds, fails, after) = (self.block(), self.block(), self.block());
                self.test(node.child_by_field_name("condition").expect("condition"), holds, fails);
                for (block, field) in [(holds, "consequence"), (fails, "alternative")] {
                    self.current = block;
                    if let Some(arm) = node.child_by_field_name(field) {
                        self.expression(arm);
                    }
                    self.jump(after);
                }
                self.current = after;
                self.step(node);
            }
            "lambda_expression" => self.step(node),
            "method_reference" => {
                let object = named_children(node).into_iter().next().filter(|object| !TYPE_PARTS.contains(&object.kind()));
                if let Some(object) = object {
                    self.expression(object);
                }
                self.step(node);
            }
            "switch_expression" => self.switch(node),
            "assignment_expression" => {
                let left = node.child_by_field_name("left").expect("left");
                match left.kind() {
                    "field_access" => {
                        if let Some(object) = left.child_by_field_name("object") {
                            self.expression(object);
                        }
                    }
                    "array_access" => {
                        self.parts(left);
                        self.step(left);
                    }
                    _ => {}
                }
                if let Some(right) = node.child_by_field_name("right") {
                    self.expression(right);
                }
                self.step(node);
            }
            "method_invocation" => {
                if let Some(object) = node.child_by_field_name("object") {
                    self.expression(object);
                }
                let arguments = node.child_by_field_name("arguments");
                let first = arguments.map(named_children).unwrap_or_default().into_iter().find(|part| !part.kind().ends_with("comment"));
                match first.filter(|_| (self.guards)(node)) {
                    Some(first) => {
                        let (holds, fails) = (self.block(), self.block());
                        self.test(first, holds, fails);
                        self.current = holds;
                        for part in arguments.map(named_children).unwrap_or_default().into_iter().filter(|part| *part != first) {
                            if !TYPE_PARTS.contains(&part.kind()) {
                                self.expression(part);
                            }
                        }
                    }
                    None => {
                        if let Some(arguments) = arguments {
                            self.parts(arguments);
                        }
                    }
                }
                self.step(node);
            }
            "field_access" => {
                if let Some(object) = node.child_by_field_name("object") {
                    self.expression(object);
                }
                self.step(node);
            }
            "object_creation_expression" => {
                for part in named_children(node) {
                    if part.kind() == "argument_list" {
                        self.parts(part);
                    } else if !TYPE_PARTS.contains(&part.kind()) && node.child_by_field_name("type") != Some(part) {
                        self.expression(part);
                    }
                }
                self.step(node);
            }
            "instanceof_expression" => {
                if let Some(left) = node.child_by_field_name("left") {
                    self.expression(left);
                }
                self.step(node);
            }
            "cast_expression" => {
                if let Some(value) = node.child_by_field_name("value") {
                    self.expression(value);
                }
                self.step(node);
            }
            "identifier" | "this" | "super" | "class_literal" => self.step(node),
            kind if kind.ends_with("_literal") || kind == "true" || kind == "false" => self.step(node),
            _ => {
                self.parts(node);
                self.step(node);
            }
        }
    }

    /// Evaluates the operands inside a node that is not itself a step.
    fn parts(&mut self, node: Node<'t>) {
        for part in named_children(node) {
            if TYPE_PARTS.contains(&part.kind()) {
                continue;
            }
            if matches!(part.kind(), "argument_list" | "dimensions_expr" | "array_initializer" | "element_value_array_initializer") {
                self.parts(part);
            } else {
                self.expression(part);
            }
        }
    }

    fn target(&self, label: Option<&str>, continues: bool) -> Option<usize> {
        self.targets.iter().rev().find_map(|target| {
            let fits = match label {
                Some(label) => target.label.as_deref() == Some(label),
                None => target.plain,
            };
            if !fits {
                return None;
            }
            if continues { target.continues } else { Some(target.breaks) }
        })
    }

    fn looped(&mut self, breaks: usize, continues: usize, body: Option<Node<'t>>) {
        let label = self.label.take();
        self.targets.push(Target { label, breaks, continues: Some(continues), plain: true });
        if let Some(body) = body {
            self.statement(body);
        }
        self.targets.pop();
    }

    fn statement(&mut self, node: Node<'t>) {
        let label = self.label.take();
        let field = |name: &str| node.child_by_field_name(name);
        match node.kind() {
            "block" | "constructor_body" | "switch_block_statement_group" => {
                for child in named_children(node) {
                    if child.kind() != "switch_label" {
                        self.statement(child);
                    }
                }
            }
            "local_variable_declaration" => {
                for declarator in children(node).into_iter().filter(|child| child.kind() == "variable_declarator") {
                    if let Some(value) = declarator.child_by_field_name("value") {
                        self.expression(value);
                    }
                    self.step(declarator);
                }
            }
            "expression_statement" => self.parts(node),
            "if_statement" => {
                let (holds, fails, after) = (self.block(), self.block(), self.block());
                self.test(field("condition").expect("condition"), holds, fails);
                for (block, arm) in [(holds, field("consequence")), (fails, field("alternative"))] {
                    self.current = block;
                    if let Some(arm) = arm {
                        self.statement(arm);
                    }
                    self.jump(after);
                }
                self.current = after;
            }
            "while_statement" => {
                let (head, body, after) = (self.block(), self.block(), self.block());
                self.jump(head);
                self.current = head;
                self.test(field("condition").expect("condition"), body, after);
                self.current = body;
                self.label = label;
                self.looped(after, head, field("body"));
                self.jump(head);
                self.current = after;
            }
            "do_statement" => {
                let (body, tail, after) = (self.block(), self.block(), self.block());
                self.jump(body);
                self.current = body;
                self.label = label;
                self.looped(after, tail, field("body"));
                self.jump(tail);
                self.current = tail;
                self.test(field("condition").expect("condition"), body, after);
                self.current = after;
            }
            "for_statement" => {
                let mut cursor = node.walk();
                let starts: Vec<Node> = node.children_by_field_name("init", &mut cursor).collect();
                for start in starts {
                    if start.kind() == "local_variable_declaration" { self.statement(start) } else { self.expression(start) }
                }
                let (head, body, update, after) = (self.block(), self.block(), self.block(), self.block());
                self.jump(head);
                self.current = head;
                match field("condition") {
                    Some(condition) => self.test(condition, body, after),
                    None => self.jump(body),
                }
                self.current = body;
                self.label = label;
                self.looped(after, update, field("body"));
                self.jump(update);
                self.current = update;
                let mut cursor = node.walk();
                let updates: Vec<Node> = node.children_by_field_name("update", &mut cursor).collect();
                for step in updates {
                    self.expression(step);
                }
                self.jump(head);
                self.current = after;
            }
            "enhanced_for_statement" => {
                if let Some(value) = field("value") {
                    self.expression(value);
                }
                let (head, body, after) = (self.block(), self.block(), self.block());
                self.jump(head);
                self.current = head;
                self.leave(Exit::Any(vec![body, after]));
                self.current = body;
                self.step(node);
                self.label = label;
                self.looped(after, head, field("body"));
                self.jump(head);
                self.current = after;
            }
            "labeled_statement" => {
                let after = self.block();
                let mut parts = named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment"));
                let name = parts.next().map(|name| self.text(name).to_string());
                self.targets.push(Target { label: name.clone(), breaks: after, continues: None, plain: false });
                if let Some(inner) = parts.next() {
                    self.label = name;
                    self.statement(inner);
                }
                self.targets.pop();
                self.jump(after);
                self.current = after;
            }
            "break_statement" | "continue_statement" => {
                let name = named_children(node).into_iter().find(|part| part.kind() == "identifier").map(|name| self.text(name).to_string());
                match self.target(name.as_deref(), node.kind() == "continue_statement") {
                    Some(to) => self.jump(to),
                    None => self.leave(Exit::End),
                }
                self.dead();
            }
            "return_statement" | "throw_statement" => {
                self.parts(node);
                if node.kind() == "throw_statement" {
                    self.step(node);
                }
                self.leave(Exit::End);
                self.dead();
            }
            "yield_statement" => {
                let value = named_children(node).into_iter().find(|part| !part.kind().ends_with("comment"));
                if let Some(value) = value {
                    self.expression(value);
                    if let Some((switch, _)) = self.switches.last() {
                        self.cfg.results.entry(*switch).or_default().push(value);
                    }
                }
                match self.switches.last() {
                    Some((_, after)) => self.jump(*after),
                    None => self.leave(Exit::End),
                }
                self.dead();
            }
            "try_statement" | "try_with_resources_statement" => self.guarded(node),
            "switch_expression" => self.switch(node),
            "synchronized_statement" => {
                for part in named_children(node) {
                    if part.kind() == "block" { self.statement(part) } else { self.expression(part) }
                }
            }
            // Assertions count as switched off, as NullAway assumes by default: the test is never run.
            "assert_statement" => {}
            "explicit_constructor_invocation" => {
                if let Some(arguments) = field("arguments") {
                    self.parts(arguments);
                }
                self.step(node);
            }
            kind if NESTED.contains(&kind) => self.step(node),
            _ => self.parts(node),
        }
    }

    fn guarded(&mut self, node: Node<'t>) {
        let after = self.block();
        let clauses: Vec<Node> = children(node).into_iter().filter(|part| part.kind() == "catch_clause").collect();
        let last = children(node).into_iter().find(|part| part.kind() == "finally_clause");
        let landing = last.map(|_| self.block());
        let thrown = last.map(|_| self.block());
        let handlers: Vec<usize> = clauses.iter().map(|_| self.block()).collect();
        let next = landing.unwrap_or(after);
        let everything = thrown.map(|block| Catch { block, types: Vec::new() });
        let typed = clauses.iter().zip(&handlers).map(|(clause, block)| Catch { block: *block, types: caught(*clause) });
        self.handlers.push(typed.chain(everything.clone()).collect());
        let body = self.block();
        self.jump(body);
        self.current = body;
        if let Some(resources) = node.child_by_field_name("resources") {
            for resource in named_children(resources) {
                if resource.kind() != "resource" {
                    continue;
                }
                match resource.child_by_field_name("value") {
                    Some(value) => {
                        self.expression(value);
                        self.step(resource);
                    }
                    None => self.parts(resource),
                }
            }
        }
        if let Some(body) = node.child_by_field_name("body") {
            self.statement(body);
        }
        self.jump(next);
        self.handlers.pop();
        self.handlers.push(everything.into_iter().collect());
        for (clause, handler) in clauses.iter().zip(&handlers) {
            let inner = self.block();
            self.cfg.blocks[*handler].exit = Exit::Jump(inner);
            self.current = inner;
            if let Some(parameter) = children(*clause).into_iter().find(|part| part.kind() == "catch_formal_parameter") {
                self.step(parameter);
            }
            if let Some(body) = clause.child_by_field_name("body") {
                self.statement(body);
            }
            self.jump(next);
        }
        self.handlers.pop();
        if let (Some(landing), Some(thrown), Some(last)) = (landing, thrown, last) {
            let inner = self.block();
            self.cfg.blocks[landing].exit = Exit::Jump(inner);
            self.current = inner;
            for part in named_children(last) {
                self.statement(part);
            }
            self.jump(after);
            let outer = self.copy;
            self.copies += 1;
            self.copy = self.copies;
            let inner = self.block();
            self.cfg.blocks[thrown].exit = Exit::Jump(inner);
            self.current = inner;
            for part in named_children(last) {
                self.statement(part);
            }
            self.leave(Exit::End);
            self.copy = outer;
        }
        self.current = after;
    }

    fn switch(&mut self, node: Node<'t>) {
        if let Some(condition) = node.child_by_field_name("condition") {
            self.expression(condition);
        }
        let head = self.current;
        let after = self.block();
        let cases: Vec<Node> = node.child_by_field_name("body").map(named_children).unwrap_or_default();
        let cases: Vec<Node> = cases.into_iter().filter(|case| matches!(case.kind(), "switch_block_statement_group" | "switch_rule")).collect();
        let blocks: Vec<usize> = cases.iter().map(|_| self.block()).collect();
        let total = cases.iter().any(|case| {
            children(*case).into_iter().filter(|part| part.kind() == "switch_label").any(|label| self.text(label).starts_with("default") || self.text(label).contains("default"))
        });
        let rules = cases.iter().any(|case| case.kind() == "switch_rule");
        let mut exits = blocks.clone();
        if !total && !rules {
            exits.push(after);
        }
        if exits.is_empty() {
            exits.push(after);
        }
        self.cfg.blocks[head].exit = Exit::Any(exits);
        self.targets.push(Target { label: None, breaks: after, continues: None, plain: true });
        self.switches.push((node.id(), after));
        for (position, case) in cases.iter().enumerate() {
            self.current = blocks[position];
            for label in children(*case).into_iter().filter(|part| part.kind() == "switch_label") {
                self.step(label);
            }
            if case.kind() == "switch_rule" {
                for part in named_children(*case).into_iter().filter(|part| part.kind() != "switch_label") {
                    match part.kind() {
                        "expression_statement" => {
                            self.parts(part);
                            let value = named_children(part).into_iter().find(|value| !value.kind().ends_with("comment"));
                            self.cfg.results.entry(node.id()).or_default().extend(value);
                        }
                        _ => self.statement(part),
                    }
                }
                self.jump(after);
            } else {
                self.statement(*case);
                self.jump(blocks.get(position + 1).copied().unwrap_or(after));
            }
        }
        self.switches.pop();
        self.targets.pop();
        self.current = after;
        self.step(node);
    }
}
