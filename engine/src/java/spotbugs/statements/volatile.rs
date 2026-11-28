//! VO_VOLATILE_INCREMENT: `field++` and the forms javac compiles to the same read, add one, write: `field--`,
//! `field += 1`, `field -= 1`, `field = field + 1`. Only an instance field of type `int` or `long` counts, and only
//! when the new value is not used; `field += 2`, `field = 1 + field` and static fields are silent.
use super::super::observed::field_key;
use super::super::{Context, names};
use crate::java::types::expr::unwrap;
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

/// The field written by an increment-shaped expression: its declaring class and name.
fn incremented(context: &Context, node: Node) -> Option<(String, String)> {
    match node.kind() {
        "update_expression" => field_key(context, unwrap(node.named_child(0)?)),
        "assignment_expression" => {
            let left = node.child_by_field_name("left")?;
            let right = unwrap(node.child_by_field_name("right")?);
            let operator = context.text(node.child_by_field_name("operator")?);
            let key = field_key(context, left)?;
            let long = matches!(field_of(context, &key)?.kind, Type::Primitive("long"));
            match operator {
                "+=" | "-=" => one(context, right, long).then_some(key),
                "=" if right.kind() == "binary_expression" => {
                    let symbol = context.text(right.child_by_field_name("operator")?);
                    let read = field_key(context, unwrap(right.child_by_field_name("left")?));
                    let added = one(context, unwrap(right.child_by_field_name("right")?), long);
                    (matches!(symbol, "+" | "-") && read.as_ref() == Some(&key) && added).then_some(key)
                }
                _ => None,
            }
        }
        _ => None,
    }
}

/// Whether a value is the constant javac loads with one instruction next to the add: 1 or -1, or only 1 for a long.
fn one(context: &Context, value: Node, long: bool) -> bool {
    let value = unwrap(value);
    let text = context.text(value).replace(char::is_whitespace, "");
    let named = match value.kind() {
        "identifier" | "field_access" => {
            let key = field_key(context, value).filter(|_| context.resolver.constant_field(value));
            let stored = key.and_then(|key| super::super::observed::field_stores(context).get(&key).and_then(|values| values.first().copied()));
            stored.map(|stored| context.text(unwrap(stored)).replace(char::is_whitespace, ""))
        }
        _ => None,
    };
    let text = named.unwrap_or(text);
    let text = text.trim_end_matches(['l', 'L']);
    text == "1" || (!long && text == "-1")
}

fn field_of<'a>(context: &Context<'a>, key: &(String, String)) -> Option<&'a crate::java::types::model::Field> {
    context.resolver.index.field(&key.0, &key.1).map(|(_, field)| field)
}

/// Whether the value of an expression is thrown away: a statement of its own, the update of a `for`, or the body of
/// a lambda whose method returns nothing.
fn unused(context: &Context, node: Node) -> bool {
    node.parent().is_some_and(|holder| match holder.kind() {
        "lambda_expression" => holder.child_by_field_name("body").is_some_and(|body| body.id() == node.id()) && {
            let target = context.resolver.lambda_target(holder);
            let method = target.and_then(|target| context.resolver.index.functional_method(&target.erased().name()).map(|(_, method)| method.returns.clone()));
            method == Some(Type::Primitive("void"))
        },
        "expression_statement" => true,
        "for_statement" => holder.child_by_field_name("update").is_some_and(|_| {
            let mut cursor = holder.walk();
            holder.children_by_field_name("update", &mut cursor).any(|update| update.id() == node.id())
        }),
        _ => false,
    })
}

pub fn check(context: &Context, node: Node, label: &str) {
    if !unused(context, node) {
        return;
    }
    let Some(key) = incremented(context, node) else { return };
    if !context.volatiles.contains(&key) {
        return;
    }
    let Some(field) = field_of(context, &key) else { return };
    if field.flags & flag::STATIC != 0 || !matches!(field.kind, Type::Primitive("int" | "long")) {
        return;
    }
    let at = node.parent().filter(|holder| holder.kind() == "expression_statement").unwrap_or(node);
    let message = format!("Increment of volatile field {}.{} in {label}", names::binary(context, &key.0), key.1);
    let place = super::super::place::member(context, &key.0, &key.1);
    let arguments = vec![format!("{}.{}", names::binary(context, &key.0), key.1), label.to_string()];
    context.report_listed("VO_VOLATILE_INCREMENT", at, context.line(at), message, place, 2, arguments);
}
