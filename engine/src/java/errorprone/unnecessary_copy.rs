//! UnnecessaryCopy: `ImmutableList.copyOf` or `ImmutableMap.copyOf` of a protocol buffer getter, which already is immutable.
use super::Context;
use super::array_calls::variable_bound;
use super::call_match::static_on_class;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::hierarchy::super_methods;
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use super::symbol_key::{SymbolKey, declared_key, reference_key};
use super::target::target_type;
use crate::engine::source::{children, parent, walk};
use crate::java::helpers::declarators;
use crate::java::types::model::{OBJECT, Type};
use tree_sitter::Node;

const MESSAGE: &str = "This collection is already immutable (just not ImmutableList/ImmutableMap); copying it is unnecessary.";

/// The class `Types.erasure` leaves of a type, `None` for the types that have none.
fn erased_class(context: &Context, usage: Node, kind: &Type, depth: usize) -> Option<String> {
    match kind {
        Type::Class(name, _) => Some(name.clone()),
        Type::Variable(name) if depth < 4 => match variable_bound(context, usage, name) {
            Some(bound) => erased_class(context, usage, &bound, depth + 1),
            None => Some(OBJECT.to_string()),
        },
        Type::Bounded(_, bound) => erased_class(context, usage, bound, depth + 1),
        Type::Wildcard => Some(OBJECT.to_string()),
        _ => None,
    }
}

/// `isSuperType(erasure(type), List)` or the same for `Map`: the type can hold a `List` or a `Map`.
fn is_super_type(context: &Context, usage: Node, kind: &Type) -> bool {
    let Some(name) = erased_class(context, usage, kind, 0) else { return false };
    let index = context.resolver.index;
    index.is_subtype("java.util.List", &name) || index.is_subtype("java.util.Map", &name)
}

fn is_proto_getter(context: &Context, argument: Node) -> bool {
    if argument.kind() != "method_invocation" || !context.resolver.resolve_call(argument).is_some_and(|resolved| !resolved.method.is_static) {
        return false;
    }
    receiver_class(context, argument).is_some_and(|class| context.resolver.index.is_subtype(&class, "com.google.protobuf.MessageLite"))
}

/// `TargetType` of an expression that is the receiver of a call or field access: the type that declares what is selected.
fn receiver_target(context: &Context, identifier: Node) -> Option<Type> {
    let mut current = identifier;
    let mut up = parent(identifier)?;
    while up.kind() == "parenthesized_expression" {
        current = up;
        up = parent(up)?;
    }
    match up.kind() {
        "field_access" if up.child_by_field_name("object") == Some(current) => context.resolver.type_of(current),
        "method_invocation" if up.child_by_field_name("object") == Some(current) => {
            let resolved = context.resolver.resolve_call(up)?;
            let index = context.resolver.index;
            let origin = index.get(&resolved.declaring)?;
            let mut methods = vec![(origin, &resolved.method)];
            methods.extend(super_methods(index, origin, &resolved.method));
            let mut returned: Vec<Type> = methods.iter().map(|(_, method)| method.returns.erased()).collect();
            returned.dedup();
            let distinct = returned.iter().enumerate().all(|(at, kind)| !returned[..at].contains(kind));
            if distinct && returned.len() == 1 {
                return Some(Type::class(&methods.last()?.0.name));
            }
            let target = target_type(context, up);
            let chosen = methods.iter().rev().find(|(_, method)| match &target {
                None => true,
                Some(wanted) => match (method.returns.erased(), erased_class(context, up, wanted, 0)) {
                    (Type::Class(own, _), Some(wanted)) => index.is_subtype(&own, &wanted),
                    _ => false,
                },
            });
            Some(chosen.map_or_else(|| context.resolver.type_of(current), |(owner, _)| Some(Type::class(&owner.name)))?)
        }
        _ => target_type(context, identifier),
    }
}

fn describe(context: &Context, call: Node, argument: Node, variable: Option<Node>) {
    let mut fix = Fix::replace(call.start_byte(), call.end_byte(), context.text(argument));
    if let Some(declaration) = variable {
        let written = declaration.child_by_field_name("type").filter(|written| context.text(*written) != "var");
        if let Some(written) = written {
            let kind = context.resolver.declared_type(declaration, None);
            let replacement = match kind.as_ref().map(|kind| erased_class(context, declaration, kind, 0)) {
                Some(Some(name)) if context.resolver.index.is_subtype(&name, "java.util.List") => "java.util.List",
                Some(Some(name)) if context.resolver.index.is_subtype(&name, "java.util.Map") => "java.util.Map",
                _ => return,
            };
            let simple = qualify_type(context, declaration, replacement, &mut fix);
            let target = if written.kind() == "generic_type" { children(written).into_iter().next().unwrap_or(written) } else { written };
            fix = fix.and(target.start_byte(), target.end_byte(), simple);
        }
    }
    context.report_fixed("UnnecessaryCopy", call, preferred(context, call), MESSAGE, &[fix]);
}

pub fn unnecessary_copy(context: &Context, root: Node) {
    let mut suspicious: Vec<(Node, Node, SymbolKey, String)> = Vec::new();
    walk(root, |call| {
        if !static_on_class(context, call, "com.google.common.collect.ImmutableList", &["copyOf"]) && !static_on_class(context, call, "com.google.common.collect.ImmutableMap", &["copyOf"]) {
            return;
        }
        let list = arguments(call);
        let [argument] = list.as_slice() else { return };
        if !is_proto_getter(context, *argument) || context.suppressed("UnnecessaryCopy", call) {
            return;
        }
        if target_type(context, call).is_some_and(|target| is_super_type(context, call, &target)) {
            return describe(context, call, *argument, None);
        }
        let Some(declarator) = parent(call).filter(|up| up.kind() == "variable_declarator" && up.child_by_field_name("value") == Some(call)) else { return };
        let Some(declaration) = parent(declarator).filter(|up| up.kind() == "local_variable_declaration") else { return };
        let (Some(key), Some(name)) = (declared_key(context, declarator), declarator.child_by_field_name("name")) else { return };
        if declarators(declaration).len() == 1 {
            suspicious.push((call, declaration, key, context.text(name).to_string()));
        }
    });
    if suspicious.is_empty() {
        return;
    }
    let mut removed = vec![false; suspicious.len()];
    walk(root, |node| {
        if node.kind() != "identifier" || !suspicious.iter().any(|(_, _, _, name)| name == context.text(node)) {
            return;
        }
        let Some(found) = reference_key(context, node) else { return };
        for (at, (_, _, key, _)) in suspicious.iter().enumerate() {
            if *key == found && !removed[at] && receiver_target(context, node).is_some_and(|target| !is_super_type(context, node, &target)) {
                removed[at] = true;
            }
        }
    });
    for ((call, declaration, _, _), gone) in suspicious.iter().zip(removed) {
        if !gone {
            describe(context, *call, arguments(*call)[0], Some(*declaration));
        }
    }
}
