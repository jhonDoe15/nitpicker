//! The field a name or a field access stands for, and where the object it is read from or stored into comes
//! from. Static fields count only for the comparisons (`Mode::Stack`, `Mode::Numbers`): their object is the class.
use super::values::{Key, Mode, State, Val};
use super::Walk;
use crate::engine::source::named_children;
use crate::java::types::expr::Binding;
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

/// Where the object of a field access comes from.
pub enum Object<'a> {
    This,
    Outer,
    Local(Node<'a>),
    Other,
}

pub struct Access<'a> {
    pub field: Key,
    pub object: Object<'a>,
    pub qualifying: String,
}

impl<'c, 'a> Walk<'c, 'a> {
    /// The instance field a name or a field access stands for, with where its object comes from.
    pub fn field(&self, node: Node<'a>) -> Option<Access<'a>> {
        let context = self.context;
        let node = crate::java::types::expr::unwrap(node);
        let (declaring, name) = super::super::super::fields::field_key(context, node)?;
        let info = context.resolver.index.get(&declaring)?;
        let declared = info.fields.iter().find(|field| field.name == name)?;
        if declared.flags & flag::STATIC != 0 {
            return (self.mode != Mode::Assign).then(|| Access { field: (declaring.clone(), name), object: Object::This, qualifying: declaring });
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
                    "super" => (Object::This, context.resolver.index.get(&self.own).and_then(|own| own.superclass.clone()).unwrap_or_else(|| declaring.clone())),
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

    /// The object of a field access, walked as javac writes it.
    pub fn object(&mut self, node: Node<'a>, access: &Access<'a>, state: &mut State) -> Val {
        match access.object {
            Object::This => Val::This,
            Object::Outer => Val::Outer,
            Object::Local(local) => self.identifier(local, state),
            Object::Other => match node.child_by_field_name("object") {
                Some(object) => self.expression(object, state),
                None => self.numbers.fresh(),
            },
        }
    }

    pub fn read_field(&mut self, node: Node<'a>, state: &mut State) -> Val {
        if self.mode != Mode::Assign && (self.context.resolver.constant_field(node) || self.constant_member(node)) {
            return self.numbers.fresh();
        }
        let Some(access) = self.field(node) else {
            for part in named_children(node) {
                self.expression(part, state);
            }
            return self.numbers.fresh();
        };
        let receiver = self.object(node, &access, state);
        if matches!(access.object, Object::Other) && self.mode != Mode::Numbers {
            return self.numbers.fresh();
        }
        let epoch = self.epoch(&access.field);
        Val::Load { field: access.field, receiver: Box::new(receiver), epoch, seen: self.seen(node) }
    }
}

impl Walk<'_, '_> {
    /// A `final` instance field named alone, set from a constant: a constant variable javac writes the value of.
    fn constant_member(&self, node: Node) -> bool {
        let found = (node.kind() == "identifier").then(|| super::super::super::fields::field_key(self.context, node)).flatten();
        let constant = |field: &crate::java::types::model::Field| field.flags & flag::FINAL != 0 && field.strict && field.folded.is_some();
        found.is_some_and(|(declaring, name)| self.context.resolver.index.get(&declaring).is_some_and(|info| info.fields.iter().any(|field| field.name == name && constant(field))))
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
