//! Every value the file stores in a field, and what the stored values say about the field: the one type they all
//! have, or whether a value read back from the field is one nobody can change.
use super::mutable::mutable;
use super::stores::immutable_value;
use super::Context;
use crate::engine::source::{parent, walk};
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_types;
use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use tree_sitter::Node;

pub struct Stored<'a> {
    pub value: Node<'a>,
    /// The class the store is written in.
    pub by: String,
}

/// Stores by declaring class and field name.
pub type StoredMap<'a> = HashMap<(String, String), Vec<Stored<'a>>>;

/// The declaring class and name of the field a name or an `object.name` expression stands for.
pub fn field_key(context: &Context, usage: Node) -> Option<(String, String)> {
    let index = context.resolver.index;
    match usage.kind() {
        "identifier" => match context.resolver.binding(usage, context.text(usage)) {
            Some(Binding::Field(_, declaring, field)) => Some((declaring.name.clone(), field.name.clone())),
            _ => None,
        },
        "field_access" => {
            let holder = usage.child_by_field_name("object").and_then(|object| match object.kind() {
                "this" => enclosing_types(context.resolver.scope, object).into_iter().next(),
                _ => match context.resolver.receiver(object) {
                    Some(Receiver::Value(Type::Class(class, _)) | Receiver::Static(class)) => Some(class.to_string()),
                    _ => None,
                },
            });
            let name = usage.child_by_field_name("field").map(|field| context.text(field));
            holder.zip(name).and_then(|(holder, name)| index.field(&holder, name)).map(|(declaring, field)| (declaring.name.clone(), field.name.clone()))
        }
        _ => None,
    }
}

pub fn stored<'a>(context: &Context<'a>) -> Rc<StoredMap<'a>> {
    if let Some(known) = context.stored.borrow().as_ref() {
        return known.clone();
    }
    let mut found: StoredMap<'a> = HashMap::new();
    let scope = context.resolver.scope;
    walk(context.file.tree.root_node(), |node| match node.kind() {
        "variable_declarator" if parent(node).is_some_and(|holder| holder.kind() == "field_declaration") => {
            let class = enclosing_types(scope, node).into_iter().next();
            if let (Some(class), Some(name), Some(value)) = (class, node.child_by_field_name("name"), node.child_by_field_name("value")) {
                found.entry((class.clone(), context.text(name).to_string())).or_default().push(Stored { value, by: class });
            }
        }
        "assignment_expression" => {
            let (Some(left), Some(value)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
            let by = enclosing_types(scope, node).into_iter().next();
            if let (Some(key), Some(by)) = (field_key(context, left), by) {
                found.entry(key).or_default().push(Stored { value, by });
            }
        }
        _ => {}
    });
    let found = Rc::new(found);
    *context.stored.borrow_mut() = Some(found.clone());
    found
}

/// Fields whose stored values, anywhere in the file, all have one type that can be changed although the declared
/// type of the field cannot.
pub fn widened(context: &Context) -> Rc<HashSet<(String, String)>> {
    if let Some(known) = context.widened.borrow().as_ref() {
        return known.clone();
    }
    let one_type = |values: &Vec<Stored>| {
        let mut all: Option<Option<Type>> = None;
        for store in values {
            let value = crate::java::types::expr::unwrap(store.value);
            if value.kind() == "null_literal" {
                continue;
            }
            let branches = (value.kind() == "ternary_expression").then(|| value.child_by_field_name("consequence").zip(value.child_by_field_name("alternative"))).flatten();
            let kind = match branches {
                Some((first, second)) => {
                    let (first, second) = (context.resolver.type_of(first), context.resolver.type_of(second));
                    first.filter(|first| second.as_ref().map(Type::name) == Some(first.name()))
                }
                None => context.resolver.type_of(value),
            };
            match &all {
                Some(seen) if seen.as_ref().map(Type::name) != kind.as_ref().map(Type::name) => return None,
                Some(_) => {}
                None => all = Some(kind),
            }
        }
        all.flatten()
    };
    let index = context.resolver.index;
    let found: HashSet<(String, String)> =
        stored(context).iter().filter(|(_, values)| one_type(values).is_some_and(|kind| mutable(index, &kind))).map(|(key, _)| key.clone()).collect();
    let found = Rc::new(found);
    *context.widened.borrow_mut() = Some(found.clone());
    found
}

/// A value read from a field and stored again counts as one nobody can change when the field it comes from was
/// given such a value at least once.
pub fn loaded_fixed(context: &Context, usage: Node) -> bool {
    let Some(key) = field_key(context, usage) else { return false };
    if !context.loading.borrow_mut().insert(key.clone()) {
        return false;
    }
    let stores = stored(context);
    let fixed = stores.get(&key).is_some_and(|values| values.iter().any(|store| immutable_value(context, store.value)));
    context.loading.borrow_mut().remove(&key);
    fixed
}
