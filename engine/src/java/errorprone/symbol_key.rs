//! `ASTHelpers.sameVariable`: two names or field accesses stand for the same symbol.
use super::lookup::field_of;
use super::Context;
use crate::java::javac::locals::{declaration, Found, Scopes};
use crate::java::types::expr::Receiver;
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_type;
use std::cell::OnceCell;
use tree_sitter::Node;

#[derive(PartialEq)]
enum Key {
    This(String),
    Super(String),
    Local(usize),
    Field(String, String),
    Class(String),
    Length,
}

fn plain(node: Node) -> bool {
    matches!(node.kind(), "identifier" | "field_access" | "this" | "super")
}

fn last_name<'f>(context: &'f Context, node: Node) -> &'f str {
    match node.kind() {
        "field_access" => node.child_by_field_name("field").map(|part| context.text(part)).unwrap_or_default(),
        _ => context.text(node),
    }
}

fn class_key(context: &Context, node: Node) -> Option<Key> {
    match context.resolver.receiver(node)? {
        Receiver::Static(class) => Some(Key::Class(class)),
        Receiver::Value(_) => None,
    }
}

fn key<'t>(context: &Context<'t>, scopes: &OnceCell<Scopes<'t>>, node: Node<'t>) -> Option<Key> {
    match node.kind() {
        "this" => Some(Key::This(enclosing_type(context.file, context.resolver.scope, node)?)),
        "super" => Some(Key::Super(enclosing_type(context.file, context.resolver.scope, node)?)),
        "identifier" => {
            let name = context.text(node);
            let scopes = scopes.get_or_init(|| Scopes::of(context.file, context.file.tree.root_node()));
            match declaration(context.resolver, scopes, node, name) {
                Some(Found::Local(declared)) => return Some(Key::Local(declared.start_byte())),
                Some(Found::Field) => {}
                None => return class_key(context, node),
            }
            let (declaring, field) = field_of(context, node)?;
            Some(Key::Field(declaring.name.clone(), field.name.clone()))
        }
        "field_access" => {
            let object = node.child_by_field_name("object")?;
            let name = context.text(node.child_by_field_name("field")?);
            if name == "this" {
                return match context.resolver.receiver(object)? {
                    Receiver::Static(class) => Some(Key::This(class)),
                    Receiver::Value(_) => None,
                };
            }
            if let Some((declaring, field)) = field_of(context, node) {
                return Some(Key::Field(declaring.name.clone(), field.name.clone()));
            }
            match context.resolver.receiver(object)? {
                Receiver::Value(Type::Array(_)) if name == "length" => Some(Key::Length),
                _ => class_key(context, node),
            }
        }
        _ => None,
    }
}

fn same<'t>(context: &Context<'t>, scopes: &OnceCell<Scopes<'t>>, first: Node<'t>, second: Node<'t>) -> bool {
    if !plain(first) || !plain(second) || last_name(context, first) != last_name(context, second) {
        return false;
    }
    let access = |node: Node| node.kind() == "field_access";
    match (access(first), access(second)) {
        (false, false) => key(context, scopes, first).is_some_and(|a| key(context, scopes, second) == Some(a)),
        (true, true) => {
            let objects = (first.child_by_field_name("object"), second.child_by_field_name("object"));
            key(context, scopes, first).is_some_and(|a| key(context, scopes, second) == Some(a)) && matches!(objects, (Some(a), Some(b)) if same(context, scopes, a, b))
        }
        _ => {
            let selected = if access(first) { first } else { second }.child_by_field_name("object");
            selected.is_some_and(|object| object.kind() == "this") && key(context, scopes, first).is_some_and(|a| key(context, scopes, second) == Some(a))
        }
    }
}

pub fn same_symbol<'t>(context: &Context<'t>, first: Node<'t>, second: Node<'t>) -> bool {
    same(context, &OnceCell::new(), first, second)
}
