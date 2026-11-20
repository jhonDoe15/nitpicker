//! What a class stores in its fields: whether every stored value is one nobody can change, and whether the values
//! are all of one type that says more than the declared type of the field.
use super::Context;
use crate::engine::source::{ancestor, children, named_children, walk};
use crate::java::types::expr::Binding;
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
    walk(body, |node| match node.kind() {
        "variable_declarator" if node.child_by_field_name("name").is_some_and(|declared| context.text(declared) == name) => {
            values.extend(node.child_by_field_name("value"));
        }
        "assignment_expression" if node.child_by_field_name("left").is_some_and(|left| left.kind() == "identifier" && context.text(left) == name) => {
            values.extend(node.child_by_field_name("right"));
        }
        _ => {}
    });
    Some(values)
}

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

thread_local! {
    /// How deep the values are being followed. Local variables can name each other in a circle and a chain of
    /// `c ? a : b` can be thousands long, so the way down has an end: 8 local variables or 256 nested values.
    static FOLLOWED: std::cell::Cell<u16> = const { std::cell::Cell::new(0) };
}

const DEEPEST: u16 = 256;

pub fn immutable_value(context: &Context, value: Node) -> bool {
    let value = crate::java::types::expr::unwrap(value);
    let step = if value.kind() == "identifier" { DEEPEST / 8 } else { 1 };
    if FOLLOWED.get() + step > DEEPEST {
        return false;
    }
    FOLLOWED.set(FOLLOWED.get() + step);
    let fixed = settled(context, value);
    FOLLOWED.set(FOLLOWED.get() - step);
    fixed
}

fn settled(context: &Context, value: Node) -> bool {
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
        "identifier" => match local_values(context, value) {
            Some(values) => {
                // A local variable is judged by the values it is given: one value by itself, two values the way
                // the two sides of `c ? first : second` are. A value read from a field is judged by that field.
                let outside = |held: Node| !(held.start_byte() <= value.start_byte() && value.end_byte() <= held.end_byte());
                let apart = |held: Node| match held.kind() {
                    "identifier" => local_values(context, held).is_none(),
                    _ => outside(held),
                };
                let plain: Vec<Node> = values.iter().map(|held| crate::java::types::expr::unwrap(*held)).collect();
                match plain[..] {
                    [only] => apart(only) && immutable_value(context, only),
                    [first, second] => apart(first) && apart(second) && choice(context, first, second),
                    _ => false,
                }
            }
            None => false,
        },
        _ => false,
    }
}

/// Whether a value stored in the field `target` is one nobody can change, `None` when the store says nothing.
/// A value read from another field is judged by that field. The field read back into itself says nothing when
/// stored directly and counts against the field when it went through a local variable first.
fn stored_fixed(context: &Context, value: Node, target: &(String, String)) -> Option<bool> {
    let value = crate::java::types::expr::unwrap(value);
    let held = (value.kind() == "identifier").then(|| local_values(context, value)).flatten();
    let (source, direct) = match held.as_deref() {
        Some([only]) => (crate::java::types::expr::unwrap(*only), false),
        Some(_) => return Some(immutable_value(context, value)),
        None => (value, true),
    };
    match super::fields::field_key(context, source) {
        Some(key) if key == *target => (!direct).then_some(false),
        Some(_) => Some(super::fields::loaded_fixed(context, source)),
        None => Some(immutable_value(context, value)),
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

/// A value another class stores in the field. A call counts against the field only when SpotBugs has already
/// been through the class of the called method by the time it reads the store.
fn spoils(context: &Context, value: Node, by: &str, target: &(String, String)) -> bool {
    if stored_fixed(context, value, target) != Some(false) {
        return false;
    }
    let value = crate::java::types::expr::unwrap(value);
    if value.kind() != "method_invocation" {
        return true;
    }
    let index = context.resolver.index;
    context.resolver.resolve_call(value).is_some_and(|called| index.from_source(&called.declaring) && super::order::before(context, &called.declaring, by))
}

/// Fields of the class that are written at least once and only ever with values nobody can change. Stores of
/// another class count when SpotBugs comes to that class first.
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
    let stores = super::fields::stored(context);
    for (key, values) in stores.iter().filter(|((declaring, _), _)| declaring == own) {
        for store in values {
            if store.by == key.0 {
                if let Some(fine) = stored_fixed(context, store.value, key) {
                    settle(&key.1, fine);
                }
            } else if super::order::before(context, &store.by, own) {
                settle(&key.1, !spoils(context, store.value, &store.by, key));
            }
        }
    }
    verdicts.into_iter().filter(|(_, fine)| *fine).map(|(name, _)| name).collect()
}
