//! MissingImplementsComparable, IterableAndIterator, Overrides and InjectOnBugCheckers: checks on a class or method declaration.
use super::Context;
use super::auto_value::parents;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::hierarchy::{declared_method, formals, super_methods};
use super::nodes::{class_position, name_position};
use crate::engine::source::children;
use crate::java::types::scope::enclosing_type;
use crate::java::types::model::{Method, Type};
use tree_sitter::Node;

fn class_of(context: &Context, class: Node) -> Option<String> {
    context.resolver.scope.names.get(&class.id()).cloned()
}

fn enclosing_class_name(context: &Context, node: Node) -> Option<String> {
    enclosing_type(context.file, context.resolver.scope, node)
}

pub fn missing_implements_comparable(context: &Context, method: Node) {
    if method.kind() != "method_declaration" || method.child_by_field_name("name").is_none_or(|name| context.text(name) != "compareTo") {
        return;
    }
    let Some((_, declared)) = declared_method(context, method) else { return };
    if declared.detail.access & 1 == 0 || declared.returns != Type::Primitive("int") || declared.parameters.len() != 1 {
        return;
    }
    if declared.detail.annotations.iter().any(|name| name == "java.lang.Override") {
        return;
    }
    let Some(name) = enclosing_class_name(context, method) else { return };
    let index = context.resolver.index;
    if index.is_subtype(&name, "java.lang.Comparable") || declared.parameters[0] != Type::class(&name) {
        return;
    }
    let message = "Classes implementing valid compareTo function should implement Comparable interface";
    context.report_fixed("MissingImplementsComparable", method, name_position(method), message, &[]);
}

fn both(context: &Context, name: &str) -> bool {
    let index = context.resolver.index;
    index.is_subtype(name, "java.lang.Iterable") && index.is_subtype(name, "java.util.Iterator")
}

pub fn iterable_and_iterator(context: &Context, class: Node) {
    if !matches!(class.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration") {
        return;
    }
    let Some(name) = class_of(context, class) else { return };
    if !both(context, &name) {
        return;
    }
    for parent in parents(class) {
        if let Some(Type::Class(above, _)) = context.resolver.type_node(parent) {
            if both(context, &above) {
                return;
            }
        }
    }
    let message = "Class should not implement both `Iterable` and `Iterator`";
    context.report_fixed("IterableAndIterator", class, class_position(class), message, &[]);
}

pub fn overrides(context: &Context, method: Node) {
    if method.kind() != "method_declaration" {
        return;
    }
    let Some((origin, declared)) = declared_method(context, method) else { return };
    let supers = super_methods(context.resolver.index, origin, declared);
    let Some((_, first)) = supers.first() else { return };
    let supers_varargs = first.varargs;
    let message = "Varargs doesn't agree for overridden method";
    if supers.iter().any(|(_, above)| above.varargs != supers_varargs) {
        return context.report_fixed("Overrides", method, name_position(method), message, &[]);
    }
    if declared.varargs == supers_varargs {
        return;
    }
    let Some(last) = formals(method).last().copied() else { return };
    let mut fixes = Vec::new();
    if declared.varargs {
        if let Some(dots) = children(last).into_iter().find(|part| part.kind() == "...") {
            fixes.push(Fix::replace(dots.start_byte(), dots.end_byte(), "[]"));
        }
    } else if let Some(written) = last.child_by_field_name("type") {
        let text = context.text(written).as_bytes();
        let mut open = text.len().wrapping_sub(2);
        while open < text.len() && text[open] == b' ' {
            open = open.wrapping_sub(1);
        }
        if open < text.len() && text[open] == b'[' {
            fixes.push(Fix::replace(written.start_byte() + open, written.end_byte(), "..."));
        }
    }
    context.report_fixed("Overrides", method, name_position(method), message, &fixes);
}

pub fn inject_on_bug_checkers(context: &Context, constructor: Node) {
    if constructor.kind() != "constructor_declaration" {
        return;
    }
    if super::hierarchy::has_annotation(context, constructor, "Inject") {
        return;
    }
    let Some(owner) = enclosing_class_name(context, constructor) else { return };
    let index = context.resolver.index;
    let annotated = index.get(&owner).is_some_and(|info| info.class_annotations.iter().any(|name| name == "com.google.errorprone.BugPattern"));
    if !index.is_subtype(&owner, "com.google.errorprone.bugpatterns.BugChecker") || !annotated {
        return;
    }
    let parameters = formals(constructor);
    let flags = |parameter: &Node| context.resolver.declared_type(*parameter, None).is_some_and(|kind| matches!(kind, Type::Class(name, _) if index.is_subtype(&name, "com.google.errorprone.ErrorProneFlags")));
    if parameters.is_empty() || !parameters.iter().all(flags) {
        return;
    }
    let mut fix = Fix::new();
    let inject = qualify_type(context, constructor, "javax.inject.Inject", &mut fix);
    let fix = fix.insert(constructor.start_byte(), format!("@{inject} "));
    context.report_fixed("InjectOnBugCheckers", constructor, name_position(constructor), "BugChecker constructors should be marked @Inject.", &[fix]);
}

pub fn overrides_guice_injectable_method(context: &Context, method: Node) {
    if method.kind() != "method_declaration" || super::guice::has_annotation(context, method, &super::inject_checks::INJECT) {
        return;
    }
    let Some((origin, declared)) = declared_method(context, method) else { return };
    for (above, super_method) in super_methods(context.resolver.index, origin, declared) {
        if !super_method.detail.annotations.iter().any(|name| name == "com.google.inject.Inject") {
            continue;
        }
        let mut fix = Fix::new().insert(method.start_byte(), "@Inject\n");
        fix = fix.with_imports();
        let message = format!(
            "This method is not annotated with @Inject, but overrides the method in {} that is annotated with @com.google.inject.Inject. Guice will inject this method, and it is recommended to annotate it explicitly.",
            above.name
        );
        return context.report_fixed("OverridesGuiceInjectableMethod", method, name_position(method), &message, &[fix]);
    }
}

fn parameter_names(method: &Method) -> Vec<String> {
    if method.names.len() == method.parameters.len() {
        return method.names.clone();
    }
    (0..method.parameters.len()).map(|at| format!("arg{at}")).collect()
}

pub fn overriding_method_inconsistent_argument_names(context: &Context, method: Node) {
    if method.kind() != "method_declaration" {
        return;
    }
    let Some((origin, declared)) = declared_method(context, method) else { return };
    let supers = super_methods(context.resolver.index, origin, declared);
    let Some((_, above)) = supers.first() else { return };
    if declared.varargs || above.varargs {
        return;
    }
    let (names, super_names) = (parameter_names(declared), parameter_names(above));
    for (position, name) in names.iter().enumerate() {
        let Some(super_position) = super_names.iter().position(|other| other == name) else { continue };
        if super_position == position {
            continue;
        }
        if super_names.get(position).is_some_and(|same| names.contains(same)) {
            let message = format!(
                "The parameters of this method are inconsistent with the overridden method. A consistent order would be: {}({})",
                above.name,
                super_names.join(", ")
            );
            return context.report_fixed("OverridingMethodInconsistentArgumentNamesChecker", method, name_position(method), &message, &[]);
        }
    }
}
