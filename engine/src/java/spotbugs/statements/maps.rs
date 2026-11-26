//! WMI_WRONG_MAP_ITERATOR: a key taken from a map's `keySet()` and then looked up in the same map with `get`.
//! The map is a local variable, a field of `this` or a static field; the key is the variable of a loop over the
//! key set, or a variable given `iterator.next()` of the key set's iterator. One report per method, at the first
//! such `get` for each map field, and one for all local maps together. Sorted maps other than `TreeMap`, `EnumMap` and `ConcurrentHashMap` are not reported.
use super::super::observed::field_key;
use super::super::Context;
use crate::engine::source::{children, walk};
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::Type;
use tree_sitter::Node;

/// Where a map lives, so two reads of it can be matched: a local variable by name, or a field.
#[derive(PartialEq, Clone)]
enum Slot {
    This,
    Local(String),
    Field(String, String),
}

fn bare(mut node: Node) -> Node {
    loop {
        node = unwrap(node);
        match node.kind() {
            "cast_expression" => match node.child_by_field_name("value") {
                Some(value) => node = value,
                None => return node,
            },
            _ => return node,
        }
    }
}

fn slot(context: &Context, node: Node) -> Option<Slot> {
    let node = bare(node);
    match node.kind() {
        "identifier" => match context.resolver.binding(node, context.text(node))? {
            Binding::Local(_) => Some(Slot::Local(context.text(node).to_string())),
            Binding::Field(..) => field_key(context, node).map(|(class, name)| Slot::Field(class, name)),
        },
        "field_access" if node.child_by_field_name("object").is_some_and(|object| object.kind() == "this") => {
            field_key(context, node).map(|(class, name)| Slot::Field(class, name))
        }
        _ => None,
    }
}

/// A call `name()` with the given argument count, and its receiver.
fn call<'t>(context: &Context, node: Node<'t>, name: &str, arguments: usize) -> Option<Node<'t>> {
    let node = bare(node);
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|called| context.text(called) != name) {
        return None;
    }
    let given = node.child_by_field_name("arguments").map(|list| children(list).into_iter().filter(|part| part.is_named() && !part.kind().ends_with("comment")).count());
    (given == Some(arguments)).then(|| node.child_by_field_name("object").unwrap_or(node))
}

/// The receiver of a call `call` returned: the call itself stands for a call on `this`.
fn receiver_slot(context: &Context, receiver: Node) -> Option<Slot> {
    if receiver.kind() == "method_invocation" && receiver.child_by_field_name("object").is_none() {
        return Some(Slot::This);
    }
    slot(context, receiver)
}

fn receiver_type(context: &Context, receiver: Node) -> Option<Type> {
    if receiver.kind() == "method_invocation" && receiver.child_by_field_name("object").is_none() {
        let own = crate::java::types::scope::enclosing_types(context.resolver.scope, receiver).into_iter().next()?;
        return Some(Type::class(&own));
    }
    context.resolver.type_of(receiver)
}

/// The map whose key set an expression is, when its type is one SpotBugs follows.
fn key_set_of(context: &Context, node: Node) -> Option<Slot> {
    let map = call(context, node, "keySet", 0)?;
    let Some(Type::Class(name, _)) = receiver_type(context, map).map(|kind| kind.erased()) else { return None };
    let index = context.resolver.index;
    let sorted = index.is_subtype(&name, "java.util.SortedMap") && !index.is_subtype(&name, "java.util.TreeMap");
    let skipped = sorted || index.is_subtype(&name, "java.util.EnumMap") || index.is_subtype(&name, "java.util.concurrent.ConcurrentHashMap");
    if !index.is_subtype(&name, "java.util.Map") || skipped {
        return None;
    }
    receiver_slot(context, map)
}

/// The value a local variable was declared with, in the member.
fn declared_value<'t>(context: &Context, member: Node<'t>, name: &str) -> Option<Node<'t>> {
    let mut found = None;
    walk(member, |node| {
        if node.kind() == "variable_declarator" && node.child_by_field_name("name").is_some_and(|declared| context.text(declared) == name) {
            found = found.or(node.child_by_field_name("value"));
        }
    });
    found
}

fn assigned(context: &Context, scope: Node, name: &str) -> bool {
    let mut found = false;
    walk(scope, |node| {
        let target = match node.kind() {
            "assignment_expression" => node.child_by_field_name("left"),
            "update_expression" => node.named_child(0),
            _ => None,
        };
        found |= target.is_some_and(|target| target.kind() == "identifier" && context.text(target) == name);
    });
    found
}

/// A key variable with the map it came from and the code where it holds that key.
struct Key<'t> {
    name: String,
    map: Slot,
    scope: Node<'t>,
}

fn keys<'t>(context: &Context, member: Node<'t>, nodes: &[Node<'t>]) -> (Vec<Key<'t>>, Vec<(Node<'t>, Slot)>) {
    let mut found = Vec::new();
    let mut direct = Vec::new();
    for node in nodes {
        match node.kind() {
            "enhanced_for_statement" => {
                let (Some(value), Some(name), Some(body)) =
                    (node.child_by_field_name("value"), node.child_by_field_name("name"), node.child_by_field_name("body"))
                else {
                    continue;
                };
                let value = bare(value);
                let source = match value.kind() {
                    "identifier" => declared_value(context, member, context.text(value)),
                    _ => Some(value),
                };
                if let Some(map) = source.and_then(|source| key_set_of(context, source)) {
                    found.push(Key { name: context.text(name).to_string(), map, scope: body });
                }
            }
            "method_invocation" => {
                let Some(iterator) = call(context, *node, "next", 0) else { continue };
                let made = match iterator.kind() {
                    "identifier" => declared_value(context, member, context.text(iterator)),
                    _ => Some(iterator),
                };
                let Some(map) = made.and_then(|value| call(context, value, "iterator", 0)).and_then(|set| key_set_of(context, set)) else {
                    continue;
                };
                let holder = node.parent();
                match holder.map(|holder| holder.kind()) {
                    Some("variable_declarator") => {
                        let name = holder.and_then(|holder| holder.child_by_field_name("name")).map(|name| context.text(name).to_string());
                        let block = holder.and_then(|holder| holder.parent()).and_then(|statement| statement.parent());
                        if let (Some(name), Some(scope)) = (name, block) {
                            found.push(Key { name, map, scope });
                        }
                    }
                    _ => direct.push((*node, map)),
                }
            }
            _ => {}
        }
    }
    (found, direct)
}

pub fn check(context: &Context, member: Node, nodes: &[Node], label: &str) {
    let (keys, direct) = keys(context, member, nodes);
    if keys.is_empty() && direct.is_empty() {
        return;
    }
    let mut first: Vec<(Slot, Node)> = Vec::new();
    for node in nodes {
        let Some(map) = call(context, *node, "get", 1) else { continue };
        let Some(argument) = node.child_by_field_name("arguments").and_then(|list| list.named_children(&mut list.walk()).find(|part| !part.kind().ends_with("comment"))) else {
            continue;
        };
        let argument = bare(argument);
        let Some(read) = receiver_slot(context, map) else { continue };
        let keyed = keys.iter().any(|key| {
            let inside = key.scope.start_byte() <= node.start_byte() && node.end_byte() <= key.scope.end_byte();
            inside && argument.kind() == "identifier" && context.text(argument) == key.name && key.map == read && !assigned(context, key.scope, &key.name)
        });
        let next = direct.iter().any(|(call, map)| call.id() == argument.id() && *map == read);
        if !(keyed || next) {
            continue;
        }
        let read = match read {
            Slot::Field(..) => read,
            _ => Slot::This,
        };
        match first.iter_mut().find(|(known, _)| *known == read) {
            Some((_, at)) if node.start_byte() < at.start_byte() => *at = *node,
            Some(_) => {}
            None => first.push((read, *node)),
        }
    }
    for (slot, get) in first {
        if let Some(at) = get.child_by_field_name("name") {
            let place = match &slot {
                Slot::Field(class, name) => super::super::place::member(context, class, name),
                _ => super::super::place::function(label),
            };
            let message = format!("{label} makes inefficient use of keySet iterator instead of entrySet iterator");
            context.report_placed("WMI_WRONG_MAP_ITERATOR", at, context.line(at), message, place, 2);
        }
    }
}
