//! The local variables of a method as javac lays them out: the slot each one gets (parameters first, then each
//! local where it is declared, a slot freed when its block ends, long and double taking two), the hidden slots
//! javac adds (the copies and counters of a `for` loop over an array or the iterator of one over a collection,
//! the two of a `switch` on strings or patterns, the lock of a `synchronized` block), and how many stores each
//! slot gets. Names are resolved here too, so that a variable is the declaration it stands for.
use super::super::Context;
use crate::engine::source::{children, named_children};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::Type;
use std::collections::HashMap;
use tree_sitter::Node;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Kind {
    Parameter,
    Local,
    Catch,
    Pattern,
    Resource,
    Each,
}

pub struct Var<'a> {
    pub decl: Node<'a>,
    pub name: String,
    pub slot: u16,
    pub kind: Kind,
    pub ty: Option<Type>,
    /// A `final` primitive or `String` local with a constant value: javac writes the value where it is read.
    pub constant: bool,
}

#[derive(Default)]
pub struct Layout<'a> {
    pub vars: Vec<Var<'a>>,
    /// Identifier node to the variable it reads or writes.
    pub uses: HashMap<usize, usize>,
    /// Declaration node (declarator, parameter, pattern, ...) to its variable.
    pub decls: HashMap<usize, usize>,
    /// Store instructions per slot, a parameter counting one for the value it comes in with.
    pub stores: HashMap<u16, u32>,
    pub increments: HashMap<u16, u32>,
    /// The hidden slots a `for` loop over an array or a collection writes, by the loop's node.
    pub hidden: HashMap<usize, Vec<u16>>,
}

pub fn wide(ty: &Option<Type>) -> bool {
    matches!(ty, Some(Type::Primitive("long" | "double")))
}

pub(super) struct Walker<'c, 'a> {
    pub(super) context: &'c Context<'a>,
    pub(super) layout: Layout<'a>,
    pub(super) next: u16,
    pub(super) scope: Vec<(String, Option<usize>)>,
    pub(super) times: u32,
}

/// Lays out bodies run one after the other. `hidden` is the number of slots javac puts before the written parameters (the enclosing
/// instance of an inner class, an enum constant's name and position); `locked` adds the lock of Lombok's `@Synchronized`.
pub fn layout<'a>(context: &Context<'a>, bodies: &[Node<'a>], parameters: &[Node<'a>], fixed: bool, hidden: u16, locked: bool) -> Layout<'a> {
    let mut walker = Walker { context, layout: Layout::default(), next: if fixed { 0 } else { 1 } + hidden, scope: Vec::new(), times: 1 };
    for parameter in parameters {
        let (name, written) = match parameter.kind() {
            "spread_parameter" => {
                let declarator = children(*parameter).into_iter().find(|part| part.kind() == "variable_declarator");
                (declarator.and_then(|part| part.child_by_field_name("name")), None)
            }
            _ => (parameter.child_by_field_name("name"), parameter.child_by_field_name("type")),
        };
        let Some(name) = name else { continue };
        let ty = match written {
            Some(written) => context.resolver.type_node(written).map(|kind| with_dimensions(context, *parameter, kind)),
            None => Some(Type::Array(Box::new(Type::class("java.lang.Object")))),
        };
        let var = walker.declare(*parameter, name, ty, Kind::Parameter);
        walker.count(walker.layout.vars[var].slot, false);
    }
    if locked {
        let lock = walker.hide(1);
        walker.count(lock[0], false);
    }
    bodies.iter().for_each(|body| walker.statement(*body));
    walker.layout
}

fn with_dimensions(context: &Context, holder: Node, mut kind: Type) -> Type {
    if let Some(dimensions) = holder.child_by_field_name("dimensions") {
        for _ in 0..context.text(dimensions).matches('[').count() {
            kind = Type::Array(Box::new(kind));
        }
    }
    kind
}

/// Pattern variables an expression declares, outside lambdas, classes and `switch` bodies inside it.
fn bindings<'a>(node: Node<'a>, out: &mut Vec<(Node<'a>, Node<'a>, Option<Node<'a>>)>) {
    match node.kind() {
        "lambda_expression" | "class_body" | "switch_block" => return,
        "instanceof_expression" => {
            if let Some(name) = node.child_by_field_name("name") {
                out.push((node, name, node.child_by_field_name("right")));
            }
        }
        "type_pattern" | "record_pattern_component" => {
            let name = children(node).into_iter().filter(|part| part.kind() == "identifier").last();
            if let Some(name) = name {
                out.push((node, name, node.named_child(0).filter(|written| written.kind() != "identifier")));
            }
        }
        _ => {}
    }
    for part in children(node) {
        bindings(part, out);
    }
}

impl<'a> Walker<'_, 'a> {
    pub(super) fn declare(&mut self, decl: Node<'a>, name: Node<'a>, ty: Option<Type>, kind: Kind) -> usize {
        let index = self.layout.vars.len();
        let slot = self.next;
        self.next += if wide(&ty) { 2 } else { 1 };
        let name = self.context.text(name).to_string();
        self.layout.vars.push(Var { decl, name: name.clone(), slot, kind, ty, constant: false });
        self.layout.decls.insert(decl.id(), index);
        self.scope.push((name, Some(index)));
        index
    }

    pub(super) fn count(&mut self, slot: u16, increment: bool) {
        *self.layout.stores.entry(slot).or_default() += self.times;
        if increment {
            *self.layout.increments.entry(slot).or_default() += self.times;
        }
    }

    pub(super) fn hide(&mut self, slots: u16) -> Vec<u16> {
        let first = self.next;
        self.next += slots;
        (first..first + slots).collect()
    }

    pub(super) fn scoped(&mut self, node: Node<'a>) {
        let (next, depth) = (self.next, self.scope.len());
        self.statement(node);
        self.next = next;
        self.scope.truncate(depth);
    }

    /// Declares the pattern variables of a statement's expressions before the statement, as javac hoists them.
    pub(super) fn hoist(&mut self, node: Node<'a>) {
        let mut found = Vec::new();
        bindings(node, &mut found);
        for (decl, name, written) in found {
            let ty = written.and_then(|written| self.context.resolver.type_node(written));
            self.declare(decl, name, ty, Kind::Pattern);
        }
    }

    pub(super) fn statement(&mut self, node: Node<'a>) {
        let field = |name: &str| node.child_by_field_name(name);
        match node.kind() {
            "block" | "constructor_body" => {
                let (next, depth) = (self.next, self.scope.len());
                named_children(node).into_iter().for_each(|child| self.statement(child));
                self.next = next;
                self.scope.truncate(depth);
            }
            "local_variable_declaration" => {
                self.hoist(node);
                let fixed = has_modifier(node, "final");
                for declarator in declarators(node) {
                    let Some(name) = declarator.child_by_field_name("name") else { continue };
                    let value = declarator.child_by_field_name("value");
                    let written = node.child_by_field_name("type");
                    let inferred = written.is_some_and(|written| self.context.text(written) == "var");
                    let ty = match (inferred, value) {
                        (true, Some(value)) => self.context.resolver.type_of(value),
                        _ => self.context.resolver.declared_type(node, Some(declarator)),
                    };
                    let index = self.declare(declarator, name, ty, Kind::Local);
                    if let Some(value) = value {
                        self.scope.pop();
                        self.expression(value);
                        self.scope.push((self.layout.vars[index].name.clone(), Some(index)));
                        let slot = self.layout.vars[index].slot;
                        self.count(slot, false);
                    }
                    self.layout.vars[index].constant = fixed && super::value::constant_local(self.context, &self.layout, declarator);
                }
            }
            "if_statement" | "while_statement" => {
                let (next, depth) = (self.next, self.scope.len());
                let condition = field("condition");
                if let Some(condition) = condition {
                    self.hoist(condition);
                    self.expression(condition);
                }
                for arm in [field("consequence"), field("body"), field("alternative")].into_iter().flatten() {
                    self.scoped(arm);
                }
                if !escapes(self.context, node) {
                    self.next = next;
                    self.scope.truncate(depth);
                }
            }
            "for_statement" => {
                let (next, depth) = (self.next, self.scope.len());
                let mut cursor = node.walk();
                let starts: Vec<Node> = node.children_by_field_name("init", &mut cursor).collect();
                for start in starts {
                    if start.kind() == "local_variable_declaration" { self.statement(start) } else { self.expression(start) }
                }
                field("condition").into_iter().for_each(|condition| self.expression(condition));
                field("body").into_iter().for_each(|body| self.scoped(body));
                let mut cursor = node.walk();
                let updates: Vec<Node> = node.children_by_field_name("update", &mut cursor).collect();
                updates.into_iter().for_each(|update| self.expression(update));
                self.next = next;
                self.scope.truncate(depth);
            }
            "enhanced_for_statement" => self.each(node),
            "do_statement" => {
                field("body").into_iter().for_each(|body| self.scoped(body));
                field("condition").into_iter().for_each(|condition| self.expression(condition));
            }
            "labeled_statement" => named_children(node).into_iter().filter(|part| part.kind() != "identifier").for_each(|part| self.statement(part)),
            "try_statement" | "try_with_resources_statement" => self.guarded(node),
            "switch_expression" => self.switch(node),
            "synchronized_statement" => {
                let (next, depth) = (self.next, self.scope.len());
                named_children(node).into_iter().filter(|part| part.kind() != "block").for_each(|part| self.expression(part));
                let lock = self.hide(1);
                self.count(lock[0], false);
                if let Some(held) = named_children(node).into_iter().find(|part| part.kind() == "parenthesized_expression") {
                    self.layout.hidden.insert(held.id(), lock);
                }
                field("body").into_iter().for_each(|body| self.statement(body));
                self.next = next;
                self.scope.truncate(depth);
            }
            "class_declaration" | "record_declaration" | "enum_declaration" | "interface_declaration" => self.foreign(node),
            _ => {
                let (next, depth) = (self.next, self.scope.len());
                self.hoist(node);
                named_children(node).into_iter().for_each(|part| self.expression(part));
                self.next = next;
                self.scope.truncate(depth);
            }
        }
    }

}

/// Whether the pattern variables of an `if` stay in scope after it: `if (!(o instanceof T t)) return;`.
fn escapes(context: &Context, node: Node) -> bool {
    if node.kind() != "if_statement" || node.child_by_field_name("alternative").is_some() {
        return false;
    }
    let negated = node.child_by_field_name("condition").is_some_and(|condition| context.text(condition).trim_start_matches('(').trim_start().starts_with('!'));
    let mut found = Vec::new();
    if let Some(condition) = node.child_by_field_name("condition") {
        bindings(condition, &mut found);
    }
    negated && !found.is_empty() && node.child_by_field_name("consequence").is_some_and(|arm| !completes(arm))
}

/// Whether a statement can finish and let the code after it run.
pub(super) fn completes(node: Node) -> bool {
    match node.kind() {
        "return_statement" | "throw_statement" | "break_statement" | "continue_statement" | "yield_statement" => false,
        "synchronized_statement" => node.child_by_field_name("body").is_none_or(completes),
        "block" => named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).last().is_none_or(completes),
        "if_statement" => match (node.child_by_field_name("consequence"), node.child_by_field_name("alternative")) {
            (Some(then), Some(other)) => completes(then) || completes(other),
            _ => true,
        },
        _ => true,
    }
}
