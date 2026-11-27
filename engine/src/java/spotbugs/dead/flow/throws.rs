//! The exception edges SpotBugs gives an instruction: from a call to the handlers of unchecked exceptions and of
//! what it declares, from an instruction that throws on its own to the handlers of runtime exceptions.
use super::super::super::Context;
use super::super::value::boxes;
use crate::engine::source::{named_children, parent};
use crate::java::flow::cfg::{Block, unwrap};
use crate::java::types::model::Type;
use tree_sitter::Node;

pub enum Thrown {
    /// What an instruction throws on its own: runtime exceptions.
    Implicit,
    /// A call: unchecked exceptions and what it declares.
    Call(Vec<Type>),
    Throw(Option<Type>),
}

/// What a step can throw.
pub fn throws(context: &Context, step: Node) -> Option<Thrown> {
    let resolver = context.resolver;
    let typed_as = |node: Option<Node>| node.and_then(|node| resolver.type_of(node));
    let receiver = |field: &str| step.child_by_field_name(field).map(unwrap).is_some_and(|object| object.kind() != "this");
    match step.kind() {
        "method_invocation" | "explicit_constructor_invocation" => Some(Thrown::Call(resolver.call_throws(step).unwrap_or_default())),
        "object_creation_expression" => {
            let declared = resolver.resolve_constructor(step).map(|call| call.method.throws.iter().map(Type::erased).collect());
            Some(Thrown::Call(declared.unwrap_or_default()))
        }
        "lambda_expression" | "method_reference" | "enhanced_for_statement" => Some(Thrown::Call(Vec::new())),
        "array_creation_expression" | "array_access" | "cast_expression" => {
            let primitive = step.kind() == "cast_expression" && step.child_by_field_name("type").is_some_and(|written| matches!(written.kind(), "integral_type" | "floating_point_type" | "boolean_type"));
            (!primitive).then_some(Thrown::Implicit)
        }
        "field_access" if receiver("object") => Some(Thrown::Implicit),
        "parenthesized_expression" if parent(step).is_some_and(|holder| holder.kind() == "synchronized_statement") => Some(Thrown::Implicit),
        "variable_declarator" => {
            let declared = parent(step).and_then(|statement| resolver.declared_type(statement, Some(step)));
            boxes(&declared, &typed_as(step.child_by_field_name("value"))).then(|| Thrown::Call(Vec::new()))
        }
        "assignment_expression" if boxes(&typed_as(step.child_by_field_name("left")), &typed_as(step.child_by_field_name("right"))) => {
            Some(Thrown::Call(Vec::new()))
        }
        "assignment_expression" => {
            let left = step.child_by_field_name("left").map(unwrap);
            let other = left.is_some_and(|left| left.kind() == "array_access" || left.kind() == "field_access" && left.child_by_field_name("object").map(unwrap).is_some_and(|object| object.kind() != "this"));
            other.then_some(Thrown::Implicit)
        }
        "binary_expression" => {
            let operator = step.child_by_field_name("operator").map(|operator| context.text(operator));
            let kind = resolver.type_of(step);
            match operator {
                Some("/" | "%") if matches!(kind, Some(Type::Primitive("int" | "long" | "short" | "char" | "byte"))) => Some(Thrown::Implicit),
                Some("+") if matches!(&kind, Some(Type::Class(name, _)) if name == "java.lang.String") => Some(Thrown::Call(Vec::new())),
                _ => None,
            }
        }
        "throw_statement" => Some(Thrown::Throw(named_children(step).into_iter().next().and_then(|value| resolver.type_of(value)))),
        _ => None,
    }
}

const RUNTIME: &str = "java.lang.RuntimeException";
const BROAD: &[&str] = &["java.lang.Throwable", "java.lang.Exception", RUNTIME];

pub fn handlers(context: &Context, block: &Block, thrown: &Thrown) -> Vec<usize> {
    handled(context, block, thrown).0
}

/// The handlers an exception can reach, and whether one of them surely takes it, so that it cannot leave the method.
pub fn handled(context: &Context, block: &Block, thrown: &Thrown) -> (Vec<usize>, bool) {
    let index = &context.resolver.index;
    let under = |name: &str, of: &str| name == of || index.is_subtype(name, of);
    let mut found = Vec::new();
    for frame in &block.catches {
        for catch in frame {
            if catch.types.is_empty() {
                found.push(catch.block);
                return (found, true);
            }
            for written in &catch.types {
                let Some(name) = context.resolver.type_node(*written).map(|kind| kind.erased().name()) else {
                    found.push(catch.block);
                    continue;
                };
                let runtime = BROAD.contains(&name.as_str()) || under(&name, RUNTIME);
                let (reaches, certain) = match thrown {
                    Thrown::Implicit => (runtime, BROAD.contains(&name.as_str())),
                    Thrown::Call(declared) => {
                        let listed = declared.iter().any(|kind| under(&kind.name(), &name) || under(&name, &kind.name()));
                        (runtime || under(&name, "java.lang.Error") || listed || !index.has(&name), name == "java.lang.Throwable")
                    }
                    Thrown::Throw(Some(kind)) => {
                        let kind = kind.erased().name();
                        (runtime || under(&kind, &name) || under(&name, &kind) || !index.has(&name), under(&kind, &name))
                    }
                    Thrown::Throw(None) => (true, false),
                };
                if reaches {
                    found.push(catch.block);
                }
                if certain {
                    return (found, true);
                }
            }
        }
    }
    (found, false)
}
