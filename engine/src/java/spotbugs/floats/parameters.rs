//! Which side of a comparison FindFloatEquality takes for a parameter as passed.
use super::super::Context;
use super::super::dumb::numbers::stores::{local, stores};
use super::super::dumb::numbers::values::operator;
use super::super::fields::{field_key, stored};
use super::values::same_type;
use crate::engine::source::{ancestor, named_children, parent, walk};
use crate::java::types::expr::unwrap;
use crate::java::types::model::flag;
use std::cell::OnceCell;
use tree_sitter::Node;

const DEPTH: usize = 6;
const FUNCTIONS: &[&str] = &["method_declaration", "constructor_declaration", "lambda_expression", "compact_constructor_declaration"];

fn parameter(context: &Context, node: Node) -> bool {
    if !local(context, node) {
        return false;
    }
    let name = context.text(node);
    let mut at = parent(node);
    while let Some(around) = at {
        if FUNCTIONS.contains(&around.kind()) {
            let Some(list) = around.child_by_field_name("parameters") else { return false };
            let named = |part: Node| part.child_by_field_name("name").map_or(part.kind() == "identifier" && context.text(part) == name, |declared| context.text(declared) == name);
            return list.kind() == "identifier" && context.text(list) == name || named_children(list).into_iter().any(named);
        }
        at = parent(around);
    }
    false
}

/// Whether a local is one a lambda, an anonymous or a local class reads from the code around it: javac passes it in
/// as a parameter or a field set from one.
fn captured(context: &Context, node: Node) -> bool {
    if !local(context, node) {
        return false;
    }
    let name = context.text(node);
    let Some(inside) = ancestor(node, &["lambda_expression", "class_body"]) else { return false };
    let mut declared = false;
    walk(inside, |part| {
        let named = match part.kind() {
            "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "spread_parameter" => part.child_by_field_name("name"),
            "enhanced_for_statement" => part.child_by_field_name("name"),
            "inferred_parameters" => None,
            "identifier" => parent(part).filter(|above| above.kind() == "inferred_parameters" || (above.kind() == "lambda_expression" && above.child_by_field_name("parameters") == Some(part))).map(|_| part),
            _ => None,
        };
        declared |= named.is_some_and(|named| context.text(named) == name);
    });
    !declared
}

/// What a file stores in its fields, worked out once.
pub struct Stores<'a> {
    stored: OnceCell<super::super::fields::StoredMap<'a>>,
}

impl<'a> Stores<'a> {
    pub fn new() -> Self {
        Stores { stored: OnceCell::new() }
    }

    /// Whether a side holds a parameter as passed: the parameter, a `Double` one unboxed, a local a lambda or inner
    /// class captures, a local or ternary holding only such values, or a `final` field not `public` that the class stores only parameters in.
    pub fn parameter_like(&self, context: &Context<'a>, node: Node<'a>, depth: usize) -> bool {
        let node = unwrap(node);
        if depth > DEPTH {
            return false;
        }
        match node.kind() {
            "identifier" if (parameter(context, node) || captured(context, node)) && stores(context, node, context.text(node)).is_empty() => true,
            "identifier" if local(context, node) => {
                let held = stores(context, node, context.text(node));
                !held.is_empty() && held.iter().all(|store| match store.kind() {
                    "variable_declarator" => store.child_by_field_name("value").is_some_and(|value| self.parameter_like(context, value, depth + 1)),
                    "assignment_expression" if operator(context, *store) == "=" => store.child_by_field_name("right").is_some_and(|value| self.parameter_like(context, value, depth + 1)),
                    _ => false,
                })
            }
            "cast_expression" if same_type(context, node) => node.child_by_field_name("value").is_some_and(|value| self.parameter_like(context, value, depth + 1)),
            "ternary_expression" => ["consequence", "alternative"].iter().all(|name| node.child_by_field_name(name).is_some_and(|value| self.parameter_like(context, value, depth + 1))),
            "method_invocation" => {
                let unboxing = node.child_by_field_name("name").is_some_and(|name| matches!(context.text(name), "doubleValue" | "floatValue"));
                let empty = node.child_by_field_name("arguments").is_some_and(|arguments| named_children(arguments).is_empty());
                unboxing && empty && node.child_by_field_name("object").is_some_and(|object| self.parameter_like(context, object, depth + 1))
            }
            "identifier" | "field_access" => self.final_parameter(context, node, depth),
            _ => false,
        }
    }

    fn final_parameter(&self, context: &Context<'a>, node: Node<'a>, depth: usize) -> bool {
        let Some(key) = field_key(context, node) else { return false };
        let Some((_, field)) = context.resolver.index.field(&key.0, &key.1) else { return false };
        if field.flags & flag::FINAL == 0 || field.flags & flag::PUBLIC != 0 {
            return false;
        }
        let declared = context.classes.contains_key(&key.0);
        let stored = self.stored.get_or_init(|| stored(context));
        let values = stored.get(&key).map(Vec::as_slice).unwrap_or_default();
        declared && !values.is_empty() && values.iter().all(|store| self.parameter_like(context, store.value, depth + 1))
    }
}
