//! NM_METHOD_NAMING_CONVENTION and NM_FIELD_NAMING_CONVENTION on the members of one class.
use super::super::{Context, names, place};
use super::super::classes::lines;
use super::badly_named;
use crate::engine::source::{children, named_children};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::Type;
use crate::java::types::scope::TYPE_DECLARATIONS;
use super::super::attributes::compiled_public;
use tree_sitter::Node;

pub const METHOD: &str = "NM_METHOD_NAMING_CONVENTION";
pub const FIELD: &str = "NM_FIELD_NAMING_CONVENTION";

fn open(member: Node) -> bool {
    has_modifier(member, "public") || has_modifier(member, "protected")
}

/// Whether a superclass declares a concrete instance method with the same name and erased parameters.
fn overrides_concrete(context: &Context, own: &str, name: &str, parameters: &[Type]) -> bool {
    let index = context.resolver.index;
    index.superclasses(own).iter().skip(1).filter_map(|above| index.get(above)).any(|info| {
        info.methods.iter().any(|method| method.name == name && !method.is_abstract && !method.is_static && !method.is_private && method.parameters == parameters)
    })
}

fn simple_name(context: &Context, class: Node) -> Option<String> {
    class.child_by_field_name("name").map(|name| context.text(name).to_string())
}

fn report_method(context: &Context, at: Node, line: usize, label: String) {
    let message = format!("The method name {label} doesn't start with a lower case letter");
    context.report_listed(METHOD, at, line, message, place::function(&label), 2, vec![label]);
}

fn methods(context: &Context, own: &str, class: Node, members: &[Node], enum_like: bool) {
    let own_name = simple_name(context, class);
    for member in members.iter().copied().filter(|member| member.kind() == "method_declaration") {
        let Some(name) = member.child_by_field_name("name").map(|name| context.text(name)) else { continue };
        if !badly_named(name) || own_name.as_deref() == Some(name) || !open(member) || enum_like {
            continue;
        }
        let parameters = context.resolver.parameters(member.child_by_field_name("parameters")).0;
        if overrides_concrete(context, own, name, &parameters) {
            continue;
        }
        let Some(label) = super::super::statements::member_label(context, own, class, member) else { continue };
        let line = if member.child_by_field_name("body").is_some() { lines::method_start(context, member).unwrap_or(0) } else { 0 };
        report_method(context, member, line, label);
    }
    if class.kind() == "record_declaration" {
        accessors(context, own, class, members, own_name.as_deref());
    }
}

/// The accessors javac writes for the components of a record that does not declare them.
fn accessors(context: &Context, own: &str, class: Node, members: &[Node], own_name: Option<&str>) {
    let Some(components) = class.child_by_field_name("parameters") else { return };
    let declared = |name: &str| {
        members.iter().any(|member| {
            let named = member.child_by_field_name("name").is_some_and(|written| context.text(written) == name);
            let empty = member.child_by_field_name("parameters").is_some_and(|list| named_children(list).iter().all(|part| part.kind().ends_with("comment")));
            member.kind() == "method_declaration" && named && empty
        })
    };
    let keyword = children(class).into_iter().find(|part| part.kind() == "record").or_else(|| class.child_by_field_name("name"));
    let line = keyword.map_or(0, |keyword| context.line(keyword));
    for component in named_children(components).into_iter().filter(|part| part.kind() == "formal_parameter") {
        let Some(name) = component.child_by_field_name("name").map(|name| context.text(name)) else { continue };
        if badly_named(name) && Some(name) != own_name && !declared(name) && !overrides_concrete(context, own, name, &[]) {
            report_method(context, component, line, format!("{}.{name}()", names::binary(context, own)));
        }
    }
}

fn fields(context: &Context, own: &str, members: &[Node], enum_like: bool) {
    let binary = names::binary(context, own);
    for member in members.iter().copied().filter(|member| member.kind() == "field_declaration") {
        if has_modifier(member, "final") || !open(member) || enum_like {
            continue;
        }
        for name in declarators(member).into_iter().filter_map(|declarator| declarator.child_by_field_name("name")) {
            let name = context.text(name);
            if !badly_named(name) {
                continue;
            }
            let qualified = format!("{binary}.{name}");
            let message = format!("The field name {qualified} is not conform to the naming convention. If final, it should be ALL_CAPS, otherwise lowerCamelCase.");
            context.report_listed(FIELD, member, 0, message, format!("member:{qualified}"), 2, vec![qualified.clone()]);
        }
    }
}

pub fn check(context: &Context, own: &str, class: Node, members: &[Node], binary: &str) {
    if matches!(class.kind(), "interface_declaration" | "annotation_type_declaration") {
        return;
    }
    let index = context.resolver.index;
    let public = super::short_package(binary) || (TYPE_DECLARATIONS.contains(&class.kind()) && index.get(own).is_some_and(|info| compiled_public(index, info)));
    let enum_like = matches!(class.kind(), "enum_declaration" | "enum_constant") || !public;
    if context.wants(&[METHOD]) {
        methods(context, own, class, members, enum_like);
    }
    if context.wants(&[FIELD]) {
        fields(context, own, members, enum_like);
    }
}
