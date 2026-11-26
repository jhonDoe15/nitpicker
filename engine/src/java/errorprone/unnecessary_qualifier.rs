//! UnnecessaryQualifier: a qualifier annotation where nothing injects or binds the declaration.
use super::Context;
use super::annotation_args::annotation_value;
use super::fixes::Fix;
use super::guice::annotations;
use super::hierarchy::formals;
use super::inject_checks::annotation_class;
use super::junit_tests::is_test_case;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

const NAME: &str = "UnnecessaryQualifier";
const QUALIFIERS: [&str; 2] = ["com.google.inject.BindingAnnotation", "javax.inject.Qualifier"];
const IGNORED: [&str; 1] = ["com.google.inject.assistedinject.Assisted"];
const PROVIDERS: [&str; 7] = [
    "com.google.inject.throwingproviders.CheckedProvides",
    "dagger.Binds",
    "dagger.BindsInstance",
    "dagger.BindsOptionalOf",
    "dagger.Provides",
    "dagger.multibindings.Multibinds",
    "dagger.producers.Produces",
];
const INJECTS: [&str; 3] = ["com.google.inject.Inject", "javax.inject.Inject", "jakarta.inject.Inject"];
const MORE_INJECTION_METHODS: [&str; 3] = ["com.google.auto.factory.AutoFactory", "com.google.common.inject.components.OtherRequiredBindings", "dagger.assisted.AssistedInject"];
const PROVIDES_PREFIX: &str = "Provides";
const INJECTION_PREFIXES: [&str; 2] = ["Bind", "Inject"];
const EXEMPTING_CLASS_ANNOTATIONS: [&str; 14] = [
    "com.google.auto.factory.AutoFactory",
    "dagger.Component",
    "dagger.Component.Builder",
    "dagger.Component.Factory",
    "dagger.Subcomponent",
    "dagger.Subcomponent.Builder",
    "dagger.Subcomponent.Factory",
    "dagger.hilt.EntryPoint",
    "dagger.producers.ProductionComponent",
    "dagger.producers.ProductionComponent.Builder",
    "dagger.producers.ProductionComponent.Factory",
    "dagger.producers.ProductionSubcomponent",
    "dagger.producers.ProductionSubcomponent.Builder",
    "dagger.producers.ProductionSubcomponent.Factory",
];
const JUKITO_RUNNER: &str = "org.jukito.JukitoRunner";
const GRAPH_WRAPPER: &str = "com.google.apps.framework.producers.GraphWrapper";

fn modifiers_of(declaration: Node) -> Vec<Node> {
    let Some(holder) = crate::java::helpers::modifiers(declaration) else { return Vec::new() };
    children(holder).into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).collect()
}

fn simple_name(context: &Context, annotation: Node) -> String {
    let full = annotation_class(context, annotation).unwrap_or_else(|| annotation.child_by_field_name("name").map(|name| context.text(name).to_string()).unwrap_or_default());
    full.rsplit('.').next().unwrap_or_default().to_string()
}

fn qualifier_annotations<'t>(context: &Context, declaration: Node<'t>) -> Vec<Node<'t>> {
    let index = context.resolver.index;
    modifiers_of(declaration)
        .into_iter()
        .filter(|annotation| {
            let Some(class) = annotation_class(context, *annotation) else { return false };
            let meta = index.get(&class).is_some_and(|info| info.class_annotations.iter().any(|name| QUALIFIERS.contains(&name.as_str())));
            meta && !IGNORED.contains(&class.as_str())
        })
        .collect()
}

fn has_any(context: &Context, declaration: Node, names: &[&str]) -> bool {
    modifiers_of(declaration).into_iter().any(|annotation| annotation_class(context, annotation).is_some_and(|class| names.contains(&class.as_str())))
}

fn starts_with_provides(context: &Context, declaration: Node) -> bool {
    modifiers_of(declaration).into_iter().any(|annotation| simple_name(context, annotation).starts_with(PROVIDES_PREFIX))
}

fn is_injection_method(context: &Context, method: Node) -> bool {
    has_any(context, method, &INJECTS) || has_any(context, method, &MORE_INJECTION_METHODS) || has_any(context, method, &PROVIDERS)
}

/// The class a declaration is in, and whether it is an interface or annotation type; anonymous classes have no annotations.
fn enclosing_class(node: Node) -> Option<(Node, bool)> {
    let mut current = parent(node);
    while let Some(at) = current {
        match at.kind() {
            "class_declaration" | "enum_declaration" | "record_declaration" => return Some((at, false)),
            "interface_declaration" | "annotation_type_declaration" => return Some((at, true)),
            "class_body" if parent(at).is_some_and(|holder| matches!(holder.kind(), "object_creation_expression" | "enum_constant")) => return Some((at, false)),
            _ => {}
        }
        current = parent(at);
    }
    None
}

fn class_has_annotation(context: &Context, class: Node, names: &[&str]) -> bool {
    class.kind() != "class_body" && annotations(context, class).iter().any(|(_, name)| names.contains(&name.as_str()))
}

fn has_jukito_runner(context: &Context, class: Node) -> bool {
    if class.kind() == "class_body" {
        return false;
    }
    let index = context.resolver.index;
    if !index.has(JUKITO_RUNNER) {
        return false;
    }
    modifiers_of(class).into_iter().any(|annotation| {
        let Some(value) = annotation_value(&context.file.text, annotation, "value") else { return false };
        matches!(context.resolver.type_of(value), Some(Type::Class(_, arguments)) if matches!(arguments.as_slice(), [Type::Class(runner, _)] if index.is_subtype(runner, JUKITO_RUNNER)))
    })
}

fn delete_annotations(context: &Context, matched: Node, found: Vec<Node>) {
    let Some(first) = found.first() else { return };
    let plural = found.len() > 1;
    let names: Vec<String> = found
        .iter()
        .map(|annotation| annotation_class(context, *annotation).unwrap_or_else(|| annotation.child_by_field_name("name").map(|name| context.text(name).to_string()).unwrap_or_default()))
        .collect();
    let message = format!("Qualifier annotation{} @{} {} no effect here", if plural { "s" } else { "" }, names.join(", "), if plural { "have" } else { "has" });
    let fix = found.iter().fold(Fix::new(), |fix, annotation| fix.delete(annotation.start_byte(), annotation.end_byte()));
    context.report_fixed(NAME, matched, first.start_byte(), &message, &[fix]);
}

fn method_declaration(context: &Context, method: Node) {
    let found = qualifier_annotations(context, method);
    if found.is_empty() || has_any(context, method, &PROVIDERS) || starts_with_provides(context, method) {
        return;
    }
    let Some((class, interface)) = enclosing_class(method) else { return };
    if interface || class_has_annotation(context, class, &EXEMPTING_CLASS_ANNOTATIONS) {
        return;
    }
    delete_annotations(context, method, found);
}

fn has_prefixed_annotation(context: &Context, declaration: Node) -> bool {
    modifiers_of(declaration).into_iter().any(|annotation| {
        let name = simple_name(context, annotation);
        INJECTION_PREFIXES.iter().any(|prefix| name.starts_with(prefix))
    })
}

/// A canonical constructor of the record that is marked for injection.
fn injected_canonical_constructor(context: &Context, record: Node) -> bool {
    let Some(body) = record.child_by_field_name("body") else { return false };
    let components: Vec<Option<Type>> = record.child_by_field_name("parameters").map(|list| formal_nodes(list).into_iter().map(|part| declared(context, part)).collect()).unwrap_or_default();
    named_children(body).into_iter().any(|member| {
        let canonical = match member.kind() {
            "compact_constructor_declaration" => true,
            "constructor_declaration" => {
                let parameters = formals(member);
                parameters.len() == components.len() && parameters.iter().zip(&components).all(|(parameter, component)| component.is_some() && declared(context, *parameter) == *component)
            }
            _ => false,
        };
        canonical && (has_any(context, member, &INJECTS) || has_any(context, member, &MORE_INJECTION_METHODS) || has_any(context, member, &PROVIDERS))
    })
}

fn declared(context: &Context, parameter: Node) -> Option<Type> {
    context.resolver.declared_type(parameter, None)
}

fn formal_nodes(list: Node) -> Vec<Node> {
    named_children(list).into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter")).collect()
}

fn field_like(context: &Context, matched: Node, record: Option<Node>) {
    let found = qualifier_annotations(context, matched);
    if found.is_empty() {
        return;
    }
    if !has_prefixed_annotation(context, matched) && !record.is_some_and(|record| injected_canonical_constructor(context, record)) {
        delete_annotations(context, matched, found.clone());
    }
    let compact = record.and_then(|record| record.child_by_field_name("body")).and_then(|body| named_children(body).into_iter().find(|member| member.kind() == "compact_constructor_declaration"));
    if let Some(compact) = compact {
        method_parameter(context, matched, compact, found);
    }
}

fn parameter(context: &Context, node: Node) {
    let found = qualifier_annotations(context, node);
    if found.is_empty() {
        return;
    }
    let list = parent(node);
    if list.and_then(parent).is_some_and(|holder| holder.kind() == "lambda_expression") {
        return delete_annotations(context, node, found);
    }
    let Some(method) = list.and_then(parent).filter(|holder| matches!(holder.kind(), "method_declaration" | "constructor_declaration")) else { return };
    method_parameter(context, node, method, found);
}

/// A parameter of a method, or of the compact constructor that takes the components of its record.
fn method_parameter(context: &Context, node: Node, method: Node, found: Vec<Node>) {
    if is_injection_method(context, method) || starts_with_provides(context, method) {
        return;
    }
    let index = context.resolver.index;
    if index.has(GRAPH_WRAPPER) {
        let owner = enclosing_type(context.file, context.resolver.scope, method);
        if owner.is_some_and(|owner| index.is_subtype(&owner, GRAPH_WRAPPER)) {
            return;
        }
    }
    let Some((class, _)) = enclosing_class(method) else { return };
    if is_test_case(context, method) && has_jukito_runner(context, class) {
        return;
    }
    if class_has_annotation(context, class, &EXEMPTING_CLASS_ANNOTATIONS) {
        return;
    }
    delete_annotations(context, node, found);
}

fn variable(context: &Context, node: Node) {
    match node.kind() {
        "field_declaration" | "constant_declaration" => {
            for _ in children(node).into_iter().filter(|part| part.kind() == "variable_declarator") {
                field_like(context, node, None);
            }
        }
        "local_variable_declaration" => {
            for _ in children(node).into_iter().filter(|part| part.kind() == "variable_declarator") {
                delete_annotations(context, node, qualifier_annotations(context, node));
            }
        }
        "enum_constant" | "catch_formal_parameter" | "resource" => delete_annotations(context, node, qualifier_annotations(context, node)),
        "enhanced_for_statement" => delete_annotations(context, node, qualifier_annotations(context, node)),
        "formal_parameter" | "spread_parameter" => match parent(node).and_then(parent) {
            Some(record) if record.kind() == "record_declaration" => field_like(context, node, Some(record)),
            _ => parameter(context, node),
        },
        _ => {}
    }
}

pub fn unnecessary_qualifier(context: &Context, node: Node) {
    match node.kind() {
        "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => method_declaration(context, node),
        _ => variable(context, node),
    }
}
