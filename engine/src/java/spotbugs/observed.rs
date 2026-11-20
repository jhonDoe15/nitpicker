//! The type SpotBugs works with for a value. It reads compiled code, so it knows a field or a local variable by what
//! was stored in it rather than by how it was declared: a `Map` field only ever given `new ConcurrentHashMap<>()` is
//! a `ConcurrentHashMap` to it.
use super::Context;
use crate::engine::source::{ancestor, children, parent, walk};
use crate::java::types::expr::{Binding, Receiver, unwrap};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_types;
use std::collections::HashMap;
use std::rc::Rc;
use tree_sitter::Node;

const BODIES: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "lambda_expression", "static_initializer"];
const DEPTH: usize = 6;

pub type Stores<'t> = HashMap<(String, String), Vec<Node<'t>>>;

/// The field an expression reads or writes, as the class that declares it and its name.
pub fn field_key(context: &Context, written: Node) -> Option<(String, String)> {
    let index = context.resolver.index;
    match written.kind() {
        "identifier" => match context.resolver.binding(written, context.text(written)) {
            Some(Binding::Field(_, declaring, field)) => Some((declaring.name.clone(), field.name.clone())),
            _ => None,
        },
        "field_access" => {
            let holder = written.child_by_field_name("object").and_then(|object| match object.kind() {
                "this" => enclosing_types(context.resolver.scope, object).into_iter().next(),
                _ => match context.resolver.receiver(object) {
                    Some(Receiver::Value(Type::Class(class, _)) | Receiver::Static(class)) => Some(class.to_string()),
                    _ => None,
                },
            });
            let name = written.child_by_field_name("field").map(|field| context.text(field));
            holder.zip(name).and_then(|(holder, name)| index.field(&holder, name)).map(|(declaring, field)| (declaring.name.clone(), field.name.clone()))
        }
        _ => None,
    }
}

/// Every value the file stores in a field, by field, worked out once.
pub fn field_stores<'a>(context: &Context<'a>) -> Rc<Stores<'a>> {
    if let Some(known) = context.stores.borrow().as_ref() {
        return known.clone();
    }
    let mut stored: Stores = HashMap::new();
    walk(context.file.tree.root_node(), |node| match node.kind() {
        "variable_declarator" if parent(node).is_some_and(|holder| holder.kind() == "field_declaration") => {
            let class = enclosing_types(context.resolver.scope, node).into_iter().next();
            if let (Some(class), Some(name), Some(value)) = (class, node.child_by_field_name("name"), node.child_by_field_name("value")) {
                stored.entry((class, context.text(name).to_string())).or_default().push(value);
            }
        }
        "assignment_expression" => {
            let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
            if let Some(key) = field_key(context, left) {
                stored.entry(key).or_default().push(right);
            }
        }
        _ => {}
    });
    let stored = Rc::new(stored);
    *context.stores.borrow_mut() = Some(stored.clone());
    stored
}

fn same(all: Vec<Option<Type>>) -> Option<Type> {
    let mut all = all.into_iter();
    let first = all.next()??;
    all.all(|next| next.as_ref().map(Type::name) == Some(first.name())).then_some(first)
}

fn field_type(context: &Context, key: &(String, String), declared: Type, depth: usize) -> Option<Type> {
    if !context.classes.contains_key(&key.0) {
        return Some(declared);
    }
    let stores = field_stores(context);
    let values: Vec<Node> = stores.get(key).into_iter().flatten().map(|value| unwrap(*value)).filter(|value| value.kind() != "null_literal").collect();
    if values.is_empty() {
        return stores.get(key).is_none().then_some(declared);
    }
    same(values.into_iter().map(|value| observed_at(context, value, depth + 1)).collect()).or(Some(declared))
}

fn caught(context: &Context, usage: Node, name: &str) -> bool {
    let mut at = parent(usage);
    while let Some(node) = at {
        if node.kind() == "catch_clause" {
            let named = children(node)
                .into_iter()
                .filter(|part| part.kind() == "catch_formal_parameter")
                .any(|formal| formal.child_by_field_name("name").is_some_and(|declared| context.text(declared) == name));
            if named {
                return true;
            }
        }
        at = parent(node);
    }
    false
}

/// The value a local variable holds at a use: the last one given to it before, when there is one.
fn local_value<'t>(context: &Context, usage: Node<'t>, name: &str) -> Option<Node<'t>> {
    let body = ancestor(usage, BODIES)?;
    let mut last: Option<Node> = None;
    walk(body, |node| {
        let value = match node.kind() {
            "variable_declarator" if node.child_by_field_name("name").is_some_and(|declared| context.text(declared) == name) => node.child_by_field_name("value"),
            "assignment_expression" if node.child_by_field_name("left").is_some_and(|left| left.kind() == "identifier" && context.text(left) == name) => {
                node.child_by_field_name("right")
            }
            _ => None,
        };
        if let Some(value) = value.filter(|value| value.end_byte() <= usage.start_byte()) {
            last = Some(value);
        }
    });
    last
}

fn observed_at(context: &Context, value: Node, depth: usize) -> Option<Type> {
    let value = unwrap(value);
    let resolver = context.resolver;
    if depth > DEPTH {
        return resolver.type_of(value);
    }
    match value.kind() {
        "null_literal" => None,
        "ternary_expression" => {
            let sides = [value.child_by_field_name("consequence")?, value.child_by_field_name("alternative")?];
            let known: Vec<Node> = sides.into_iter().map(unwrap).filter(|side| side.kind() != "null_literal").collect();
            same(known.into_iter().map(|side| observed_at(context, side, depth + 1)).collect())
        }
        "identifier" => {
            let name = context.text(value);
            let Some(bound) = resolver.binding(value, name) else { return resolver.type_of(value) };
            match bound {
                Binding::Field(_, declaring, field) => field_type(context, &(declaring.name.clone(), field.name.clone()), field.kind.clone(), depth),
                Binding::Local(declared) => {
                    if caught(context, value, name) || matches!(declared, Some(Type::Variable(_))) {
                        return None;
                    }
                    match local_value(context, value, name) {
                        Some(held) => observed_at(context, held, depth + 1),
                        None => declared,
                    }
                }
            }
        }
        "field_access" => {
            let declared = resolver.type_of(value)?;
            match field_key(context, value) {
                Some(key) => field_type(context, &key, declared, depth),
                None => Some(declared),
            }
        }
        _ => resolver.type_of(value),
    }
}

/// The type of a value as SpotBugs has it; nothing when it cannot say.
pub fn observed(context: &Context, value: Node) -> Option<Type> {
    observed_at(context, value, 0)
}
