//! ClassName, ComparableType and AutoFactoryAtInject: checks on a file's top-level classes and their annotations.
use super::Context;
use super::compat::pretty;
use super::fixes::Fix;
use super::nodes::class_position;
use super::shape::suppressed_any;
use crate::engine::source::{ancestor, children, named_children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::model::{OBJECT, Type};
use tree_sitter::Node;

const TYPES: [&str; 5] = ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

pub fn class_name(context: &Context, root: Node) {
    let Some(package) = children(root).into_iter().find(|part| part.kind() == "package_declaration") else { return };
    let Some(name) = named_children(package).into_iter().find(|part| matches!(part.kind(), "identifier" | "scoped_identifier")) else { return };
    let stem = std::path::Path::new(&context.file.path).file_stem().and_then(|stem| stem.to_str()).unwrap_or_default();
    let mut names = Vec::new();
    for member in children(root).into_iter().filter(|part| TYPES.contains(&part.kind())) {
        if suppressed_any(context, &["ClassName", "TopLevelName"], member) {
            return;
        }
        let simple = member.child_by_field_name("name").map(|simple| context.text(simple)).unwrap_or_default();
        if simple == stem || has_modifier(member, "public") {
            return;
        }
        names.push(simple);
    }
    if names.is_empty() {
        return;
    }
    let at = if name.kind() == "scoped_identifier" { children(name).into_iter().rev().find(|part| part.kind() == ".").map_or(name.start_byte(), |dot| dot.start_byte()) } else { name.start_byte() };
    let message = format!("Expected a class declaration named {stem} inside {stem}.java, instead found: {}", names.join(", "));
    context.report_always("ClassName", at, &message);
}

/// The interfaces a class declaration or an anonymous class implements: the types after `implements`, or `extends` for an interface.
fn implemented<'t>(context: &Context, node: Node<'t>) -> Vec<Node<'t>> {
    if node.kind() == "object_creation_expression" {
        let interface = node.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)).and_then(|kind| context.resolver.index.get(&kind.name()).map(|info| info.is_interface));
        return if interface == Some(true) { node.child_by_field_name("type").into_iter().collect() } else { Vec::new() };
    }
    children(node)
        .into_iter()
        .filter(|part| matches!(part.kind(), "super_interfaces" | "extends_interfaces"))
        .flat_map(|list| named_children(list).into_iter().flat_map(|inner| if inner.kind() == "type_list" { named_children(inner) } else { vec![inner] }))
        .filter(|part| !part.kind().ends_with("comment"))
        .collect()
}

/// `Signatures.prettyType` of the type a class declaration declares: its simple name and its type variables.
fn pretty_declared(context: &Context, class: Node, name: &str) -> String {
    let simple = if class.kind() == "object_creation_expression" { "" } else { name.rsplit('.').next().unwrap_or(name) };
    let variables: Vec<String> = context.resolver.index.get(name).map(|info| info.type_parameters.iter().map(|(variable, _)| variable.clone()).collect()).unwrap_or_default();
    if variables.is_empty() || simple.is_empty() { simple.to_string() } else { format!("{simple}<{}>", variables.join(", ")) }
}

/// The erasure of a type argument: a type variable erases to its first bound.
fn comparable_erasure(context: &Context, written: Node, argument: &Type) -> Type {
    match argument {
        Type::Variable(name) => super::array_calls::variable_bound(context, written, name).map_or_else(|| Type::class(OBJECT), |bound| bound.erased()),
        other => other.erased(),
    }
}

pub fn comparable_type(context: &Context, node: Node) {
    let anonymous = node.kind() == "object_creation_expression" && children(node).iter().any(|part| part.kind() == "class_body");
    if !(TYPES.contains(&node.kind()) || anonymous) {
        return;
    }
    let comparable = implemented(context, node).into_iter().find_map(|written| {
        let kind = context.resolver.written(written, true)?;
        (kind.erased().name() == "java.lang.Comparable").then_some((written, kind))
    });
    let Some((written, Type::Class(_, arguments))) = comparable else { return };
    let at = if anonymous { children(node).into_iter().find(|part| part.kind() == "class_body").map_or(node.start_byte(), |body| body.start_byte()) } else { class_position(node) };
    let Some(own) = (if anonymous { Some(String::new()) } else { context.resolver.scope.names.get(&node.id()).cloned() }) else { return };
    let message = match arguments.as_slice() {
        [] => "Comparable should not be raw".to_string(),
        [argument] if comparable_erasure(context, written, argument) != Type::class(&own) => {
            format!("Type of Comparable ({}) is not the same as implementing class ({}).", pretty(argument), pretty_declared(context, node, &own))
        }
        _ => return,
    };
    context.report_fixed("ComparableType", node, at, &message, &[]);
}

const INJECT: [&str; 3] = ["com.google.inject.Inject", "javax.inject.Inject", "jakarta.inject.Inject"];
const AUTO_FACTORY: &str = "com.google.auto.factory.AutoFactory";

pub fn auto_factory_at_inject(context: &Context, annotation: Node) {
    if !matches!(annotation.kind(), "annotation" | "marker_annotation") {
        return;
    }
    let Some(constructor) = parent(annotation).and_then(parent).filter(|declaration| matches!(declaration.kind(), "constructor_declaration" | "compact_constructor_declaration")) else { return };
    let Some(name) = annotation.child_by_field_name("name").map(|name| context.text(name)) else { return };
    if !name.ends_with("Inject") || !context.resolver.class_name(annotation, name).is_some_and(|class| INJECT.contains(&class.as_str())) {
        return;
    }
    let Some(class) = ancestor(constructor, &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"]) else { return };
    let marked = |declaration: Node| context.resolver.annotation_names(declaration).iter().any(|found| found == AUTO_FACTORY);
    if (class.kind() == "class_declaration" && marked(class)) || marked(constructor) {
        let fix = Fix::new().delete(annotation.start_byte(), annotation.end_byte());
        context.report_fixed("AutoFactoryAtInject", annotation, annotation.start_byte(), "@AutoFactory and @Inject should not be used in the same type.", &[fix]);
    }
}
