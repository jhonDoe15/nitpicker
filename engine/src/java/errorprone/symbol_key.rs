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

/// `getSymbol(first).equals(getSymbol(second))` for two names or field accesses: the same variable, read from whatever object.
pub fn same_declared_symbol<'t>(context: &Context<'t>, first: Node<'t>, second: Node<'t>) -> bool {
    let named = |node: Node| matches!(node.kind(), "identifier" | "field_access");
    if !named(first) || !named(second) {
        return false;
    }
    let scopes = OnceCell::new();
    key(context, &scopes, first).is_some_and(|found| key(context, &scopes, second) == Some(found))
}

/// What a name or field access stands for, to compare with `declared_key`.
pub struct SymbolKey(Key);

impl PartialEq for SymbolKey {
    fn eq(&self, other: &SymbolKey) -> bool {
        self.0 == other.0
    }
}

pub fn reference_key<'t>(context: &Context<'t>, node: Node<'t>) -> Option<SymbolKey> {
    if !plain(node) {
        return None;
    }
    key(context, &OnceCell::new(), node).map(SymbolKey)
}

/// The symbol a variable declaration declares: a declarator of a local or a field, or a parameter.
pub fn declared_key<'t>(context: &Context<'t>, declaration: Node<'t>) -> Option<SymbolKey> {
    match declaration.kind() {
        "variable_declarator" => {
            let holder = crate::engine::source::parent(declaration)?;
            match holder.kind() {
                "local_variable_declaration" => Some(SymbolKey(Key::Local(declaration.start_byte()))),
                "field_declaration" | "constant_declaration" => {
                    let owner = enclosing_type(context.file, context.resolver.scope, declaration)?;
                    Some(SymbolKey(Key::Field(owner, context.text(declaration.child_by_field_name("name")?).to_string())))
                }
                _ => None,
            }
        }
        "formal_parameter" | "spread_parameter" => Some(SymbolKey(Key::Local(declaration.start_byte()))),
        _ => None,
    }
}
