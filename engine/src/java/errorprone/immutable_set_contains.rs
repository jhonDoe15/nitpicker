//! ImmutableSetForContains: a private static `ImmutableList` that is only asked `contains`, `containsAll` or `isEmpty`.
use super::Context;
use super::call_match::{instance_on_exact_class, static_on_class};
use super::fixes::Fix;
use super::guice::annotations;
use super::keep::{VARIABLES, should_keep};
use super::nodes::{is_variable_use, name_position};
use super::positions::arguments;
use crate::engine::source::{children, named_children};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::expr::{Binding, Receiver};
use crate::java::types::model::Type;
use tree_sitter::Node;

const LIST: &str = "com.google.common.collect.ImmutableList";
const BUILDER: &str = "com.google.common.collect.ImmutableList.Builder";
const MESSAGE: &str = "This private static ImmutableList is only used for contains, containsAll or isEmpty checks; prefer ImmutableSet.";

#[derive(Clone, Copy, PartialEq)]
enum Usage {
    Never,
    Allowed,
    Disallowed,
}

struct Candidate<'t> {
    declarator: Node<'t>,
    declaration: Node<'t>,
    key: (String, String),
    usage: Usage,
}

fn members<'t>(body: Node<'t>) -> Vec<Node<'t>> {
    children(body).into_iter().flat_map(|part| if part.kind() == "enum_body_declarations" { children(part) } else { vec![part] }).collect()
}

fn reference_key(context: &Context, node: Node) -> Option<(String, String)> {
    match node.kind() {
        "identifier" => {
            let name = context.text(node);
            match context.resolver.binding(node, name)? {
                Binding::Field(_, info, field) => Some((info.name.clone(), field.name.clone())),
                Binding::Local(_) => None,
            }
        }
        "field_access" => {
            let object = node.child_by_field_name("object")?;
            let name = context.text(node.child_by_field_name("field")?);
            let owner = match context.resolver.receiver(object)? {
                Receiver::Static(owner) | Receiver::Value(Type::Class(owner, _)) => owner,
                _ => return None,
            };
            let (info, field) = context.resolver.index.field(&owner, name)?;
            Some((info.name.clone(), field.name.clone()))
        }
        _ => None,
    }
}

fn mark(candidates: &mut [Candidate], key: &Option<(String, String)>, usage: Usage) {
    let Some(key) = key else { return };
    if let Some(found) = candidates.iter_mut().find(|candidate| candidate.key == *key) {
        if found.usage != Usage::Disallowed {
            found.usage = usage;
        }
    }
}

fn allowed_call(context: &Context, call: Node) -> bool {
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    instance_on_exact_class(context, call, LIST, &["contains", "containsAll", "isEmpty"]) && matches!(name, "contains" | "containsAll" | "isEmpty")
}

fn scan(context: &Context, node: Node, candidates: &mut Vec<Candidate>) {
    match node.kind() {
        "method_invocation" => {
            for part in named_children(node) {
                if part.kind() == "argument_list" || part.kind() == "type_arguments" {
                    scan(context, part, candidates);
                }
            }
            if let Some(object) = node.child_by_field_name("object") {
                let key = reference_key(context, object);
                let is_candidate = key.as_ref().is_some_and(|key| candidates.iter().any(|candidate| candidate.key == *key));
                if is_candidate && allowed_call(context, node) {
                    mark(candidates, &key, Usage::Allowed);
                } else {
                    scan(context, object, candidates);
                }
            }
            return;
        }
        "field_access" => {
            mark(candidates, &reference_key(context, node), Usage::Disallowed);
            if let Some(object) = node.child_by_field_name("object") {
                scan(context, object, candidates);
            }
            return;
        }
        "identifier" if is_variable_use(node) => mark(candidates, &reference_key(context, node), Usage::Disallowed),
        _ => {}
    }
    for child in children(node) {
        if child.is_named() {
            scan(context, child, candidates);
        }
    }
}

fn type_name_node<'t>(kind: Node<'t>) -> Option<Node<'t>> {
    if kind.kind() == "generic_type" { named_children(kind).into_iter().find(|part| !part.kind().ends_with("comment")) } else { Some(kind) }
}

fn conversion(context: &Context, declaration: Node, declarator: Node) -> Option<Fix> {
    let mut fix = Fix::new().with_imports();
    let written = type_name_node(declaration.child_by_field_name("type")?)?;
    fix = fix.and(written.start_byte(), written.end_byte(), "ImmutableSet");
    let value = declarator.child_by_field_name("value")?;
    if static_on_class(context, value, LIST, &["of", "copyOf"]) {
        let receiver = value.child_by_field_name("object")?;
        return Some(fix.and(receiver.start_byte(), receiver.end_byte(), "ImmutableSet"));
    }
    if instance_on_exact_class(context, value, "java.util.stream.Stream", &["collect"]) {
        let [only] = arguments(value)[..] else { return None };
        return Some(fix.and(only.start_byte(), only.end_byte(), "toImmutableSet()"));
    }
    if instance_on_exact_class(context, value, BUILDER, &["build"]) {
        let mut current = value.child_by_field_name("object");
        while let Some(receiver) = current {
            let builder_method = receiver.kind() == "method_invocation" && instance_on_exact_class(context, receiver, BUILDER, &["add", "addAll"]);
            if !builder_method {
                break;
            }
            current = receiver.child_by_field_name("object");
        }
        match current {
            Some(root) if root.kind() == "method_invocation" => {
                let receiver = root.child_by_field_name("object")?;
                return Some(fix.and(receiver.start_byte(), receiver.end_byte(), "ImmutableSet"));
            }
            Some(root) if root.kind() == "object_creation_expression" => {
                let created = type_name_node(root.child_by_field_name("type")?)?;
                return Some(fix.and(created.start_byte(), created.end_byte(), "ImmutableSet.Builder"));
            }
            Some(_) => return Some(fix),
            None => {}
        }
    }
    Some(fix.and(value.start_byte(), value.end_byte(), format!("ImmutableSet.copyOf({})", context.text(value))))
}

pub fn immutable_set_for_contains(context: &Context, node: Node) {
    if !matches!(node.kind(), "class_declaration" | "enum_declaration" | "record_declaration") {
        return;
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    let Some(owner) = context.resolver.scope.names.get(&node.id()).cloned() else { return };
    let mut candidates: Vec<Candidate> = Vec::new();
    for member in members(body).into_iter().filter(|member| member.kind() == "field_declaration") {
        let listed = has_modifier(member, "static") && has_modifier(member, "private") && has_modifier(member, "final");
        let typed = member.child_by_field_name("type").is_some_and(|kind| matches!(context.resolver.type_node(kind), Some(Type::Class(name, _)) if name == LIST));
        let excluded = annotations(context, member).iter().any(|(_, name)| matches!(name.rsplit('.').next(), Some("Bind" | "Inject")))
            || super::hierarchy::has_annotation(context, member, "Bind")
            || super::hierarchy::has_annotation(context, member, "Inject");
        if !listed || !typed || excluded || should_keep(context, member, VARIABLES) {
            continue;
        }
        for declarator in declarators(member) {
            let Some(name) = declarator.child_by_field_name("name") else { continue };
            candidates.push(Candidate { declarator, declaration: member, key: (owner.clone(), context.text(name).to_string()), usage: Usage::Never });
        }
    }
    if candidates.is_empty() {
        return;
    }
    scan(context, context.file.tree.root_node(), &mut candidates);
    let mut fix = Fix::new();
    let mut first: Option<Node> = None;
    for candidate in &candidates {
        if candidate.usage != Usage::Allowed || context.suppressed("ImmutableSetForContains", candidate.declarator) {
            continue;
        }
        first = Some(candidate.declarator);
        if let Some(found) = conversion(context, candidate.declaration, candidate.declarator) {
            fix = fix.merged(found);
        }
    }
    if let Some(variable) = first {
        context.report_fixed("ImmutableSetForContains", variable, name_position(variable), MESSAGE, &[fix]);
    }
}
