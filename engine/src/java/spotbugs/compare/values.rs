//! Values as SpotBugs numbers them in one method: a local variable holds the value it was given, a cast keeps it,
//! a field read twice from the same object gives the same value until that field is stored or a monitor is
//! entered, and values that meet after branches become a new one. Each value remembers where it came from and the
//! type SpotBugs sees for it.
use super::super::Context;
use crate::java::types::model::Type;
use std::rc::Rc;
use tree_sitter::Node;

pub const BOOLEAN: &str = "java.lang.Boolean";
pub const STRING: &str = "java.lang.String";

#[derive(Clone, PartialEq)]
pub enum Origin {
    Plain,
    Null,
    /// A field read: its name, the binary name of the class that declares it, and whether it is a final `Boolean`.
    Field(String, String, bool),
    /// The result of a call, named as SpotBugs names the called method.
    Call(String),
    /// `Boolean.valueOf(boolean)` of another value, as javac boxes.
    Boxed(u32),
    /// `booleanValue()` of a `Boolean` value, as javac unboxes: SpotBugs names the local that held the object.
    Unboxed(u32),
    /// A string literal: SpotBugs treats it apart from other `String` values where values meet.
    Literal,
}

#[derive(Clone, PartialEq, Eq, Hash)]
pub enum Note {
    Local(String),
    Named(String),
    Field(String, String),
    Method(String),
}

#[derive(Clone)]
pub struct Local {
    pub name: Rc<str>,
    pub value: u32,
    pub kind: Option<Rc<Type>>,
    pub declared: Option<Rc<Type>>,
}

#[derive(Clone, Default)]
pub struct Env {
    pub locals: Vec<Local>,
    /// Field reads still known: object value (none for a static field), declaring class, name, value.
    pub loads: Vec<(Option<u32>, String, String, u32)>,
}

#[derive(Clone, Copy, PartialEq)]
pub enum Frame {
    Method,
    /// A lambda body: locals of the code around arrive as its first parameters.
    Lambda(usize),
    /// A member of an anonymous or local class: locals of the code around are its `val$` fields.
    Captured,
}

pub struct Walk<'c, 'a> {
    pub context: &'c Context<'a>,
    pub origins: Vec<Origin>,
    pub env: Env,
    pub frame: Frame,
    pub wanted: &'c std::collections::HashSet<usize>,
    pub found: Vec<(Node<'a>, Vec<Note>)>,
}

pub type Value = (u32, Option<Type>);

impl<'c, 'a> Walk<'c, 'a> {
    pub fn fresh(&mut self, origin: Origin) -> u32 {
        self.origins.push(origin);
        (self.origins.len() - 1) as u32
    }

    pub fn plain(&mut self, kind: Option<Type>) -> Value {
        (self.fresh(Origin::Plain), kind)
    }

    pub fn declare(&mut self, name: &str, value: Value, declared: Option<Type>) {
        self.env.locals.push(Local { name: name.into(), value: value.0, kind: value.1.map(Rc::new), declared: declared.map(Rc::new) });
    }

    pub fn set_local(&mut self, name: &str, value: Value) {
        match self.env.locals.iter_mut().rev().find(|local| &*local.name == name) {
            Some(local) => (local.value, local.kind) = (value.0, value.1.map(Rc::new)),
            None => self.declare(name, value, None),
        }
    }

    /// Values meeting after two paths: what differs becomes a new value, typed as declared when the types differ.
    pub fn merge(&mut self, other: Env) {
        let mut locals = std::mem::take(&mut self.env.locals);
        locals.truncate(other.locals.len());
        for (mine, theirs) in locals.iter_mut().zip(other.locals) {
            if mine.value == theirs.value {
                continue;
            }
            let known = |kind: &Option<Rc<Type>>| kind.clone().filter(|kind| **kind != Type::Null);
            let origins = &self.origins;
            let text = |local: &Local| local.kind.as_ref().is_some_and(|kind| kind.name() == STRING) && origins[local.value as usize] != Origin::Literal;
            let string = text(mine) || text(&theirs);
            mine.value = self.fresh(Origin::Plain);
            mine.kind = match (known(&mine.kind), known(&theirs.kind)) {
                _ if string => Some(Rc::new(Type::class(STRING))),
                (Some(one), Some(two)) if one.name() == two.name() => Some(one),
                (Some(one), None) | (None, Some(one)) => Some(one),
                _ => mine.declared.clone(),
            };
        }
        self.env.locals = locals;
        self.env.loads.retain(|load| other.loads.contains(load));
    }

    /// The type a value of a declared type has when javac boxes a `boolean` into it.
    pub fn boxed(&mut self, value: Value, target: Option<&Type>) -> Value {
        let primitive = matches!(value.1, Some(Type::Primitive("boolean")));
        if primitive && target.is_some_and(|target| matches!(target, Type::Class(..) | Type::Variable(_))) {
            return (self.fresh(Origin::Boxed(value.0)), Some(Type::class(BOOLEAN)));
        }
        let object = matches!(&value.1, Some(Type::Class(name, _)) if name == BOOLEAN);
        if object && matches!(target, Some(Type::Primitive("boolean"))) {
            return (self.fresh(Origin::Unboxed(value.0)), Some(Type::Primitive("boolean")));
        }
        value
    }

    pub fn field(&mut self, object: Option<u32>, declaring: &str, field: &crate::java::types::model::Field, kind: Option<Type>) -> Value {
        use crate::java::types::model::flag;
        let object = object.filter(|_| field.flags & flag::STATIC == 0);
        let binary = super::super::names::binary(self.context, declaring);
        let known = self.env.loads.iter().find(|load| load.0 == object && load.1 == binary && load.2 == field.name);
        if let Some(load) = known {
            return (load.3, kind);
        }
        let constant = field.flags & flag::FINAL != 0 && field.kind.name() == BOOLEAN;
        let origin = if constant && self.null_constant(declaring, &field.name) { Origin::Null } else { Origin::Field(field.name.clone(), binary.clone(), constant) };
        let value = self.fresh(origin);
        self.env.loads.push((object, binary, field.name.clone(), value));
        (value, kind)
    }

    fn null_constant(&self, declaring: &str, name: &str) -> bool {
        self.context.project.null_finals.contains(&(declaring.to_string(), name.to_string()))
    }

    pub fn captured(&mut self, name: &str, kind: Option<Type>, at: Node) -> Value {
        match self.frame {
            Frame::Lambda(count) => {
                let value = self.fresh(Origin::Plain);
                let shared = kind.clone().map(Rc::new);
                self.env.locals.insert(count, Local { name: name.into(), value, kind: shared.clone(), declared: shared });
                self.frame = Frame::Lambda(count + 1);
                (value, kind)
            }
            Frame::Captured => {
                let class = crate::java::types::scope::enclosing_types(self.context.resolver.scope, at).into_iter().next().unwrap_or_default();
                let binary = super::super::names::binary(self.context, &class);
                let field = format!("val${name}");
                let known = self.env.loads.iter().find(|load| load.0 == Some(0) && load.1 == binary && load.2 == field);
                if let Some(load) = known {
                    return (load.3, kind);
                }
                let constant = kind.as_ref().is_some_and(|kind| kind.name() == BOOLEAN);
                let value = self.fresh(Origin::Field(field.clone(), binary.clone(), constant));
                self.env.loads.push((Some(0), binary, field, value));
                (value, kind)
            }
            Frame::Method => {
                let value = self.plain(kind.clone());
                self.declare(name, value.clone(), kind);
                value
            }
        }
    }

    fn holder(&self, value: u32) -> Option<String> {
        self.env.locals.iter().find(|local| local.value == value).map(|local| local.name.to_string())
    }

    /// What SpotBugs notes for one compared value: none for an unnamed one.
    fn note(&self, value: u32) -> Option<Note> {
        if let Some(name) = self.holder(value) {
            return Some(Note::Local(name));
        }
        match &self.origins[value as usize] {
            Origin::Field(name, declaring, _) => Some(Note::Field(name.clone(), declaring.clone())),
            Origin::Call(label) => Some(Note::Method(label.clone())),
            Origin::Boxed(inner) => Some(match (self.holder(*inner), &self.origins[*inner as usize]) {
                (_, Origin::Unboxed(object)) => match self.holder(*object) {
                    Some(name) => Note::Named(name),
                    None => Note::Method("Boolean.booleanValue()".to_string()),
                },
                (Some(name), _) => Note::Named(name),
                (None, Origin::Field(name, declaring, _)) => Note::Field(name.clone(), declaring.clone()),
                (None, Origin::Call(label)) => Note::Method(label.clone()),
                _ => Note::Method("Boolean.valueOf(boolean)".to_string()),
            }),
            _ => None,
        }
    }

    fn constant(&self, value: u32) -> Option<Note> {
        match &self.origins[value as usize] {
            Origin::Field(name, declaring, true) => Some(Note::Field(name.clone(), declaring.clone())),
            _ => None,
        }
    }

    /// Notes a reference comparison between two values when SpotBugs would report it.
    pub fn compared(&mut self, node: Node<'a>, left: &Value, right: &Value) {
        if !self.wanted.contains(&node.id()) || !super::boolean_pair(self.context, &left.1, &right.1) {
            return;
        }
        let null = |value: &Value| self.origins[value.0 as usize] == Origin::Null || value.1 == Some(Type::Null);
        if null(left) || null(right) {
            return;
        }
        let notes = match self.constant(left.0).or_else(|| self.constant(right.0)) {
            Some(constant) => vec![constant],
            None => {
                let mut notes: Vec<Note> = [right.0, left.0].into_iter().filter_map(|value| self.note(value)).collect();
                notes.dedup_by(|one, two| match (&*one, &*two) {
                    (Note::Local(a) | Note::Named(a), Note::Local(b) | Note::Named(b)) => a == b,
                    _ => one == two,
                });
                notes
            }
        };
        self.found.push((node, notes));
    }
}
