//! The expressions of a method in the order javac writes their code: the value each one leaves, and what it does
//! to the `State`. A call (also `new`) makes every value read from a field out of date, a store into a field makes
//! the values read from that field out of date; a lambda, a string concatenation, a cast that javac writes no code
//! for and a store into an array or a static field change nothing.
use super::access::{Access, Object};
use super::values::{Mode, Seen, Site, State, Val, merge};
use super::{Put, Store, Walk};
use crate::engine::source::named_children;
use crate::java::types::model::Type;
use tree_sitter::Node;

const PRIMITIVES: &[&str] = &["boolean", "byte", "char", "short", "int", "long", "float", "double"];

impl<'c, 'a> Walk<'c, 'a> {
    pub fn expression(&mut self, node: Node<'a>, state: &mut State) -> Val {
        match node.kind() {
            "parenthesized_expression" => named_children(node).into_iter().fold(self.numbers.fresh(), |_, part| self.expression(part, state)),
            "this" | "super" => Val::This,
            "identifier" => self.identifier(node, state),
            "field_access" => self.read_field(node, state),
            "cast_expression" => self.cast(node, state),
            "assignment_expression" => self.assignment(node, state),
            "update_expression" => {
                let target = named_children(node).into_iter().next();
                if target.is_some_and(|target| super::convert::converts(&self.type_of(target), &Some(Type::Primitive("int")))) {
                    self.converting();
                }
                if let Some(target) = target.filter(|target| target.kind() != "identifier" || self.field(*target).is_some()) {
                    let read = self.read_field(target, state);
                    if let Some(access) = self.field(target) {
                        if self.mode == Mode::Stack {
                            let receiver = if let Val::Load { receiver, .. } = read { *receiver } else { self.object(target, &access, state) };
                            self.puts.push(Put { at: node, field: access.field.clone(), qualifying: access.qualifying.clone(), receiver, value: self.numbers.fresh() });
                        }
                        self.stored(&access.field);
                    }
                } else if let Some(target) = target {
                    state.locals.insert(self.context.text(target).to_string(), self.numbers.fresh());
                }
                self.numbers.fresh()
            }
            "method_invocation" => self.invocation(node, state),
            "object_creation_expression" | "explicit_constructor_invocation" => {
                for part in named_children(node).into_iter().filter(|part| part.kind() != "class_body") {
                    self.expression(part, state);
                }
                self.invoked(vec![node]);
                self.numbers.fresh()
            }
            "binary_expression" => {
                let operator = node.child_by_field_name("operator").map(|operator| self.context.text(operator));
                let (left, right) = (node.child_by_field_name("left"), node.child_by_field_name("right"));
                let first = left.map(|left| self.expression(left, state));
                if matches!(operator, Some("&&" | "||")) {
                    let mut taken = state.clone();
                    right.map(|right| self.expression(right, &mut taken));
                    *state = merge(Some(state.clone()), Some(taken), &self.numbers).unwrap_or_default();
                } else if let (Some(first), Some(second)) = (first, right.map(|right| self.expression(right, state))) {
                    let (first, second) = self.promoted(node, first, second);
                    self.site(node, first, second, state);
                }
                if self.unboxes(node) {
                    self.converting();
                }
                self.numbers.fresh()
            }
            "ternary_expression" => {
                let known = self.constant(node.child_by_field_name("condition"));
                if let Some(part) = known.and_then(|taken| node.child_by_field_name(if taken { "consequence" } else { "alternative" })) {
                    return self.expression(part, state);
                }
                node.child_by_field_name("condition").map(|condition| self.expression(condition, state));
                let (mut one, mut two) = (state.clone(), state.clone());
                let first = node.child_by_field_name("consequence").map(|part| self.expression(part, &mut one));
                let second = node.child_by_field_name("alternative").map(|part| self.expression(part, &mut two));
                *state = merge(Some(one), Some(two), &self.numbers).unwrap_or_default();
                if first.is_some() && first == second { first.unwrap_or_else(|| self.numbers.fresh()) } else { self.numbers.fresh() }
            }
            "switch_expression" => {
                self.switched(node, state);
                self.numbers.fresh()
            }
            "variable_declarator" | "resource" => {
                let written = node.parent().and_then(|holder| holder.child_by_field_name("type")).or_else(|| node.child_by_field_name("type"));
                let declared = written.filter(|kind| self.context.text(*kind) != "var").and_then(|kind| self.context.resolver.type_node(kind));
                let value = match node.child_by_field_name("value") {
                    Some(value) => {
                        let kept = self.expression(value, state);
                        let converted = self.convert(value, &declared);
                        let kept = self.widened(kept, value, &declared);
                        self.converted(kept, converted)
                    }
                    None => self.numbers.fresh(),
                };
                if let Some(name) = node.child_by_field_name("name") {
                    self.hold(self.context.text(name), value, state);
                }
                self.numbers.fresh()
            }
            "unary_expression" | "instanceof_expression" => {
                for part in named_children(node) {
                    self.expression(part, state);
                }
                if node.kind() == "instanceof_expression" {
                    self.bind(node, state);
                } else if self.unboxes(node) {
                    self.converting();
                }
                self.numbers.fresh()
            }
            "lambda_expression" | "method_reference" | "class_body" | "line_comment" | "block_comment" => self.numbers.fresh(),
            _ => {
                for part in named_children(node) {
                    self.expression(part, state);
                }
                self.numbers.fresh()
            }
        }
    }

    pub(super) fn identifier(&mut self, node: Node<'a>, state: &mut State) -> Val {
        if self.field(node).is_some() {
            return self.read_field(node, state);
        }
        let name = self.context.text(node).to_string();
        if let Some(value) = state.locals.get(&name) {
            return value.clone();
        }
        if self.captured.as_ref().is_some_and(|parameters| !parameters.contains(&name)) {
            let field = (self.own.clone(), format!("val${name}"));
            let epoch = self.epoch(&field);
            return Val::Load { field, receiver: Box::new(Val::This), epoch, seen: self.seen(node) };
        }
        let value = self.first(&name);
        state.locals.insert(name, value.clone());
        value
    }

    fn cast(&mut self, node: Node<'a>, state: &mut State) -> Val {
        let Some(value) = node.child_by_field_name("value") else { return self.numbers.fresh() };
        let kept = self.expression(value, state);
        let written = node.child_by_field_name("type").map(|kind| self.context.text(kind).to_string());
        match (written.as_deref(), self.context.resolver.type_of(value)) {
            (Some(written), Some(Type::Primitive(from))) if self.mode != Mode::Assign => self.widen(kept, from, written),
            (Some(written), Some(Type::Primitive(from))) if written == from => kept,
            (Some(written), _) if PRIMITIVES.contains(&written) => self.converted(kept, true),
            _ => kept,
        }
    }

    fn assignment(&mut self, node: Node<'a>, state: &mut State) -> Val {
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return self.numbers.fresh() };
        let plain = node.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "=");
        let left = crate::java::types::expr::unwrap(left);
        let Some(access) = self.field(left) else {
            if left.kind() == "identifier" {
                let before = if plain { None } else { Some(self.identifier(left, state)) };
                let value = self.stored_value(left, right, plain, state);
                if let Some(before) = before {
                    self.site(node, before, value.clone(), state);
                }
                let kept = if plain { value } else { self.numbers.fresh() };
                self.hold(self.context.text(left), kept.clone(), state);
                return kept;
            }
            for part in named_children(left) {
                self.expression(part, state);
            }
            let value = self.expression(right, state);
            return if plain { value } else { self.numbers.fresh() };
        };
        let receiver = self.object(left, &access, state);
        let before = (!plain).then(|| Val::Load { field: access.field.clone(), receiver: Box::new(receiver.clone()), epoch: self.epoch(&access.field), seen: self.seen(left) });
        let before = before.filter(|_| !matches!(access.object, Object::Other)).unwrap_or_else(|| self.numbers.fresh());
        let value = self.stored_value(left, right, plain, state);
        if !plain {
            self.site(node, before, value.clone(), state);
        }
        if self.mode == Mode::Stack {
            self.puts.push(Put { at: node, field: access.field.clone(), qualifying: access.qualifying.clone(), receiver: receiver.clone(), value: value.clone() });
        }
        let register = match access.object {
            Object::This | Object::Outer => Some(None),
            Object::Local(local) => Some(Some(local)),
            Object::Other => None,
        };
        let outer = matches!(access.object, Object::Outer);
        let postfix = self.postfix(right, &access, &receiver);
        let same = value == Val::Load { field: access.field.clone(), receiver: Box::new(receiver), epoch: self.epoch(&access.field), seen: Seen::default() };
        if let Some(register) = register.filter(|_| plain && (same || postfix)) {
            self.found.push(Store { at: node, field: access.field.clone(), qualifying: access.qualifying.clone(), register, outer, postfix });
        }
        self.stored(&access.field);
        if plain { value } else { self.numbers.fresh() }
    }

    /// The value an assignment stores: the right side, unless javac boxes or unboxes it (a call).
    fn stored_value(&mut self, left: Node<'a>, right: Node<'a>, plain: bool, state: &mut State) -> Val {
        let value = self.expression(right, state);
        let target = self.type_of(left);
        let converted = if plain { self.convert(right, &target) } else { super::convert::converts(&target, &Some(Type::Primitive("int"))) };
        if converted && !plain {
            self.converting();
        }
        let value = if plain { self.widened(value, right, &target) } else { value };
        if plain { self.converted(value, converted) } else if converted { self.numbers.fresh() } else { value }
    }

    /// `o.f = o.f++`: javac stores the old value back after the increment.
    fn postfix(&self, right: Node<'a>, access: &Access<'a>, receiver: &Val) -> bool {
        let right = crate::java::types::expr::unwrap(right);
        if right.kind() != "update_expression" || named_children(right).first().is_none_or(|first| first.start_byte() != right.start_byte()) {
            return false;
        }
        let Some(target) = named_children(right).into_iter().next().and_then(|target| self.field(target)) else { return false };
        let same_object = match (&target.object, &access.object, receiver) {
            (Object::This, Object::This, _) | (Object::Outer, Object::Outer, _) => true,
            (Object::Local(one), Object::Local(two), _) => self.context.text(*one) == self.context.text(*two),
            _ => false,
        };
        target.field == access.field && same_object
    }

    /// A field initializer javac copies into a constructor: a store into the field of `this`.
    pub(super) fn initialized(&mut self, declarator: Node<'a>, name: String, value: Val) {
        let field = (self.own.clone(), name);
        if self.mode == Mode::Stack {
            self.puts.push(Put { at: declarator, field: field.clone(), qualifying: self.own.clone(), receiver: Val::This, value });
        }
        self.stored(&field);
    }

    /// Stores a value into a local variable. The comparisons name a value after the first variable that held it.
    pub(super) fn hold(&mut self, name: &str, value: Val, state: &mut State) {
        if self.mode != Mode::Assign {
            self.named(state);
            self.origins.entry(value.clone()).or_insert_with(|| name.to_string());
        }
        state.locals.insert(name.to_string(), value);
    }

    /// `Mode::Stack`: a value made where paths meet or at the head of a loop is named after the variable holding it.
    fn named(&mut self, state: &State) {
        if self.mode != Mode::Stack {
            return;
        }
        let mut held: Vec<(&String, &Val)> = state.locals.iter().filter(|(_, value)| !self.origins.contains_key(*value)).collect();
        held.sort_by(|one, two| one.0.cmp(two.0));
        for (name, value) in held {
            self.origins.entry(value.clone()).or_insert_with(|| name.clone());
        }
    }

    /// The two operands of an operator or a call, for the comparisons, with the variables holding the second.
    pub(super) fn site(&mut self, node: Node<'a>, left: Val, right: Val, state: &State) {
        if self.mode == Mode::Assign {
            return;
        }
        self.named(state);
        let holders = state.locals.iter().filter(|(_, value)| **value == right).map(|(name, _)| name.clone()).collect();
        let current = matches!(&right, Val::Load { field, epoch, .. } if *epoch == self.epoch(field));
        let causes = self.causes(&right);
        self.sites.push(Site { node, left, right, holders, current, causes, calls: self.calls });
    }

    /// The value after a conversion javac writes code for: a new one, but `Mode::Stack` keeps the variable a value
    /// came from (not the field).
    pub(super) fn converted(&self, kept: Val, converted: bool) -> Val {
        let keeps = self.mode == Mode::Stack && !matches!(kept, Val::Load { .. });
        if converted && !keeps { self.numbers.fresh() } else { kept }
    }
}
