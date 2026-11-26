//! IsInstanceIncompatibleType, Incomparable and IterablePathParameter: checks on the types around a call or a parameter.
use super::Context;
use super::compat::castable;
use super::fixes::Fix;
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use crate::engine::source::{children, named_children};
use crate::java::types::model::Type;
use tree_sitter::Node;

/// `Signatures.prettyType` of an erased type: simple names.
fn pretty(kind: &Type) -> String {
    match kind {
        Type::Class(name, _) => name.rsplit('.').next().unwrap_or(name).to_string(),
        Type::Array(element) => format!("{}[]", pretty(element)),
        Type::Wildcard => "?".to_string(),
        other => other.name(),
    }
}

fn class_argument(kind: Option<Type>) -> Option<Type> {
    match kind? {
        Type::Class(name, given) if name == "java.lang.Class" && given.len() == 1 => given.into_iter().next(),
        _ => None,
    }
}

fn report_instance(context: &Context, node: Node, offset: usize, argument: &Type, receiver: &Type) {
    if castable(context, argument, receiver) {
        return;
    }
    let message = format!("This expression will always evaluate to false because {} cannot be cast to {}", pretty(&argument.erased()), pretty(&receiver.erased()));
    context.report_fixed("IsInstanceIncompatibleType", node, offset, &message, &[]);
}

pub fn is_instance_incompatible_type(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => {
            if node.child_by_field_name("name").is_none_or(|name| context.text(name) != "isInstance") {
                return;
            }
            let list = arguments(node);
            let Some(object) = node.child_by_field_name("object").filter(|_| list.len() == 1) else { return };
            if receiver_class(context, node).as_deref() != Some("java.lang.Class") {
                return;
            }
            let Some(receiver) = class_argument(context.resolver.type_of(object)) else { return };
            let Some(argument) = context.resolver.type_of(list[0]) else { return };
            report_instance(context, node, preferred(context, node), &argument, &receiver);
        }
        "method_reference" => {
            let parts = children(node);
            if parts.last().is_none_or(|name| context.text(*name) != "isInstance") {
                return;
            }
            let Some(qualifier) = parts.first().copied().filter(|first| first.is_named()) else { return };
            let Some(receiver) = class_argument(context.resolver.type_of(qualifier)) else { return };
            if context.resolver.type_of(qualifier).is_none_or(|kind| kind.erased().name() != "java.lang.Class") {
                return;
            }
            let Some(target) = context.resolver.expected(node) else { return };
            let Some((formals, _)) = context.resolver.function_type(&target) else { return };
            let Some(argument) = formals.into_iter().next() else { return };
            report_instance(context, node, node.start_byte(), &argument, &receiver);
        }
        _ => {}
    }
}

const SORTED: [&str; 4] = ["java.util.TreeMap", "java.util.TreeSet", "java.util.concurrent.ConcurrentSkipListMap", "java.util.concurrent.ConcurrentSkipListSet"];

fn sorted_constructor(context: &Context, creation: Node) -> bool {
    if creation.child_by_field_name("object").is_some() || named_children(creation).iter().any(|part| part.kind() == "class_body") {
        return false;
    }
    let Some(resolved) = context.resolver.resolve_constructor(creation) else { return false };
    let owner = resolved.receiver.erased().name();
    if !SORTED.contains(&owner.as_str()) {
        return false;
    }
    let parameters: Vec<String> = resolved.method.parameters.iter().map(Type::name).collect();
    let map = owner.ends_with("Map");
    match parameters.as_slice() {
        [] => true,
        [only] => (map && only == "java.util.Map") || (!map && only == "java.util.Set"),
        _ => false,
    }
}

pub fn incomparable(context: &Context, creation: Node) {
    if creation.kind() != "object_creation_expression" || !creation.child_by_field_name("type").is_some_and(|written| context.text(written).contains("Tree") || context.text(written).contains("SkipList")) {
        return;
    }
    if !sorted_constructor(context, creation) {
        return;
    }
    let written = creation.child_by_field_name("type").and_then(|written| context.resolver.type_node(written));
    let kind = context.resolver.expected(creation).filter(|kind| matches!(kind, Type::Class(..))).or(written);
    let Some(Type::Class(_, given)) = kind else { return };
    let Some(key) = given.first() else { return };
    let comparable = Type::class("java.lang.Comparable");
    if matches!(key, Type::Variable(_) | Type::Wildcard | Type::Null) || castable(context, key, &comparable) {
        return;
    }
    let message = format!("{} does not implement Comparable", super::futures::printed(key));
    context.report_fixed("Incomparable", creation, preferred(context, creation), &message, &[]);
}

fn iterable_of_path(context: &Context, kind: &Type) -> bool {
    let shaped = match kind {
        Type::Class(name, given) if name == "java.lang.Iterable" => given.len() == 1 && given[0].name() == "java.nio.file.Path" && matches!(given[0], Type::Class(..)),
        _ => false,
    };
    shaped && context.resolver.index.has("java.nio.file.Path")
}

fn path_message() -> &'static str {
    "Path implements Iterable<Path>; prefer Collection<Path> for clarity"
}

/// The first of the nodes that names a parameter, without a fix when the type is not written out.
fn report_parameter(context: &Context, node: Node, name: Node, fix: Option<Fix>) {
    let fixes: Vec<Fix> = fix.into_iter().collect();
    context.report_fixed("IterablePathParameter", node, name.start_byte(), path_message(), &fixes);
}

pub fn iterable_path_parameter(context: &Context, node: Node) {
    match node.kind() {
        "formal_parameter" => {
            let Some(name) = node.child_by_field_name("name") else { return };
            let Some(kind) = context.resolver.declared_type(node, None) else { return };
            if !iterable_of_path(context, &kind) || node.child_by_field_name("dimensions").is_some() {
                return;
            }
            let written = node.child_by_field_name("type").filter(|written| written.kind() == "generic_type");
            let fix = written.and_then(|written| written.named_child(0)).map(|base| {
                Fix::replace(base.start_byte(), base.end_byte(), "Collection").with_imports()
            });
            report_parameter(context, node, name, fix);
        }
        "lambda_expression" => {
            let Some(list) = node.child_by_field_name("parameters") else { return };
            let implicit: Vec<Node> = match list.kind() {
                "identifier" => vec![list],
                "inferred_parameters" => named_children(list).into_iter().filter(|part| part.kind() == "identifier").collect(),
                _ => return,
            };
            let Some(target) = context.resolver.lambda_target(node) else { return };
            let Some((formals, _)) = context.resolver.function_type(&target) else { return };
            for (name, kind) in implicit.into_iter().zip(formals) {
                if iterable_of_path(context, &kind) {
                    report_parameter(context, name, name, None);
                }
            }
        }
        _ => {}
    }
}
