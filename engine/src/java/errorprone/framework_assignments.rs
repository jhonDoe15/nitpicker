//! UnnecessaryAssignment: a field a framework fills (`@Inject`, `@Mock`, `@TestParameter`) that the code assigns as well.
use super::Context;
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::guice::annotations;
use super::junit_init::runner_annotation;
use super::nodes::position;
use super::vars::{Named, named};
use crate::engine::source::{children, parent, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::expr::Receiver;
use crate::java::types::model::Type;
use tree_sitter::Node;

const MOCK: &str = "org.mockito.Mock";
const GUICE_INJECT: &str = "com.google.inject.Inject";
const OPTIONAL: &str = "com.google.inject.Inject#optional";
const BOTH: &str = "Fields shouldn't be annotated with both @Mock and another @Inject-like annotation, because both Mockito and the injector will assign to the field, and one of the values will overwrite the other";
const FRAMEWORK: [&str; 4] = [GUICE_INJECT, "javax.inject.Inject", "jakarta.inject.Inject", "com.google.testing.junit.testparameterinjector.TestParameter"];

fn message(annotation: &str) -> String {
    let simple = annotation.rsplit('.').next().unwrap_or(annotation);
    format!("Fields annotated with @{simple} should not be manually assigned to, as they should be initialized by a framework. Remove the assignment if a framework is being used, or the annotation if one isn't.")
}

/// The annotations written on a declaration, with the marker for an optional Guice injection.
fn written(context: &Context, declaration: Node) -> Vec<String> {
    let mut names: Vec<String> = annotations(context, declaration).into_iter().map(|(_, name)| name).collect();
    let optional = annotations(context, declaration).into_iter().any(|(annotation, name)| {
        name == GUICE_INJECT
            && annotation.child_by_field_name("arguments").is_some_and(|list| {
                children(list).into_iter().any(|pair| {
                    pair.kind() == "element_value_pair"
                        && pair.child_by_field_name("key").is_some_and(|key| context.text(key) == "optional")
                        && pair.child_by_field_name("value").is_some_and(|value| value.kind() == "true")
                })
            })
    });
    if optional {
        names.push(OPTIONAL.to_string());
    }
    names
}

/// The annotations on the variable a name or field access stands for.
fn variable_annotations(context: &Context, target: Node) -> Vec<String> {
    match target.kind() {
        "identifier" => {
            let name = context.text(target);
            match named(context, target) {
                Some(Named::Variable(declarator)) => parent(declarator).map(|holder| written(context, holder)).unwrap_or_default(),
                Some(Named::Other(declaration)) => written(context, declaration),
                None => match context.resolver.binding(target, name) {
                    Some(crate::java::types::expr::Binding::Field(_, _, field)) => field.annotations.clone(),
                    _ => Vec::new(),
                },
            }
        }
        "field_access" => {
            let (Some(object), Some(field)) = (target.child_by_field_name("object"), target.child_by_field_name("field")) else { return Vec::new() };
            let owner = match context.resolver.receiver(object) {
                Some(Receiver::Static(owner)) | Some(Receiver::Value(Type::Class(owner, _))) => owner,
                _ => return Vec::new(),
            };
            context.resolver.index.field(&owner, context.text(field)).map(|(_, found)| found.annotations.clone()).unwrap_or_default()
        }
        _ => Vec::new(),
    }
}

fn first_framework(names: &[String]) -> Option<&'static str> {
    FRAMEWORK.iter().copied().find(|wanted| names.iter().any(|name| name == wanted))
}

pub fn unnecessary_assignment_expression(context: &Context, node: Node) {
    if node.kind() != "assignment_expression" || node.child_by_field_name("operator").is_none_or(|operator| context.text(operator) != "=") {
        return;
    }
    let Some(target) = node.child_by_field_name("left") else { return };
    let names = variable_annotations(context, target);
    let optional = names.iter().any(|name| name == OPTIONAL);
    let annotation = if names.iter().any(|name| name == MOCK) { Some(MOCK) } else { first_framework(&names).filter(|_| !optional) };
    let Some(annotation) = annotation else { return };
    let mut fixes = Vec::new();
    if let Some(statement) = parent(node).filter(|holder| holder.kind() == "expression_statement") {
        fixes.push(Fix::new().delete(statement.start_byte(), statement.end_byte()));
    }
    context.report_fixed("UnnecessaryAssignment", node, position(node), &message(annotation), &fixes);
}

fn contains_initializer(context: &Context, class: Node) -> bool {
    let mut found = false;
    walk(class, |part| {
        if found {
            return;
        }
        found = match part.kind() {
            "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" => runner_annotation(context, part, None, &["org.mockito.junit.MockitoJUnitRunner"]).is_some(),
            "method_invocation" => static_on_class(context, part, "org.mockito.MockitoAnnotations", &["initMocks"]),
            _ => false,
        };
    });
    found
}

fn remove_initializer(declarator: Node, value: Node) -> Option<Fix> {
    let equals = children(declarator).into_iter().rev().find(|part| part.kind() == "=")?;
    Some(Fix::new().delete(equals.start_byte(), value.end_byte()))
}

fn enclosing_class(node: Node) -> Option<Node> {
    std::iter::successors(parent(node), |at| parent(*at)).find(|at| matches!(at.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration"))
}

fn variable(context: &Context, declaration: Node, declarator: Node, names: &[String]) {
    let optional = names.iter().any(|name| name == OPTIONAL);
    let mock = names.iter().any(|name| name == MOCK);
    let injecty = first_framework(names).is_some() && !optional;
    let at = declarator.child_by_field_name("name").map_or(declarator.start_byte(), |name| name.start_byte());
    if mock && injecty {
        context.report_fixed("UnnecessaryAssignment", declaration, at, BOTH, &[]);
        return;
    }
    let Some(value) = declarator.child_by_field_name("value") else { return };
    if mock {
        let initialized = enclosing_class(declaration).is_some_and(|class| contains_initializer(context, class));
        let factory = static_on_class(context, value, "org.mockito.Mockito", &["mock"]);
        let annotation = annotations(context, declaration).into_iter().find(|(_, name)| name.rsplit('.').next() == Some("Mock")).map(|(annotation, _)| annotation);
        let fix = if factory && !initialized {
            annotation.map(|annotation| Fix::new().delete(annotation.start_byte(), annotation.end_byte()))
        } else {
            remove_initializer(declarator, value)
        };
        let fixes: Vec<Fix> = fix.into_iter().collect();
        context.report_fixed("UnnecessaryAssignment", declaration, at, &message(MOCK), &fixes);
    } else if injecty {
        let mut fixes = Vec::new();
        if !has_modifier(declaration, "final") {
            fixes.extend(remove_initializer(declarator, value));
        }
        let removed = annotations(context, declaration).into_iter().find(|(_, name)| FRAMEWORK.contains(&name.as_str()));
        let Some((annotation, name)) = removed else { return };
        fixes.push(Fix::new().delete(annotation.start_byte(), annotation.end_byte()));
        context.report_fixed("UnnecessaryAssignment", declaration, at, &message(&name), &fixes);
    }
}

pub fn unnecessary_assignment_variable(context: &Context, node: Node) {
    if !matches!(node.kind(), "field_declaration" | "constant_declaration" | "local_variable_declaration" | "formal_parameter" | "enum_constant") {
        return;
    }
    let names = written(context, node);
    if !names.iter().any(|name| name == MOCK || FRAMEWORK.contains(&name.as_str())) {
        return;
    }
    if node.kind() == "formal_parameter" {
        if let Some(name) = node.child_by_field_name("name") {
            let at = name.start_byte();
            let mock = names.iter().any(|found| found == MOCK);
            let injecty = first_framework(&names).is_some() && !names.iter().any(|found| found == OPTIONAL);
            if mock && injecty {
                context.report_fixed("UnnecessaryAssignment", node, at, BOTH, &[]);
            }
        }
        return;
    }
    if node.kind() == "enum_constant" {
        let at = node.start_byte();
        let mock = names.iter().any(|found| found == MOCK);
        let injecty = first_framework(&names).is_some() && !names.iter().any(|found| found == OPTIONAL);
        if mock && injecty {
            context.report_fixed("UnnecessaryAssignment", node, at, BOTH, &[]);
        } else if mock {
            context.report_fixed("UnnecessaryAssignment", node, at, &message(MOCK), &[]);
        } else if let Some((annotation, name)) = annotations(context, node).into_iter().find(|(_, name)| FRAMEWORK.contains(&name.as_str())) {
            let fix = Fix::new().delete(annotation.start_byte(), annotation.end_byte());
            context.report_fixed("UnnecessaryAssignment", node, at, &message(&name), &[fix]);
        }
        return;
    }
    for declarator in declarators(node) {
        variable(context, node, declarator, &names);
    }
}
