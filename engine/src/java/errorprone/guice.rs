//! Guice and JSR 330 checks: GuiceAssistedInjectScoping, GuiceAssistedParameters, GuiceInjectOnFinalField,
//! InjectMoreThanOneScopeAnnotationOnClass, InjectOnMemberAndConstructor and IncompatibleModifiers.
use super::Context;
use super::fix_helpers::remove_modifiers;
use super::fixes::Fix;
use super::nodes::{class_position, name_position};
use super::shape::{is_class, suppressed_any};
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::{declarators, has_modifier, modifiers};
use crate::java::types::model::{Type, flag};
use tree_sitter::Node;

const INJECT: [&str; 3] = ["com.google.inject.Inject", "javax.inject.Inject", "jakarta.inject.Inject"];
const ASSISTED: &str = "com.google.inject.assistedinject.Assisted";
const ASSISTED_INJECT: &str = "com.google.inject.assistedinject.AssistedInject";
const DAGGER: [&str; 5] = ["dagger.Component", "dagger.Subcomponent", "dagger.producers.ProductionComponent", "dagger.producers.ProductionSubcomponent", "dagger.hilt.DefineComponent"];

/// The annotations written on a declaration with the full names they stand for.
pub fn annotations<'t>(context: &Context, declaration: Node<'t>) -> Vec<(Node<'t>, String)> {
    let Some(holder) = modifiers(declaration) else { return Vec::new() };
    children(holder)
        .into_iter()
        .filter(|part| matches!(part.kind(), "marker_annotation" | "annotation"))
        .map(|annotation| {
            let written = annotation.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
            (annotation, context.resolver.class_name(declaration, written).unwrap_or_else(|| written.to_string()))
        })
        .collect()
}

pub fn has_annotation(context: &Context, declaration: Node, wanted: &[&str]) -> bool {
    annotations(context, declaration).iter().any(|(_, name)| wanted.contains(&name.as_str()))
}

fn scope_annotations<'t>(context: &Context, class: Node<'t>) -> Vec<Node<'t>> {
    let index = context.resolver.index;
    annotations(context, class).into_iter().filter(|(_, name)| index.get(name).is_some_and(|info| info.flags & flag::SCOPE != 0)).map(|(annotation, _)| annotation).collect()
}

fn class_members<'t>(class: Node<'t>) -> Vec<Node<'t>> {
    let Some(body) = class.child_by_field_name("body") else { return Vec::new() };
    let mut members = Vec::new();
    for part in named_children(body) {
        if part.kind() == "enum_body_declarations" {
            members.extend(named_children(part));
        } else {
            members.push(part);
        }
    }
    members
}

fn constructors<'t>(class: Node<'t>) -> Vec<Node<'t>> {
    class_members(class).into_iter().filter(|member| member.kind() == "constructor_declaration").collect()
}

fn parameters<'t>(method: Node<'t>) -> Vec<Node<'t>> {
    super::hierarchy::formals(method)
}

pub fn assisted_inject_scoping(context: &Context, class: Node) {
    if !is_class(class) {
        return;
    }
    let scopes = scope_annotations(context, class);
    let Some(first) = scopes.first() else { return };
    let ctors = constructors(class);
    let injected = ctors.iter().find(|ctor| has_annotation(context, **ctor, &INJECT));
    let assisted = match injected {
        Some(ctor) => parameters(*ctor).into_iter().any(|parameter| has_annotation(context, parameter, &[ASSISTED])),
        None => ctors.iter().any(|ctor| has_annotation(context, *ctor, &[ASSISTED_INJECT])),
    };
    if assisted {
        let fix = Fix::replace(first.start_byte(), first.end_byte(), "");
        let message = "Scope annotation on implementation class of AssistedInject factory is not allowed";
        context.report_fixed("GuiceAssistedInjectScoping", *first, first.start_byte(), message, &[fix]);
    }
}

/// The value of the first `@Assisted` on a parameter: what its only element says, or nothing.
fn assisted_value(context: &Context, parameter: Node) -> String {
    let Some((annotation, _)) = annotations(context, parameter).into_iter().find(|(_, name)| name == ASSISTED) else { return String::new() };
    let Some(list) = annotation.child_by_field_name("arguments") else { return String::new() };
    let value = named_children(list).into_iter().find(|part| !part.kind().ends_with("comment")).map(|part| match part.kind() {
        "element_value_pair" => part.child_by_field_name("value").unwrap_or(part),
        _ => part,
    });
    value.and_then(|value| context.resolver.constant_string(value)).unwrap_or_default()
}

fn parameter_type(context: &Context, parameter: Node) -> Option<Type> {
    let written = parameter.child_by_field_name("type")?;
    let kind = context.resolver.written(written, true)?;
    let kind = if parameter.child_by_field_name("dimensions").is_some() { Type::Array(Box::new(kind)) } else { kind };
    Some(kind.unboxed_or_same())
}

pub fn assisted_parameters(context: &Context, constructor: Node) {
    if constructor.kind() != "constructor_declaration" || !has_annotation(context, constructor, &[INJECT[0], INJECT[1], INJECT[2], ASSISTED_INJECT]) {
        return;
    }
    let assisted: Vec<Node> = parameters(constructor).into_iter().filter(|parameter| has_annotation(context, *parameter, &[ASSISTED])).collect();
    let mut groups: Vec<(Type, Vec<Node>)> = Vec::new();
    for parameter in assisted {
        let Some(kind) = parameter_type(context, parameter) else { return };
        match groups.iter_mut().find(|(known, _)| *known == kind) {
            Some((_, members)) => members.push(parameter),
            None => groups.push((kind, vec![parameter])),
        }
    }
    let mut text = String::from(" Assisted parameters of the same type need to have distinct values for the @Assisted annotation. There are conflicts between the annotations on this constructor:");
    let mut conflicts = false;
    for (kind, members) in groups.iter().filter(|(_, members)| members.len() > 1) {
        let mut by_value: Vec<(String, Vec<Node>)> = Vec::new();
        for parameter in members {
            let value = assisted_value(context, *parameter);
            match by_value.iter_mut().find(|(known, _)| *known == value) {
                Some((_, list)) => list.push(*parameter),
                None => by_value.push((value, vec![*parameter])),
            }
        }
        for (value, list) in by_value.into_iter().filter(|(_, list)| list.len() > 1) {
            conflicts = true;
            text.push('\n');
            text.push_str(&super::futures::printed(kind));
            if !value.is_empty() {
                text.push_str(&format!(", @Assisted(\"{value}\")"));
            }
            let names: Vec<&str> = list.iter().filter_map(|parameter| parameter.child_by_field_name("name")).map(|name| context.text(name)).collect();
            text.push_str(": ");
            text.push_str(&names.join(", "));
        }
    }
    if conflicts {
        context.report_fixed("GuiceAssistedParameters", constructor, name_position(constructor), &text, &[]);
    }
}

pub fn inject_on_final_field(context: &Context, field: Node) {
    if field.kind() != "field_declaration" || !has_modifier(field, "final") || !has_annotation(context, field, &[INJECT[0]]) {
        return;
    }
    let message = "Although Guice allows injecting final fields, doing so is disallowed because the injected value may not be visible to other threads.";
    for declarator in declarators(field) {
        let Some(name) = declarator.child_by_field_name("name") else { continue };
        let fix = remove_modifiers(Fix::new(), field, &["final"]);
        context.report_fixed("GuiceInjectOnFinalField", declarator, name.start_byte(), message, &[fix]);
    }
}

pub fn more_than_one_scope_annotation(context: &Context, class: Node) {
    if !is_class(class) {
        return;
    }
    let scopes = scope_annotations(context, class);
    if scopes.len() < 2 || has_annotation(context, class, &DAGGER) {
        return;
    }
    if suppressed_any(context, &["InjectMoreThanOneScopeAnnotationOnClass", "MoreThanOneScopeAnnotationOnClass"], class) {
        return;
    }
    let shown: Vec<&str> = scopes.iter().map(|annotation| context.text(*annotation)).collect();
    let message = format!(
        "This class is annotated with more than one scope annotation: {}. However, classes can only have one scope annotation applied to them. Please remove all but one of them.",
        shown.join(", ")
    );
    context.report_always_fixed("InjectMoreThanOneScopeAnnotationOnClass", class_position(class), &message, &[]);
}

/// The class and name of the instance field an assignment writes, when it writes a field.
fn assigned_field(context: &Context, target: Node) -> Option<(String, String)> {
    let name = match target.kind() {
        "identifier" => context.text(target).to_string(),
        "field_access" => context.text(target.child_by_field_name("field")?).to_string(),
        _ => return None,
    };
    let owner = match target.kind() {
        "identifier" => match context.resolver.binding(target, &name)? {
            crate::java::types::expr::Binding::Field(_, info, field) => (info.name.clone(), field.flags & flag::STATIC != 0),
            _ => return None,
        },
        _ => {
            let object = target.child_by_field_name("object")?;
            let kind = context.resolver.type_of(object)?;
            let (info, field) = context.resolver.index.field(&kind.erased().name(), &name)?;
            (info.name.clone(), field.flags & flag::STATIC != 0)
        }
    };
    (!owner.1).then_some((owner.0, name))
}

pub fn inject_on_member_and_constructor(context: &Context, class: Node) {
    if !is_class(class) {
        return;
    }
    let ctors: Vec<Node> = constructors(class).into_iter().filter(|ctor| has_annotation(context, *ctor, &INJECT)).collect();
    if ctors.len() != 1 {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()) else { return };
    let mut assigned: Vec<String> = Vec::new();
    walk(ctors[0], |node| {
        if node.kind() == "assignment_expression" && node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=") {
            let found = node.child_by_field_name("left").and_then(|left| assigned_field(context, left));
            assigned.extend(found.filter(|(owner, _)| owner == own).map(|(_, name)| name));
        }
    });
    let mut last = None;
    let mut fix = Fix::new();
    for member in class_members(class).into_iter().filter(|member| member.kind() == "field_declaration") {
        let injected = annotations(context, member).into_iter().find(|(_, name)| INJECT.contains(&name.as_str()));
        let Some((annotation, _)) = injected else { continue };
        for declarator in declarators(member) {
            let Some(name) = declarator.child_by_field_name("name") else { continue };
            if assigned.iter().any(|known| known == context.text(name)) {
                last = Some((declarator, name.start_byte()));
                fix = fix.and(annotation.start_byte(), annotation.end_byte(), "");
            }
        }
    }
    if let Some((declarator, offset)) = last {
        let message = "Members shouldn't be annotated with @Inject if constructor is already annotated @Inject";
        context.report_fixed("InjectOnMemberAndConstructor", declarator, offset, message, &[fix]);
    }
}

pub fn incompatible_modifiers(context: &Context, annotation: Node) {
    if !matches!(annotation.kind(), "marker_annotation" | "annotation") {
        return;
    }
    let Some(holder) = parent(annotation).filter(|up| up.kind() == "modifiers") else { return };
    let Some(declaration) = parent(holder) else { return };
    let written = annotation.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let Some(full) = context.resolver.class_name(declaration, written) else { return };
    let Some(info) = context.resolver.index.get(&full) else { return };
    let mut listed: Vec<&str> = Vec::new();
    for name in info.incompatible.iter().map(String::as_str) {
        if !listed.contains(&name) {
            listed.push(name);
        }
    }
    let present: Vec<String> = children(holder).into_iter().map(|part| part.kind().to_uppercase().replace('-', "_")).collect();
    let incompatible: Vec<&str> = listed.into_iter().filter(|name| present.iter().any(|known| known == name)).collect();
    if incompatible.is_empty() {
        return;
    }
    let simple = full.rsplit('.').next().unwrap_or(&full);
    let shown: Vec<String> = incompatible.iter().map(|name| name.to_lowercase().replace('_', "-")).collect();
    let message = format!("The annotation '@{simple}' has specified that it should not be used together with the following modifiers: [{}]", shown.join(", "));
    let words: Vec<String> = incompatible.iter().map(|name| name.to_lowercase().replace('_', "-")).collect();
    let words: Vec<&str> = words.iter().map(String::as_str).collect();
    let fix = remove_modifiers(Fix::new(), declaration, &words);
    context.report_fixed("IncompatibleModifiers", annotation, annotation.start_byte(), &message, &[fix]);
}
