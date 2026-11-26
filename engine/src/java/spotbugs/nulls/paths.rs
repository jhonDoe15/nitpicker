//! The places a value is remembered in: local variables, and fields reached from `this`, a class or a local.
use super::super::{Context, names};
use super::marks;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::{ClassInfo, Field, Type, flag};
use std::collections::HashMap;
use tree_sitter::Node;

pub struct Path {
    pub key: String,
    /// The name a message gives it: the variable, or `Class.field`.
    pub shown: String,
    /// The variable, or the field with its class's full name: `pkg.Class.field`.
    pub full: String,
    pub field: bool,
    /// A field SpotBugs takes as possibly null.
    pub checked: bool,
    pub volatile: bool,
    /// A field of the object the method runs on that is not final: calls can change it.
    pub of_this: bool,
    pub static_field: bool,
}

/// The expression inside brackets and casts.
pub fn strip(mut node: Node) -> Node {
    loop {
        let inner = match node.kind() {
            "parenthesized_expression" => named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")),
            "cast_expression" => node.child_by_field_name("value"),
            _ => None,
        };
        match inner {
            Some(inner) => node = inner,
            None => return node,
        }
    }
}

pub struct Finder<'c, 'a> {
    pub context: &'c Context<'a>,
    /// The class the analysed body belongs to.
    pub class: &'c str,
    pub all: Vec<Path>,
    by_key: HashMap<String, usize>,
}

impl<'c, 'a> Finder<'c, 'a> {
    pub fn new(context: &'c Context<'a>, class: &'c str) -> Self {
        Finder { context, class, all: Vec::new(), by_key: HashMap::new() }
    }

    fn add(&mut self, path: Path) -> usize {
        if let Some(known) = self.by_key.get(&path.key) {
            return *known;
        }
        self.by_key.insert(path.key.clone(), self.all.len());
        self.all.push(path);
        self.all.len() - 1
    }

    pub fn local(&mut self, name: &str) -> usize {
        self.add(Path { key: name.to_string(), shown: name.to_string(), full: name.to_string(), field: false, checked: false, volatile: false, of_this: false, static_field: false })
    }

    fn member(&mut self, base: Option<String>, class: &ClassInfo, field: &Field) -> usize {
        let of_this = base.as_deref() == Some("this") && field.flags & flag::FINAL == 0;
        let key = match base {
            Some(base) => format!("{base}.{}", field.name),
            None => format!("{}.{}", class.name, field.name),
        };
        let shown = names::field(self.context, self.class, &class.name, &field.name);
        let checked = marks::field(self.context.resolver.index, class, field);
        let full = format!("{}.{}", names::binary(self.context, &class.name), field.name);
        self.add(Path { key, shown, full, field: true, checked, volatile: field.flags & flag::VOLATILE != 0, of_this, static_field: field.flags & flag::STATIC != 0 })
    }

    /// A record component read by its name inside the record: the declaration of the component.
    fn component(&self, usage: Node<'a>) -> Option<Node<'a>> {
        let name = self.context.text(usage);
        let mut current = parent(usage);
        while let Some(at) = current {
            match at.kind() {
                "compact_constructor_declaration" | "class_declaration" | "interface_declaration" | "enum_declaration" => return None,
                "record_declaration" => {
                    let listed = children(at.child_by_field_name("parameters")?);
                    return listed.into_iter().find(|part| part.child_by_field_name("name").is_some_and(|written| self.context.text(written) == name));
                }
                _ => current = parent(at),
            }
        }
        None
    }

    /// The field an access names, and whether it is reached through a class instead of a value.
    pub fn accessed(&self, access: Node<'a>) -> Option<(&'a ClassInfo, &'a Field, bool)> {
        let resolver = self.context.resolver;
        let name = self.context.text(access.child_by_field_name("field")?);
        let (owner, fixed) = match resolver.receiver(access.child_by_field_name("object")?)? {
            Receiver::Static(owner) => (owner, true),
            Receiver::Value(Type::Class(owner, _)) => (owner, false),
            Receiver::Value(_) => return None,
        };
        let (class, field) = resolver.index.field(&owner, name)?;
        Some((class, field, fixed || field.flags & flag::STATIC != 0))
    }

    /// The path an expression reads, when it reads one.
    pub fn of(&mut self, node: Node<'a>) -> Option<usize> {
        let node = strip(node);
        let resolver = self.context.resolver;
        match node.kind() {
            "identifier" => {
                let name = self.context.text(node);
                match resolver.binding(node, name)? {
                    Binding::Local(_) => match self.component(node) {
                        Some(component) => {
                            let key = format!("this.{name}");
                            let shown = names::field(self.context, self.class, self.class, name);
                            let checked = resolver.check_for_null(component);
                            let full = format!("{}.{name}", names::binary(self.context, self.class));
                            Some(self.add(Path { key, shown, full, field: true, checked, volatile: false, of_this: false, static_field: false }))
                        }
                        None => Some(self.local(name)),
                    },
                    Binding::Field(_, class, field) => {
                        let base = (field.flags & flag::STATIC == 0).then(|| "this".to_string());
                        Some(self.member(base, class, field))
                    }
                }
            }
            "field_access" => {
                let (class, field, fixed) = self.accessed(node)?;
                if fixed {
                    return Some(self.member(None, class, field));
                }
                let object = strip(node.child_by_field_name("object")?);
                let base = match object.kind() {
                    "this" | "super" => "this".to_string(),
                    _ => {
                        let base = self.of(object)?;
                        self.all[base].key.clone()
                    }
                };
                Some(self.member(Some(base), class, field))
            }
            _ => None,
        }
    }
}
