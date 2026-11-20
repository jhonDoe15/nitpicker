//! What a class stores in its fields: whether every stored value is one nobody can change, and whether the values
//! are all of one type that says more than the declared type of the field.
use super::mutable::mutable;
use super::Context;
use crate::engine::source::{ancestor, children, named_children, walk};
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::Type;
use crate::java::types::scope::{TYPE_DECLARATIONS, enclosing_types};
use std::collections::{HashMap, HashSet};
use std::rc::Rc;
use tree_sitter::Node;

const BODIES: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration", "lambda_expression"];

/// Every value a local variable is given in its method, when the name is a local variable.
fn local_values<'t>(context: &Context, usage: Node<'t>) -> Option<Vec<Node<'t>>> {
    let name = context.text(usage);
    if !matches!(context.resolver.binding(usage, name), Some(Binding::Local(..))) {
        return None;
    }
    let body = ancestor(usage, BODIES)?;
    let mut values = Vec::new();
    let mut open = false;
    walk(body, |node| match node.kind() {
        "variable_declarator" if node.child_by_field_name("name").is_some_and(|declared| context.text(declared) == name) => {
            match node.child_by_field_name("value") {
                Some(value) => values.push(value),
                None => open = true,
            }
        }
        "assignment_expression" if node.child_by_field_name("left").is_some_and(|left| left.kind() == "identifier" && context.text(left) == name) => {
            match node.child_by_field_name("right") {
                Some(value) => values.push(value),
                None => open = true,
            }
        }
        _ => {}
    });
    let _ = open;
    Some(values)
}

/// Calls whose result cannot be changed by the caller.
/// `Arrays.asList(...)`, written in place or kept in a local variable: a list that still changes with its array.
fn array_view(context: &Context, value: Node) -> bool {
    let value = crate::java::types::expr::unwrap(value);
    let as_list = |call: Node| {
        call.kind() == "method_invocation"
            && call.child_by_field_name("name").is_some_and(|name| context.text(name) == "asList")
            && call.child_by_field_name("object").is_some_and(|owner| context.text(owner).rsplit('.').next() == Some("Arrays"))
    };
    if value.kind() != "identifier" {
        return as_list(value);
    }
    let Some(body) = crate::engine::source::ancestor(value, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"]) else {
        return false;
    };
    let mut found = false;
    walk(body, |node| {
        found |= node.kind() == "variable_declarator"
            && node.child_by_field_name("name").is_some_and(|name| context.text(name) == context.text(value))
            && node.child_by_field_name("value").is_some_and(as_list);
    });
    found
}

/// The class and name of a call when it makes a value nobody can change.
fn producer<'s>(context: &'s Context, call: Node) -> Option<(String, &'s str)> {
    if call.kind() != "method_invocation" {
        return None;
    }
    let name = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let imported = || context.resolver.resolve_call(call).map(|found| found.declaring).filter(|owner| owner.starts_with("java.util."));
    let owner = call.child_by_field_name("object").map(|object| context.text(object).to_string()).or_else(imported).unwrap_or_default();
    let owner = owner.rsplit('.').next().unwrap_or_default().to_string();
    let known = match owner.as_str() {
        "Collections" => matches!(
            name,
            "emptyList" | "emptyMap" | "emptySet" | "emptySortedMap" | "emptySortedSet" | "emptyNavigableMap" | "emptyNavigableSet"
                | "singleton" | "singletonList" | "singletonMap" | "unmodifiableList" | "unmodifiableMap" | "unmodifiableSet"
                | "unmodifiableSortedMap" | "unmodifiableSortedSet" | "unmodifiableNavigableMap" | "unmodifiableNavigableSet"
        ),
        "List" | "Set" | "Map" => matches!(name, "of" | "copyOf"),
        _ => false,
    };
    known.then_some((owner, name))
}

/// The collection a call wraps or copies: `unmodifiableList(x)`, `List.copyOf(x)`.
fn wrapped<'t>(context: &Context, call: Node<'t>) -> Option<Node<'t>> {
    let (_, name) = producer(context, call)?;
    let first = call.child_by_field_name("arguments").map(named_children)?.into_iter().next()?;
    (name.starts_with("unmodifiable") || name == "copyOf").then_some(first)
}

fn immutable_call(context: &Context, call: Node) -> bool {
    producer(context, call).is_some() && !wrapped(context, call).is_some_and(|inner| call_name(context, call).starts_with("unmodifiable") && array_view(context, inner))
}

fn call_name<'s>(context: &'s Context, call: Node) -> &'s str {
    call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

/// `c ? first : second` stored in a field. What SpotBugs concludes follows the compiled form more than the meaning,
/// so this is the table measured on test code: the first value leads, and only some second values overturn it.
fn choice(context: &Context, first: Node, second: Node) -> bool {
    let empty_array = |value: Node| matches!(value.kind(), "array_creation_expression" | "array_initializer");
    if first.kind() == "null_literal" || empty_array(first) || empty_array(second) {
        return immutable_value(context, second);
    }
    if !immutable_value(context, first) {
        return false;
    }
    match second.kind() {
        "identifier" | "field_access" | "null_literal" => true,
        "ternary_expression" => immutable_value(context, second),
        "method_invocation" => {
            if second.child_by_field_name("arguments").is_some_and(|list| named_children(list).is_empty()) {
                return true;
            }
            let Some(inner) = wrapped(context, second) else { return immutable_call(context, second) };
            if immutable_value(context, inner) && crate::java::types::expr::unwrap(inner).kind() != "identifier" {
                return true;
            }
            let (Some((first_owner, first_name)), Some((_, second_name))) = (producer(context, first), producer(context, second)) else { return false };
            immutable_call(context, second) && (first_name == second_name || (first_owner != "Collections" && second_name == "copyOf"))
        }
        _ => false,
    }
}

pub fn immutable_value(context: &Context, value: Node) -> bool {
    let value = crate::java::types::expr::unwrap(value);
    match value.kind() {
        "null_literal" => true,
        "array_initializer" => named_children(value).is_empty(),
        "array_creation_expression" => {
            let parts = children(value);
            let empty = parts.iter().find(|part| part.kind() == "array_initializer").map(|list| named_children(*list).is_empty());
            let sizes: Vec<Node> = parts.iter().filter(|part| part.kind() == "dimensions_expr").copied().collect();
            let zero = sizes.len() == 1 && sizes[0].named_child(0).is_some_and(|size| context.text(size) == "0");
            empty.unwrap_or(zero)
        }
        "method_invocation" => immutable_call(context, value),
        "ternary_expression" => {
            let (Some(first), Some(second)) = (value.child_by_field_name("consequence"), value.child_by_field_name("alternative")) else { return false };
            choice(context, crate::java::types::expr::unwrap(first), crate::java::types::expr::unwrap(second))
        }
        "identifier" => local_values(context, value).is_some_and(|values| {
            let apart = |held: Node| held.kind() != "identifier" && !(held.start_byte() <= value.start_byte() && value.end_byte() <= held.end_byte());
            values.len() == 1 && apart(values[0]) && immutable_value(context, values[0])
        }),
        _ => false,
    }
}

/// The fixed fields of a class of this file, worked out once.
pub fn fixed_of(context: &Context, own: &str) -> Rc<HashSet<String>> {
    if let Some(known) = context.fixed.borrow().get(own) {
        return known.clone();
    }
    let found = Rc::new(context.classes.get(own).map(|class| fixed_fields(context, *class, own)).unwrap_or_default());
    context.fixed.borrow_mut().insert(own.to_string(), found.clone());
    found
}

/// Fields of the class that are written at least once and only ever with values nobody can change.
fn fixed_fields(context: &Context, class: Node, own: &str) -> HashSet<String> {
    let mut verdicts: HashMap<String, bool> = HashMap::new();
    let mut settle = |name: &str, fine: bool| {
        verdicts.entry(name.to_string()).and_modify(|all| *all &= fine).or_insert(fine);
    };
    let Some(body) = class.child_by_field_name("body") else { return HashSet::new() };
    let compact = children(body).into_iter().find(|member| member.kind() == "compact_constructor_declaration");
    if let Some(end) = compact.and_then(|compact| compact.child_by_field_name("body")).and_then(|block| {
        let components = class.child_by_field_name("parameters").map(named_children).unwrap_or_default();
        super::flow::trace(context, &components, block).end
    }) {
        for (name, item) in &end {
            settle(name, matches!(item, super::flow::Item::Fixed));
        }
    }
    let mut stack = vec![body];
    while let Some(node) = stack.pop() {
        for part in children(node) {
            if TYPE_DECLARATIONS.contains(&part.kind()) || part.kind() == "class_body" {
                continue;
            }
            match part.kind() {
                "field_declaration" => {
                    for declarator in children(part).into_iter().filter(|d| d.kind() == "variable_declarator") {
                        if let (Some(name), Some(value)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value")) {
                            settle(context.text(name), immutable_value(context, value));
                        }
                    }
                }
                "assignment_expression" => {
                    let (Some(left), Some(right)) = (part.child_by_field_name("left"), part.child_by_field_name("right")) else { continue };
                    let name = match left.kind() {
                        "identifier" => match context.resolver.binding(left, context.text(left)) {
                            Some(Binding::Field(_, declaring, field)) if declaring.name == own => Some(field.name.clone()),
                            _ => None,
                        },
                        "field_access" => {
                            let through_own = left.child_by_field_name("object").is_some_and(|object| {
                                object.kind() == "this"
                                    || matches!(context.resolver.receiver(object), Some(Receiver::Value(Type::Class(class, _)) | Receiver::Static(class)) if class == own)
                            });
                            left.child_by_field_name("field").filter(|_| through_own).map(|field| context.text(field).to_string())
                        }
                        _ => None,
                    };
                    if let Some(name) = name {
                        settle(&name, immutable_value(context, right));
                    }
                }
                _ => {}
            }
            stack.push(part);
        }
    }
    verdicts.into_iter().filter(|(_, fine)| *fine).map(|(name, _)| name).collect()
}

/// Fields whose stored values, anywhere in the file, all have one type that can be changed although the declared
/// type of the field cannot.
pub fn widened(context: &Context) -> Rc<HashSet<(String, String)>> {
    if let Some(known) = context.widened.borrow().as_ref() {
        return known.clone();
    }
    let index = context.resolver.index;
    let mut stored: HashMap<(String, String), Option<Type>> = HashMap::new();
    let mut note = |key: (String, String), value: Node| {
        let value = crate::java::types::expr::unwrap(value);
        if value.kind() == "null_literal" {
            return;
        }
        let branches = (value.kind() == "ternary_expression").then(|| value.child_by_field_name("consequence").zip(value.child_by_field_name("alternative"))).flatten();
        let kind = match branches {
            Some((first, second)) => {
                let (first, second) = (context.resolver.type_of(first), context.resolver.type_of(second));
                first.filter(|first| second.as_ref().map(Type::name) == Some(first.name()))
            }
            None => context.resolver.type_of(value),
        };
        stored.entry(key).and_modify(|all| {
            if all.as_ref().map(Type::name) != kind.as_ref().map(Type::name) {
                *all = None;
            }
        }).or_insert(kind);
    };
    walk(context.file.tree.root_node(), |node| match node.kind() {
        "variable_declarator" if crate::engine::source::parent(node).is_some_and(|holder| holder.kind() == "field_declaration") => {
            let class = enclosing_types(context.resolver.scope, node).into_iter().next();
            if let (Some(class), Some(name), Some(value)) = (class, node.child_by_field_name("name"), node.child_by_field_name("value")) {
                note((class, context.text(name).to_string()), value);
            }
        }
        "assignment_expression" => {
            let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
            let key = match left.kind() {
                "identifier" => match context.resolver.binding(left, context.text(left)) {
                    Some(Binding::Field(_, declaring, field)) => Some((declaring.name.clone(), field.name.clone())),
                    _ => None,
                },
                "field_access" => {
                    let holder = left.child_by_field_name("object").and_then(|object| match object.kind() {
                        "this" => enclosing_types(context.resolver.scope, object).into_iter().next(),
                        _ => match context.resolver.receiver(object) {
                            Some(Receiver::Value(Type::Class(class, _)) | Receiver::Static(class)) => Some(class.to_string()),
                            _ => None,
                        },
                    });
                    let name = left.child_by_field_name("field").map(|field| context.text(field));
                    holder.zip(name).and_then(|(holder, name)| index.field(&holder, name)).map(|(declaring, field)| (declaring.name.clone(), field.name.clone()))
                }
                _ => None,
            };
            if let Some(key) = key {
                note(key, right);
            }
        }
        _ => {}
    });
    let found: HashSet<(String, String)> = stored.into_iter().filter(|(_, kind)| kind.as_ref().is_some_and(|kind| mutable(index, kind))).map(|(key, _)| key).collect();
    let found = Rc::new(found);
    *context.widened.borrow_mut() = Some(found.clone());
    found
}
