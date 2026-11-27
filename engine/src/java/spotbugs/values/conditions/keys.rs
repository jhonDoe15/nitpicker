//! The values the analysis follows and the names SpotBugs prints for them: a local variable or parameter of an
//! integer, `char` or `boolean` type (boxed ones too, also through `intValue()` and the like), an instance field of
//! such a type other than `long` read through `this`, the outer `this$0` or a chain of fields from a local, the
//! `length` of such an array and `length()` of such a `String`.
use super::super::super::Context;
use super::ranges::Kind;
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::enclosing_types;
use tree_sitter::Node;

const UNBOXING: &[&str] = &["intValue", "shortValue", "byteValue", "charValue", "booleanValue"];

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Key {
    pub name: String,
    pub kind: Kind,
    /// The local variable the value hangs on, if any.
    pub root: Option<String>,
    /// The fields read on the way, by declaring class and name.
    pub fields: Vec<(String, String)>,
}

struct Path {
    name: String,
    root: Option<String>,
    fields: Vec<(String, String)>,
}

pub fn key(context: &Context, node: Node) -> Option<Key> {
    let node = unwrap(node);
    match node.kind() {
        "identifier" => {
            let name = context.text(node);
            if context.resolver.pattern_variable(node, name).is_some() {
                return None;
            }
            match context.resolver.binding(node, name)? {
                Binding::Local(declared) => {
                    let kind = Kind::of(&declared.or_else(|| context.resolver.type_of(node))?)?;
                    Some(Key { name: name.to_string(), kind, root: Some(name.to_string()), fields: Vec::new() })
                }
                Binding::Field(..) => {
                    let path = path(context, node)?;
                    Some(Key { name: path.name, kind: field_kind(context, node)?, root: path.root, fields: path.fields })
                }
            }
        }
        "field_access" => {
            let object = node.child_by_field_name("object")?;
            let field = context.text(node.child_by_field_name("field")?);
            if field == "length" && matches!(context.resolver.type_of(object), Some(Type::Array(_))) {
                let base = path(context, object)?;
                return Some(Key { name: format!("{}.length", base.name), kind: Kind::Int, root: base.root, fields: base.fields });
            }
            let kind = field_kind(context, node)?;
            let path = path(context, node)?;
            Some(Key { name: path.name, kind, root: path.root, fields: path.fields })
        }
        "method_invocation" => {
            let object = node.child_by_field_name("object")?;
            let empty = node.child_by_field_name("arguments").is_some_and(|arguments| arguments.named_child_count() == 0);
            let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
            if empty && UNBOXING.contains(&name) {
                return key(context, object).filter(|_| context.resolver.type_of(object).is_some_and(|kind| matches!(kind, Type::Class(..))));
            }
            let named = name == "length";
            if !empty || !named || !context.resolver.type_is(object, "java.lang.String") {
                return None;
            }
            let base = path(context, object)?;
            Some(Key { name: format!("{}.length()", base.name), kind: Kind::Int, root: base.root, fields: base.fields })
        }
        _ => None,
    }
}

/// The kind of a field's value, for an instance field of a primitive or boxed type the analysis follows.
fn field_kind(context: &Context, node: Node) -> Option<Kind> {
    let (declaring, name) = super::super::super::fields::field_key(context, node)?;
    let (_, field) = context.resolver.index.field(&declaring, &name)?;
    if field.flags & flag::STATIC != 0 {
        return None;
    }
    Kind::of(&field.kind).filter(|kind| *kind != Kind::Long)
}

/// How SpotBugs names the object or value an expression reads: `this`, a local, or fields read from either.
fn path(context: &Context, node: Node) -> Option<Path> {
    let node = unwrap(node);
    match node.kind() {
        "this" => Some(Path { name: "this".to_string(), root: None, fields: Vec::new() }),
        "identifier" => {
            let name = context.text(node);
            match context.resolver.binding(node, name)? {
                Binding::Local(_) => Some(Path { name: name.to_string(), root: Some(name.to_string()), fields: Vec::new() }),
                Binding::Field(_, declaring, field) => {
                    if field.flags & flag::STATIC != 0 {
                        return None;
                    }
                    let around = enclosing_types(context.resolver.scope, node);
                    let index = context.resolver.index;
                    let holder = match around.iter().position(|class| index.is_subtype(class, &declaring.name))? {
                        0 => "this",
                        1 => "this$0",
                        _ => return None,
                    };
                    Some(Path { name: format!("{holder}.{name}"), root: None, fields: vec![(declaring.name.clone(), name.to_string())] })
                }
            }
        }
        "field_access" => {
            let object = node.child_by_field_name("object")?;
            let field = context.text(node.child_by_field_name("field")?);
            let (declaring, name) = super::super::super::fields::field_key(context, node)?;
            let (_, info) = context.resolver.index.field(&declaring, &name)?;
            if info.flags & flag::STATIC != 0 || matches!(object.kind(), "super") {
                return None;
            }
            let base = path(context, object)?;
            let mut fields = base.fields;
            fields.push((declaring, name));
            Some(Path { name: format!("{}.{field}", base.name), root: base.root, fields })
        }
        _ => None,
    }
}
