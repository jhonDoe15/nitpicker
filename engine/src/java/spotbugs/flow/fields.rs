//! The field a name or an `object.name` expression stands for.
use super::Walker;
use crate::engine::source::named_children;
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::{ClassInfo, Field, Type, flag};
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

#[derive(Clone, Debug)]
pub struct FieldRef {
    pub declaring: String,
    pub name: String,
    /// The class the access goes through: the type of the object, or the class whose scope gave the name.
    pub via: String,
    pub kind: Type,
    pub flags: u16,
}

impl FieldRef {
    pub(super) fn of(declaring: &ClassInfo, field: &Field, via: String) -> FieldRef {
        FieldRef { declaring: declaring.name.clone(), name: field.name.clone(), via, kind: field.kind.clone(), flags: field.flags }
    }
    pub fn is_static(&self) -> bool {
        self.flags & flag::STATIC != 0
    }
    pub fn is_public(&self) -> bool {
        self.flags & flag::PUBLIC != 0
    }
}

impl Walker<'_, '_, '_> {
    pub(super) fn named_field(&self, usage: Node, name: &str) -> Option<FieldRef> {
        match self.context.resolver.binding(usage, name)? {
            Binding::Field(owner, declaring, field) => Some(FieldRef::of(declaring, field, owner.name())),
            Binding::Local(_) => self.record_field(usage, name),
        }
    }

    /// Inside a record's methods a component name reads the field; name lookup alone takes it for the component.
    fn record_field(&self, usage: Node, name: &str) -> Option<FieldRef> {
        let method = crate::engine::source::ancestor(usage, &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "lambda_expression"])?;
        if !matches!(method.kind(), "method_declaration" | "constructor_declaration") {
            return None;
        }
        let record = crate::engine::source::parent(crate::engine::source::parent(method)?)?;
        if record.kind() != "record_declaration" {
            return None;
        }
        let component = record.child_by_field_name("parameters").map(named_children).unwrap_or_default().into_iter();
        component.filter_map(|component| component.child_by_field_name("name")).find(|found| self.text(*found) == name)?;
        let own = self.context.resolver.scope.names.get(&record.id())?;
        let (declaring, field) = self.context.resolver.index.field(own, name)?;
        Some(FieldRef::of(declaring, field, own.clone()))
    }

    /// The field an `object.name` expression reads or writes, and whether the object is `this` or an outer `this`.
    pub(super) fn accessed_field(&self, access: Node) -> Option<(FieldRef, bool)> {
        let resolver = self.context.resolver;
        let object = access.child_by_field_name("object")?;
        let name = self.text(access.child_by_field_name("field")?);
        let own_class = || enclosing_type(self.context.file, resolver.scope, access);
        let (via, own) = match object.kind() {
            "this" => (own_class()?, true),
            "super" => (resolver.index.get(&own_class()?)?.superclass.clone()?, true),
            "field_access" if object.child_by_field_name("field").is_some_and(|field| field.kind() == "this") => {
                let outer = object.child_by_field_name("object")?;
                (resolver.class_name(access, self.text(outer))?, true)
            }
            _ => match resolver.receiver(object)? {
                Receiver::Value(Type::Class(class, _)) | Receiver::Static(class) => (class, false),
                Receiver::Value(_) => return None,
            },
        };
        let (declaring, field) = resolver.index.field(&via, name)?;
        Some((FieldRef::of(declaring, field, via), own))
    }

    /// `Outer.this` read inside an inner class is a read of the hidden field that holds the outer instance.
    pub(super) fn outer_this(&self, access: Node) -> Option<FieldRef> {
        let resolver = self.context.resolver;
        let nest = crate::java::types::scope::enclosing_types(resolver.scope, access);
        let outer = resolver.class_name(access, self.text(access.child_by_field_name("object")?))?;
        if nest.get(1) != Some(&outer) {
            return None;
        }
        let name = super::super::names::outer_field(self.context, &nest);
        Some(FieldRef { declaring: nest[0].clone(), name, via: nest[0].clone(), kind: Type::class(&outer), flags: flag::FINAL })
    }
}
