//! The code of one constructor in the order javac compiles it, as the field reads, field writes and calls that
//! decide UR_UNINIT_READ. Lambdas and classes declared inside are code of their own and are skipped.
use super::super::super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::TYPE_DECLARATIONS;
use std::collections::HashSet;

const NAMES: [&str; 4] = ["labeled_statement", "break_statement", "continue_statement", "type_pattern"];
use tree_sitter::Node;

/// A read of a field of the class through `this` that no write and no call came before.
pub struct Read<'a> {
    pub node: Node<'a>,
    pub field: String,
    pub tested: bool,
}

/// What one walk over a constructor's code keeps.
pub struct Walk<'c, 'a> {
    context: &'c Context<'a>,
    own: &'c str,
    written: HashSet<String>,
    seen: HashSet<String>,
    stopped: bool,
    loops: usize,
    finallies: Vec<Node<'a>>,
    pub found: Vec<Read<'a>>,
}

impl<'c, 'a> Walk<'c, 'a> {
    pub fn new(context: &'c Context<'a>, own: &'c str) -> Self {
        Walk { context, own, written: HashSet::new(), seen: HashSet::new(), stopped: false, loops: 0, finallies: Vec::new(), found: Vec::new() }
    }

    /// A non-static field of the class itself, not a constant the compiler puts in place of the read.
    fn own_field(&self, class: &str, name: &str) -> Option<String> {
        let (declaring, field) = self.context.resolver.index.field(class, name)?;
        let constant = field.strict && field.constant.is_some();
        (declaring.name == self.own && field.flags & flag::STATIC == 0 && !constant).then(|| field.name.clone())
    }

    /// The field of the class a name or `this.name` reads, and whether javac loads `this` just before it.
    fn field_of(&self, node: Node) -> Option<(String, bool)> {
        let context = self.context;
        match node.kind() {
            "identifier" if super::hidden::bound_by_pattern(context, node) => None,
            "identifier" => match context.resolver.binding(node, context.text(node)) {
                Some(Binding::Field(_, declaring, field)) if declaring.name == self.own => self.own_field(self.own, &field.name).map(|name| (name, true)),
                _ => None,
            },
            "field_access" => {
                let object = unwrap(node.child_by_field_name("object")?);
                let name = context.text(node.child_by_field_name("field")?);
                let through_this = object.kind() == "this" || (object.kind() == "field_access" && self.names_own_this(object)) || self.cast_this(object);
                let class = if through_this { Some(self.own.to_string()) } else { context.resolver.type_of(object).and_then(|kind| match kind.erased() { Type::Class(class, _) => Some(class), _ => None }) };
                self.own_field(&class?, name).map(|name| (name, through_this))
            }
            _ => None,
        }
    }

    fn cast_this(&self, object: Node) -> bool {
        object.kind() == "cast_expression"
            && object.child_by_field_name("value").map(unwrap).is_some_and(|value| value.kind() == "this")
            && self.context.resolver.type_of(object).is_some_and(|kind| kind.erased().name() == self.own)
    }

    fn names_own_this(&self, access: Node) -> bool {
        access.child_by_field_name("field").is_some_and(|field| field.kind() == "this") && self.context.resolver.type_of(access).is_some_and(|kind| kind.erased().name() == self.own)
    }

    fn write(&mut self, target: Node<'a>) {
        let target = unwrap(target);
        if target.kind() == "field_access"
            && let Some(object) = target.child_by_field_name("object")
        {
            self.visit(object);
        }
        if target.kind() == "array_access" {
            self.visit(target);
            return;
        }
        if let Some((name, _)) = self.field_of(target) {
            self.written.insert(name);
        }
    }

    fn read(&mut self, node: Node<'a>, field: String) {
        if self.stopped || self.written.contains(&field) || !self.seen.insert(field.clone()) {
            return;
        }
        if self.loops == 0 {
            let tested = super::checks::tested_not_null(self.context, node);
            self.found.push(Read { node, field, tested });
        }
    }

    /// Whether a call is made on the class itself, which may write its fields: javac names the class of the
    /// receiver, but `Object` for a method `Object` declares; a `super.` call always stops.
    fn stops(&self, node: Node) -> bool {
        let object = node.child_by_field_name("object").map(unwrap);
        if object.is_some_and(|object| object.kind() == "super") {
            return true;
        }
        let Some(call) = self.context.resolver.resolve_call(node) else { return false };
        if call.method.is_static || call.declaring == "java.lang.Object" {
            return false;
        }
        if call.method.name == "start" {
            let class = if object.is_some() { call.receiver.erased().name() } else { self.own.to_string() };
            return !self.context.resolver.index.get(&class).is_some_and(|info| info.is_interface);
        }
        match object {
            None => self.context.resolver.index.is_subtype(self.own, &call.declaring),
            Some(object) => match object.kind() {
                "this" => true,
                "field_access" if self.names_own_this(object) => true,
                _ => matches!(call.receiver.erased(), Type::Class(class, _) if class == self.own),
            },
        }
    }

    pub fn visit(&mut self, node: Node<'a>) {
        if self.stopped {
            return;
        }
        let kind = node.kind();
        if kind == "lambda_expression" || kind == "class_body" || TYPE_DECLARATIONS.contains(&kind) || kind.ends_with("comment") {
            return;
        }
        match kind {
            "identifier" if parent(node).is_some_and(|holder| NAMES.contains(&holder.kind()) || holder.child_by_field_name("name").is_some_and(|name| name.id() == node.id() && holder.kind() == "instanceof_expression")) => {}
            "identifier" | "field_access" => {
                if let Some((field, through_this)) = self.field_of(node) {
                    if through_this {
                        self.read(node, field);
                    }
                    if kind == "field_access" {
                        self.visit_object(node);
                    }
                    return;
                }
                if kind == "field_access" {
                    self.visit_object(node);
                }
            }
            "assignment_expression" => {
                let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
                let plain = node.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "=");
                let left = unwrap(left);
                if left.kind() == "array_access" || (!plain && self.field_of(left).is_none()) {
                    self.visit(left);
                    self.visit(right);
                    return;
                }
                if left.kind() == "field_access"
                    && let Some(object) = left.child_by_field_name("object")
                {
                    self.visit(object);
                }
                self.visit(right);
                if let Some((name, _)) = self.field_of(left) {
                    self.written.insert(name);
                }
            }
            "update_expression" => {
                let Some(target) = named_children(node).into_iter().next() else { return };
                if self.field_of(unwrap(target)).is_some() {
                    self.write(target);
                } else {
                    self.visit(target);
                }
            }
            "variable_declarator" => {
                let Some(value) = node.child_by_field_name("value") else { return };
                self.visit(value);
                if parent(node).is_some_and(|holder| holder.kind() == "field_declaration")
                    && let Some(name) = node.child_by_field_name("name")
                    && let Some(field) = self.own_field(self.own, self.context.text(name))
                {
                    self.written.insert(field);
                }
            }
            "method_invocation" => {
                self.visit_object(node);
                if let Some(arguments) = node.child_by_field_name("arguments") {
                    self.visit(arguments);
                }
                if self.stops(node) {
                    self.stopped = true;
                }
            }
            "object_creation_expression" => {
                for part in children(node) {
                    if part.kind() != "type_identifier" && part.kind() != "generic_type" && part.kind() != "scoped_type_identifier" {
                        self.visit(part);
                    }
                }
                let anonymous = children(node).iter().any(|part| part.kind() == "class_body");
                let made = self.context.resolver.type_of(node).map(|kind| kind.erased().name());
                if !anonymous && made.as_deref() == Some(self.own) {
                    self.stopped = true;
                }
            }
            "return_statement" | "break_statement" | "continue_statement" => {
                for part in children(node) {
                    self.visit(part);
                }
                let target = if kind == "return_statement" { None } else { super::loops::target(self.context, node) };
                self.leave(target);
            }
            "for_statement" => self.visit_loop(node, &["init"]),
            "enhanced_for_statement" => self.visit_loop(node, &["value"]),
            "while_statement" | "do_statement" => self.visit_loop(node, &[]),
            "try_statement" | "try_with_resources_statement" => {
                let parts = children(node);
                let (handlers, rest): (Vec<Node>, Vec<Node>) = parts.into_iter().partition(|part| part.kind() == "catch_clause");
                let (finally, rest): (Vec<Node>, Vec<Node>) = rest.into_iter().partition(|part| part.kind() == "finally_clause");
                let block = finally.first().copied();
                self.finallies.extend(block);
                for part in rest {
                    self.visit(part);
                }
                if block.is_some() {
                    self.finallies.pop();
                }
                for part in &finally {
                    self.visit(*part);
                }
                self.finallies.extend(block);
                for part in handlers {
                    self.visit(part);
                }
                if block.is_some() {
                    self.finallies.pop();
                }
            }
            _ => {
                for part in children(node) {
                    self.visit(part);
                }
            }
        }
    }

    fn visit_object(&mut self, node: Node<'a>) {
        if let Some(object) = node.child_by_field_name("object") {
            self.visit(object);
        }
    }

    /// A loop: the parts javac runs once before it as usual, the rest as code whose reads are not reported.
    fn visit_loop(&mut self, node: Node<'a>, before: &[&str]) {
        let first: Vec<Node> = before.iter().flat_map(|field| node.children_by_field_name(field, &mut node.walk()).collect::<Vec<_>>()).collect();
        for part in &first {
            self.visit(*part);
        }
        let back = usize::from(super::loops::back_edge(self.context, node));
        let dead: Vec<Node> = if back == 0 { node.children_by_field_name("update", &mut node.walk()).collect() } else { Vec::new() };
        self.loops += back;
        for part in children(node) {
            if !first.iter().chain(&dead).any(|done| done.id() == part.id()) {
                self.visit(part);
            }
        }
        self.loops -= back;
    }

    /// The `finally` blocks javac copies in front of a jump out of them, innermost first.
    fn leave(&mut self, target: Option<Node<'a>>) {
        let kept = self.finallies.clone();
        for (at, block) in kept.iter().enumerate().rev() {
            if target.is_some_and(|target| block.start_byte() < target.start_byte() || block.end_byte() > target.end_byte()) {
                break;
            }
            self.finallies.truncate(at);
            self.visit(*block);
        }
        self.finallies = kept;
    }
}
