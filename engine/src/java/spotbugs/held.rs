//! Private fields that hold nothing but what callers passed in. SpotBugs reports a store of such a field into another
//! field like a store of the parameter itself, naming the variable `?`.
use super::Context;
use super::fields::stored;
use super::flow::{Item, trace};
use crate::engine::source::{children, named_children};
use crate::java::helpers::has_modifier;
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

#[derive(Default)]
struct Seen {
    stores: usize,
    params: usize,
    in_constructor: bool,
}

/// The private fields of the class whose every store is a parameter of the method making it, with at least one of those
/// stores in a constructor, or the field static.
pub fn parameter_fields(context: &Context, class: Node, own: &str, members: &[Node]) -> HashSet<String> {
    let Some(body) = class.child_by_field_name("body") else { return HashSet::new() };
    let mut statics = HashSet::new();
    let mut seen: HashMap<String, Seen> = HashMap::new();
    let private = |part: &Node| part.kind() == "field_declaration" && has_modifier(*part, "private");
    for field in children(body).into_iter().filter(private) {
        for declarator in named_children(field).into_iter().filter(|part| part.kind() == "variable_declarator") {
            let Some(name) = declarator.child_by_field_name("name").map(|name| context.text(name).to_string()) else { continue };
            if has_modifier(field, "static") {
                statics.insert(name.clone());
            }
            seen.insert(name, Seen::default());
        }
    }
    if seen.is_empty() {
        return HashSet::new();
    }
    for member in members {
        let kind = member.kind();
        if !matches!(kind, "method_declaration" | "constructor_declaration") {
            continue;
        }
        let Some(block) = member.child_by_field_name("body") else { continue };
        let formals = member.child_by_field_name("parameters").map(named_children).unwrap_or_default();
        for store in trace(context, &formals, block).stores {
            let Some(found) = seen.get_mut(&store.field.name).filter(|_| store.field.declaring == own) else { continue };
            found.stores += 1;
            if matches!(store.item, Item::Param(..)) {
                found.params += 1;
                found.in_constructor |= kind == "constructor_declaration";
            }
        }
    }
    let all = context.store_counts.get_or_init(|| stored(context).into_iter().map(|(key, values)| (key, values.len())).collect());
    seen.into_iter()
        .filter(|(name, found)| {
            let everywhere = all.get(&(own.to_string(), name.clone())).copied().unwrap_or(0);
            found.params > 0 && found.params == found.stores && found.stores == everywhere && (found.in_constructor || statics.contains(name))
        })
        .map(|(name, _)| name)
        .collect()
}
