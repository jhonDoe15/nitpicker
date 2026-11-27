//! The expressions of a method in the order javac writes their code: the value each one leaves, and what it does
//! to the `State`. A call (also `new`) makes every value read from a field out of date, a store into a field makes
//! the values read from that field out of date; a lambda, a string concatenation, a cast that javac writes no code
//! for and a store into an array or a static field change nothing.
use super::values::{Key, State, Val, merge};
use super::walk::{Store, Walk};
use crate::engine::source::named_children;
use crate::java::types::expr::Binding;
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

const PRIMITIVES: &[&str] = &["boolean", "byte", "char", "short", "int", "long", "float", "double"];

/// Where the object of a field access comes from.
enum Object<'a> {
    This,
    Local(Node<'a>),
    Other,
}

struct Access<'a> {
    field: Key,
    object: Object<'a>,
    qualifying: String,
}

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
                if let Some(target) = target.filter(|target| target.kind() != "identifier" || self.field(*target).is_some()) {
                    self.read_field(target, state);
                    if let Some(access) = self.field(target) {
                        self.stored(&access.field);
                    }
                } else if let Some(target) = target {
                    state.locals.insert(self.context.text(target).to_string(), self.numbers.fresh());
                }
                self.numbers.fresh()
            }
            "method_invocation" | "object_creation_expression" | "explicit_constructor_invocation" => {
                for part in named_children(node).into_iter().filter(|part| part.kind() != "class_body") {
                    self.expression(part, state);
                }
                self.called();
                self.numbers.fresh()
            }
            "binary_expression" => {
                let operator = node.child_by_field_name("operator").map(|operator| self.context.text(operator));
                let (left, right) = (node.child_by_field_name("left"), node.child_by_field_name("right"));
                left.map(|left| self.expression(left, state));
                if matches!(operator, Some("&&" | "||")) {
                    let mut taken = state.clone();
                    right.map(|right| self.expression(right, &mut taken));
                    *state = merge(Some(state.clone()), Some(taken), &self.numbers).unwrap_or_default();
                } else {
                    right.map(|right| self.expression(right, state));
                }
                self.numbers.fresh()
            }
            "ternary_expression" => {
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
            "variable_declarator" => {
                let value = node.child_by_field_name("value").map(|value| self.expression(value, state)).unwrap_or_else(|| self.numbers.fresh());
                if let Some(name) = node.child_by_field_name("name") {
                    state.locals.insert(self.context.text(name).to_string(), value);
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

    /// The instance field a name or a field access stands for, with where its object comes from.
    fn field(&self, node: Node<'a>) -> Option<Access<'a>> {
        let context = self.context;
        let node = crate::java::types::expr::unwrap(node);
        let (declaring, name) = super::super::fields::field_key(context, node)?;
        let info = context.resolver.index.get(&declaring)?;
        let declared = info.fields.iter().find(|field| field.name == name)?;
        if declared.flags & flag::STATIC != 0 {
            return None;
        }
        let around = |class: &str| class == self.own || context.resolver.index.is_subtype(&self.own, class);
        let (object, qualifying) = match node.kind() {
            "identifier" if around(&declaring) => (Object::This, self.own.clone()),
            "identifier" => (Object::Other, declaring.clone()),
            _ => {
                let object = node.child_by_field_name("object")?;
                match object.kind() {
                    "this" => (Object::This, self.own.clone()),
                    "super" => (Object::This, info_super(context, &self.own).unwrap_or_else(|| declaring.clone())),
                    "identifier" if matches!(context.resolver.binding(object, context.text(object)), Some(Binding::Local(_))) => {
                        let written = context.resolver.type_of(object).and_then(|kind| if let Type::Class(name, _) = kind { Some(name) } else { None });
                        (Object::Local(object), written.unwrap_or_else(|| declaring.clone()))
                    }
                    _ => (Object::Other, declaring.clone()),
                }
            }
        };
        Some(Access { field: (declaring, name), object, qualifying })
    }

    fn object(&mut self, node: Node<'a>, access: &Access<'a>, state: &mut State) -> Val {
        match access.object {
            Object::This => Val::This,
            Object::Local(local) => self.identifier(local, state),
            Object::Other => match node.child_by_field_name("object") {
                Some(object) => {
                    self.expression(object, state);
                    self.numbers.fresh()
                }
                None => self.numbers.fresh(),
            },
        }
    }

    fn read_field(&mut self, node: Node<'a>, state: &mut State) -> Val {
        let Some(access) = self.field(node) else {
            for part in named_children(node) {
                self.expression(part, state);
            }
            return self.numbers.fresh();
        };
        let receiver = self.object(node, &access, state);
        if matches!(access.object, Object::Other) {
            return self.numbers.fresh();
        }
        let epoch = self.epoch(&access.field);
        Val::Load { field: access.field, receiver: Box::new(receiver), epoch }
    }

    fn identifier(&mut self, node: Node<'a>, state: &mut State) -> Val {
        if self.field(node).is_some() {
            return self.read_field(node, state);
        }
        let name = self.context.text(node).to_string();
        state.locals.entry(name).or_insert_with(|| self.numbers.fresh()).clone()
    }

    fn cast(&mut self, node: Node<'a>, state: &mut State) -> Val {
        let Some(value) = node.child_by_field_name("value") else { return self.numbers.fresh() };
        let kept = self.expression(value, state);
        let written = node.child_by_field_name("type").map(|kind| self.context.text(kind).to_string());
        match (written.as_deref(), self.context.resolver.type_of(value)) {
            (Some(written), Some(Type::Primitive(from))) if written == from => kept,
            (Some(written), _) if PRIMITIVES.contains(&written) => self.numbers.fresh(),
            _ => kept,
        }
    }

    fn assignment(&mut self, node: Node<'a>, state: &mut State) -> Val {
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return self.numbers.fresh() };
        let plain = node.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "=");
        let left = crate::java::types::expr::unwrap(left);
        let Some(access) = self.field(left) else {
            if left.kind() == "identifier" {
                let value = self.expression(right, state);
                let kept = if plain { value } else { self.numbers.fresh() };
                state.locals.insert(self.context.text(left).to_string(), kept.clone());
                return kept;
            }
            for part in named_children(left) {
                self.expression(part, state);
            }
            let value = self.expression(right, state);
            return if plain { value } else { self.numbers.fresh() };
        };
        let receiver = self.object(left, &access, state);
        let value = self.expression(right, state);
        let register = match access.object {
            Object::This => Some(None),
            Object::Local(local) => Some(Some(local)),
            Object::Other => None,
        };
        let postfix = self.postfix(right, &access, &receiver);
        let same = value == Val::Load { field: access.field.clone(), receiver: Box::new(receiver), epoch: self.epoch(&access.field) };
        if let Some(register) = register.filter(|_| plain && (same || postfix)) {
            self.found.push(Store { at: node, field: access.field.clone(), qualifying: access.qualifying.clone(), register, postfix });
        }
        self.stored(&access.field);
        if plain { value } else { self.numbers.fresh() }
    }

    /// `o.f = o.f++`: javac stores the old value back after the increment.
    fn postfix(&self, right: Node<'a>, access: &Access<'a>, receiver: &Val) -> bool {
        let right = crate::java::types::expr::unwrap(right);
        if right.kind() != "update_expression" || named_children(right).first().is_none_or(|first| first.start_byte() != right.start_byte()) {
            return false;
        }
        let Some(target) = named_children(right).into_iter().next().and_then(|target| self.field(target)) else { return false };
        let same_object = match (&target.object, &access.object, receiver) {
            (Object::This, Object::This, _) => true,
            (Object::Local(one), Object::Local(two), _) => self.context.text(*one) == self.context.text(*two),
            _ => false,
        };
        target.field == access.field && same_object
    }
}

fn info_super(context: &super::super::Context, own: &str) -> Option<String> {
    context.resolver.index.get(own)?.superclass.clone()
}
