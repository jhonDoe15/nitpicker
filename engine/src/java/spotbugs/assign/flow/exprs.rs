//! The expressions of a method in the order javac writes their code: the value each one leaves, and what it does
//! to the `State`. A call (also `new`) makes every value read from a field out of date, a store into a field makes
//! the values read from that field out of date; a lambda, a string concatenation, a cast that javac writes no code
//! for and a store into an array or a static field change nothing.
use super::values::{Key, State, Val, merge};
use super::{Store, Walk};
use crate::engine::source::named_children;
use crate::java::types::expr::Binding;
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

const PRIMITIVES: &[&str] = &["boolean", "byte", "char", "short", "int", "long", "float", "double"];

/// Where the object of a field access comes from.
enum Object<'a> {
    This,
    Outer,
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
                if target.is_some_and(|target| super::convert::converts(&self.type_of(target), &Some(Type::Primitive("int")))) {
                    self.called();
                }
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
                if self.unboxes(node) {
                    self.called();
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
                        if self.convert(value, &declared) { self.numbers.fresh() } else { kept }
                    }
                    None => self.numbers.fresh(),
                };
                if let Some(name) = node.child_by_field_name("name") {
                    state.locals.insert(self.context.text(name).to_string(), value);
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
                    self.called();
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
        let (declaring, name) = super::super::super::fields::field_key(context, node)?;
        let info = context.resolver.index.get(&declaring)?;
        let declared = info.fields.iter().find(|field| field.name == name)?;
        if declared.flags & flag::STATIC != 0 {
            return None;
        }
        let around = |class: &str| class == self.own || context.resolver.index.is_subtype(&self.own, class);
        let outer = self.outer.clone().filter(|outer| *outer == declaring || context.resolver.index.is_subtype(outer, &declaring));
        let class_of = |node: Node| context.resolver.type_of(node).and_then(|kind| if let Type::Class(name, _) = kind { Some(name) } else { None });
        let (object, qualifying) = match node.kind() {
            "identifier" if around(&declaring) => (Object::This, self.own.clone()),
            "identifier" => match outer {
                Some(outer) => (Object::Outer, outer),
                None => (Object::Other, declaring.clone()),
            },
            _ => {
                let written = node.child_by_field_name("object")?;
                let object = stripped(written);
                let cast = (object.id() != crate::java::types::expr::unwrap(written).id()).then(|| class_of(written)).flatten();
                match object.kind() {
                    "this" => (Object::This, cast.unwrap_or_else(|| self.own.clone())),
                    "super" => (Object::This, info_super(context, &self.own).unwrap_or_else(|| declaring.clone())),
                    "field_access" if object.child_by_field_name("field").is_some_and(|part| part.kind() == "this") => match class_of(object) {
                        Some(named) if named == self.own => (Object::This, cast.unwrap_or(named)),
                        Some(named) if outer.as_ref() == Some(&named) => (Object::Outer, cast.unwrap_or(named)),
                        _ => (Object::Other, declaring.clone()),
                    },
                    "identifier" if matches!(context.resolver.binding(object, context.text(object)), Some(Binding::Local(_))) => {
                        (Object::Local(object), cast.or_else(|| class_of(object)).unwrap_or_else(|| declaring.clone()))
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
            Object::Outer => Val::Outer,
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
        if let Some(value) = state.locals.get(&name) {
            return value.clone();
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
                let value = self.stored_value(left, right, plain, state);
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
        let value = self.stored_value(left, right, plain, state);
        let register = match access.object {
            Object::This | Object::Outer => Some(None),
            Object::Local(local) => Some(Some(local)),
            Object::Other => None,
        };
        let outer = matches!(access.object, Object::Outer);
        let postfix = self.postfix(right, &access, &receiver);
        let same = value == Val::Load { field: access.field.clone(), receiver: Box::new(receiver), epoch: self.epoch(&access.field) };
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
            self.called();
        }
        if converted { self.numbers.fresh() } else { value }
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
}

/// The object of a field access without the parentheses and casts around it.
fn stripped(node: Node) -> Node {
    let node = crate::java::types::expr::unwrap(node);
    match node.kind() {
        "cast_expression" => node.child_by_field_name("value").map(stripped).unwrap_or(node),
        _ => node,
    }
}

fn info_super(context: &super::super::super::Context, own: &str) -> Option<String> {
    context.resolver.index.get(own)?.superclass.clone()
}
