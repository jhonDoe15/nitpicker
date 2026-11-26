//! PreferTestParameter: `@TestParameters` that lists every constant of an enum or both booleans of the only parameter.
use super::annotation_args::annotation_value;
use super::consts::{constant, Const};
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::hierarchy::formals;
use super::inject_checks::{annotation_class, annotations_of};
use super::nodes::name_position;
use super::Context;
use crate::engine::source::named_children;
use crate::java::types::model::{flag, Type};
use tree_sitter::Node;

const TEST_PARAMETER: &str = "com.google.testing.junit.testparameterinjector.TestParameter";
const TEST_PARAMETERS: &str = "com.google.testing.junit.testparameterinjector.TestParameters";

fn is_word(character: char) -> bool {
    character.is_alphanumeric() || character == '_'
}

/// `Pattern.compile("\\b" + Pattern.quote(constant) + "\\b").matcher(value).find()`.
fn mentions(value: &str, constant: &str) -> bool {
    let boundary = |before: Option<char>, after: Option<char>| before.is_some_and(is_word) != after.is_some_and(is_word);
    value.match_indices(constant).any(|(at, found)| {
        let before = value[..at].chars().next_back();
        let after = value[at + found.len()..].chars().next();
        boundary(before, constant.chars().next()) && boundary(constant.chars().next_back(), after)
    })
}

fn strings_of(context: &Context, value: Node, found: &mut Vec<String>) {
    if value.kind() == "element_value_array_initializer" {
        for part in named_children(value).into_iter().filter(|part| !part.kind().ends_with("comment")) {
            strings_of(context, part, found);
        }
    } else if let Some(Const::Str(text)) = constant(context, value) {
        found.push(text);
    }
}

fn expected_constants(context: &Context, kind: &Type) -> Vec<String> {
    match kind {
        Type::Primitive("boolean") => vec!["true".to_string(), "false".to_string()],
        Type::Class(name, _) if name == "java.lang.Boolean" => vec!["true".to_string(), "false".to_string()],
        Type::Class(name, _) => match context.resolver.index.get(name) {
            Some(info) if info.flags & flag::ENUM != 0 => info.fields.iter().filter(|field| field.flags & flag::ENUM != 0).map(|field| field.name.clone()).collect(),
            _ => Vec::new(),
        },
        _ => Vec::new(),
    }
}

pub fn prefer_test_parameter(context: &Context, method: Node) {
    if method.kind() != "method_declaration" {
        return;
    }
    let parameters = formals(method);
    let [parameter] = parameters.as_slice() else { return };
    let parameter = *parameter;
    if annotations_of(parameter).into_iter().any(|annotation| annotation_class(context, annotation).as_deref() == Some(TEST_PARAMETER)) {
        return;
    }
    let Some(kind) = parameter.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)) else { return };
    let expected = expected_constants(context, &kind);
    if expected.is_empty() {
        return;
    }
    let mut values = Vec::new();
    let mut removed = Vec::new();
    for annotation in annotations_of(method) {
        if annotation_class(context, annotation).as_deref() != Some(TEST_PARAMETERS) {
            continue;
        }
        if annotation_value(&context.file.text, annotation, "customName").is_some() {
            return;
        }
        if let Some(value) = annotation_value(&context.file.text, annotation, "value") {
            strings_of(context, value, &mut values);
        }
        removed.push(annotation);
    }
    if !expected.iter().all(|name| values.iter().any(|value| mentions(value, name))) || values.len() != expected.len() {
        return;
    }
    let mut fix = Fix::new();
    for annotation in &removed {
        fix = fix.delete(annotation.start_byte(), annotation.end_byte());
    }
    let name = qualify_type(context, method, TEST_PARAMETER, &mut fix);
    let fix = fix.insert(parameter.start_byte(), format!("@{name} "));
    let message = "When exhaustively testing all values of a single enum or boolean parameter, prefer @TestParameter over @TestParameters.";
    context.report_fixed("PreferTestParameter", method, name_position(method), message, &[fix]);
}
