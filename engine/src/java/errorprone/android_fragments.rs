//! FragmentNotInstantiable and FragmentInjection: Android fragment classes that cannot be created or that accept any fragment.
use super::Context;
use super::consts::{Const, constant};
use super::hierarchy::formals;
use super::junit_init::members;
use super::nodes::{class_position, name_position};
use crate::engine::source::{children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

const FRAGMENTS: [&str; 2] = ["android.app.Fragment", "android.support.v4.app.Fragment"];

fn anonymous(node: Node) -> bool {
    node.kind() == "object_creation_expression" && children(node).iter().any(|part| part.kind() == "class_body")
}

fn class_members<'t>(class: Node<'t>) -> Vec<Node<'t>> {
    match children(class).into_iter().find(|part| part.kind() == "class_body").filter(|_| anonymous(class)) {
        Some(body) => crate::engine::source::named_children(body),
        None => members(class),
    }
}

fn class_name(context: &Context, class: Node) -> Option<String> {
    context.resolver.scope.names.get(&class.id()).cloned()
}

fn position(class: Node) -> usize {
    if anonymous(class) {
        children(class).into_iter().find(|part| part.kind() == "class_body").map_or(class.start_byte(), |body| body.start_byte())
    } else {
        class_position(class)
    }
}

fn not_instantiable(context: &Context, tree: Node, position: usize, explanation: &str) {
    context.report_fixed("FragmentNotInstantiable", tree, position, &format!("Fragment is not instantiable: {explanation}."), &[]);
}

fn member_class_is_static(class: Node) -> Option<bool> {
    let owner = parent(class).and_then(parent)?;
    if !matches!(owner.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration") {
        return None;
    }
    Some(has_modifier(class, "static") || matches!(owner.kind(), "interface_declaration" | "annotation_type_declaration"))
}

pub fn fragment_not_instantiable(context: &Context, class: Node) {
    if (class.kind() != "class_declaration" && !anonymous(class)) || !context.resolver.index.android_compatible {
        return;
    }
    let Some(name) = class_name(context, class) else { return };
    let index = context.resolver.index;
    if !FRAGMENTS.iter().any(|fragment| index.is_subtype(&name, fragment)) || FRAGMENTS.contains(&name.as_str()) {
        return;
    }
    if has_modifier(class, "abstract") {
        return;
    }
    let at = position(class);
    let in_interface = parent(class).and_then(parent).is_some_and(|owner| matches!(owner.kind(), "interface_declaration" | "annotation_type_declaration"));
    if !has_modifier(class, "public") && !in_interface {
        return not_instantiable(context, class, at, "a fragment must be public");
    }
    if member_class_is_static(class) == Some(false) {
        return not_instantiable(context, class, at, "a fragment inner class must be static");
    }
    let constructors: Vec<Node> = members(class).into_iter().filter(|member| member.kind() == "constructor_declaration").collect();
    for constructor in &constructors {
        if formals(*constructor).is_empty() {
            if !has_modifier(*constructor, "public") {
                return not_instantiable(context, class, name_position(*constructor), "the nullary constructor must be public");
            }
            return;
        }
    }
    if !constructors.is_empty() {
        not_instantiable(context, class, at, "the nullary constructor is missing");
    }
}

const PREFERENCE_ACTIVITY: &str = "android.preference.PreferenceActivity";

fn string_parameter(context: &Context, method: Node) -> bool {
    let list = formals(method);
    let [only] = list.as_slice() else { return false };
    only.kind() == "formal_parameter" && context.resolver.declared_type(*only, None).is_some_and(|kind| kind.erased() == Type::class("java.lang.String"))
}

/// Whether every `return` inside the method returns a compile-time constant `true`: also when there is none.
fn always_returns_true(context: &Context, method: Node) -> bool {
    let mut all = true;
    walk(method, |part| {
        if part.kind() == "return_statement" {
            let value = part.named_child(0).filter(|value| !value.kind().ends_with("comment"));
            all &= value.is_some_and(|value| matches!(constant(context, value), Some(Const::Bool(true))));
        }
    });
    all
}

pub fn fragment_injection(context: &Context, class: Node) {
    let declaration = matches!(class.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration");
    if !(declaration || anonymous(class)) || !context.resolver.index.android_compatible {
        return;
    }
    let Some(name) = class_name(context, class) else { return };
    let index = context.resolver.index;
    if !index.is_subtype(&name, PREFERENCE_ACTIVITY) {
        return;
    }
    let owner = index.methods(&name, "isValidFragment").into_iter().find(|(_, method)| method.parameters == [Type::class("java.lang.String")]).map(|(info, _)| info.name.clone());
    let not_implemented = owner.is_none_or(|owner| owner == PREFERENCE_ACTIVITY);
    if not_implemented && !has_modifier(class, "abstract") {
        let message = "Class extending PreferenceActivity does not implement isValidFragment.";
        return context.report_fixed("FragmentInjection", class, position(class), message, &[]);
    }
    let valid = class_members(class).into_iter().find(|member| {
        member.kind() == "method_declaration" && member.child_by_field_name("name").is_some_and(|written| context.text(written) == "isValidFragment") && string_parameter(context, *member)
    });
    if let Some(method) = valid.filter(|method| always_returns_true(context, *method)) {
        context.report_fixed("FragmentInjection", method, name_position(method), "isValidFragment unconditionally returns true.", &[]);
    }
}
