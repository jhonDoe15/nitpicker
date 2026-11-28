//! MixedMutabilityReturnType: a method gives back a mutable collection on one path and an immutable one on another.
use super::Context;
use super::mutability_fix;
use super::vars::{Named, named};
use crate::engine::source::{children, named_children};
use crate::java::types::model::Type;
use tree_sitter::Node;

const NAME: &str = "MixedMutabilityReturnType";
const SUMMARY: &str = "This method returns both mutable and immutable collections or maps from different paths. This may be confusing for users of the method.";
const FACTORIES: [&str; 5] = ["emptyList", "emptyMap", "emptySet", "singleton", "singletonList"];
const IMMUTABLE: [&str; 2] = ["com.google.common.collect.ImmutableCollection", "com.google.common.collect.ImmutableMap"];
const MUTABLE: [&str; 7] = [
    "java.util.ArrayList",
    "java.util.LinkedHashSet",
    "java.util.LinkedHashMap",
    "java.util.LinkedList",
    "java.util.HashMap",
    "com.google.common.collect.HashBiMap",
    "java.util.TreeMap",
];
const COLLECTIONS: [&str; 2] = ["java.util.Collection", "java.util.Map"];

fn under(context: &Context, kind: &Type, above: &[&str]) -> bool {
    let index = context.resolver.index;
    let name = match kind {
        Type::Class(..) => kind.erased().name(),
        _ => return false,
    };
    above.iter().any(|class| index.has(class) && index.is_subtype(&name, class))
}

/// Whether the expression is known to give an immutable collection, and whether a mutable one.
fn sides(context: &Context, expression: Node) -> (bool, bool) {
    let kind = context.resolver.type_of(expression);
    if matches!(kind, Some(Type::Null)) {
        return (false, false);
    }
    let factory = expression.kind() == "method_invocation"
        && expression.child_by_field_name("name").is_some_and(|name| FACTORIES.contains(&context.text(name)))
        && context.resolver.resolve_call(expression).is_some_and(|call| call.method.is_static && call.declaring == "java.util.Collections");
    let Some(kind) = kind else { return (factory, false) };
    (factory || under(context, &kind, &IMMUTABLE), under(context, &kind, &MUTABLE))
}

fn variable_sides(context: &Context, declarator: Node) -> (bool, bool) {
    let Some(value) = declarator.child_by_field_name("value") else { return (false, false) };
    let collection = context.resolver.type_of(value).is_some_and(|kind| under(context, &kind, &COLLECTIONS));
    if collection { sides(context, value) } else { (false, false) }
}

fn returns<'t>(node: Node<'t>, found: &mut Vec<Node<'t>>) {
    for part in children(node) {
        match part.kind() {
            "lambda_expression" | "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => {}
            "return_statement" => {
                found.push(part);
                returns(part, found);
            }
            _ => returns(part, found),
        }
    }
}

pub fn mixed_mutability_return_type(context: &Context, node: Node) {
    if node.kind() != "method_declaration" {
        return;
    }
    let (Some(body), Some(written)) = (node.child_by_field_name("body"), node.child_by_field_name("type")) else { return };
    let dimensions = node.child_by_field_name("dimensions").is_some();
    if dimensions || !context.resolver.type_node(written).is_some_and(|kind| under(context, &kind, &COLLECTIONS)) {
        return;
    }
    let mut found = Vec::new();
    returns(body, &mut found);
    let (mut immutable, mut mutable) = (Vec::new(), Vec::new());
    for statement in found {
        let Some(value) = named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")) else { continue };
        if value.kind() == "identifier" {
            if let Some(Named::Variable(declarator)) = named(context, value) {
                let (fixed, open) = variable_sides(context, declarator);
                if open || fixed {
                    if open { mutable.push(value) } else { immutable.push(value) }
                    continue;
                }
            }
        }
        let (fixed, open) = sides(context, value);
        if fixed {
            immutable.push(value);
        }
        if open {
            mutable.push(value);
        }
    }
    if !immutable.is_empty() && !mutable.is_empty() {
        let at = node.child_by_field_name("name").map_or(node.start_byte(), |name| name.start_byte());
        mutable.extend(immutable);
        context.report_fixed(NAME, node, at, SUMMARY, &mutability_fix::fixes(context, node, &mutable));
    }
}
