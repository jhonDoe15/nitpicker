//! ParametersButNotParameterized, TestParametersNotInitialized and TestExceptionChecker: JUnit 4 runners and `@Test(expected = ...)`.
use super::annotation_args::{annotation_arguments, annotation_value};
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::inject_checks::{annotation_class, annotations_of};
use super::shape::{class_keyword, is_class};
use super::Context;
use crate::engine::source::{children, named_children};
use crate::java::types::model::Type;
use tree_sitter::Node;

const RUN_WITH: &str = "org.junit.runner.RunWith";
const TEST_RUNNERS: [&str; 2] = ["org.mockito.junit.MockitoJUnitRunner", "org.junit.runners.BlockJUnit4ClassRunner"];
const PARAMETERIZED: &str = "org.junit.runners.Parameterized";
const TEST_PARAMETER_INJECTOR: &str = "com.google.testing.junit.testparameterinjector.TestParameterInjector";
const NON_PARAMETERIZED_RUNNERS: [&str; 5] = [
    "androidx.test.ext.junit.runners.AndroidJUnit4",
    "junitparams.JUnitParamsRunner",
    "org.junit.experimental.theories.Theories",
    "org.junit.runners.JUnit4",
    "org.junit.runners.Parameterized",
];

/// The class `X` of the `X.class` that a `@RunWith` annotation names, when it names a class.
fn runner_class(context: &Context, annotation: Node) -> Option<String> {
    let value = annotation_value(&context.file.text, annotation, "value")?;
    let literal = crate::java::types::expr::unwrap(value);
    if literal.kind() != "class_literal" {
        return None;
    }
    match context.resolver.type_node(literal.named_child(0)?)? {
        Type::Class(name, _) => Some(name),
        _ => None,
    }
}

fn run_with_annotations<'t>(context: &Context, class: Node<'t>) -> Vec<(Node<'t>, String)> {
    annotations_of(class)
        .into_iter()
        .filter(|annotation| annotation_class(context, *annotation).as_deref() == Some(RUN_WITH))
        .filter_map(|annotation| Some((annotation, runner_class(context, annotation)?)))
        .collect()
}

fn runs_with_any(context: &Context, class: Node, runners: &[&str]) -> bool {
    run_with_annotations(context, class).iter().any(|(_, runner)| runners.iter().any(|base| context.resolver.index.is_subtype(runner, base)))
}

fn members<'t>(class: Node<'t>) -> Vec<Node<'t>> {
    let Some(body) = children(class).into_iter().find(|part| part.kind().ends_with("_body")) else { return Vec::new() };
    named_children(body).into_iter().flat_map(|part| if part.kind() == "enum_body_declarations" { named_children(part) } else { vec![part] }).collect()
}

fn member_annotated(context: &Context, class: Node, names: &[&str]) -> bool {
    members(class).into_iter().any(|member| annotations_of(member).into_iter().any(|annotation| annotation_class(context, annotation).is_some_and(|found| names.contains(&found.as_str()))))
}

/// The `@RunWith` annotation that comes first, found by its simple name as written.
fn first_run_with<'t>(context: &Context, class: Node<'t>) -> Option<Node<'t>> {
    annotations_of(class).into_iter().find(|annotation| {
        annotation.child_by_field_name("name").is_some_and(|name| context.text(name).rsplit('.').next() == Some("RunWith"))
    })
}

fn use_runner(context: &Context, class: Node, runner: &str) {
    let Some(annotation) = first_run_with(context, class) else { return };
    let mut fix = Fix::new();
    let name = qualify_type(context, class, runner, &mut fix);
    let fix = fix.and(annotation.start_byte(), annotation.end_byte(), format!("@RunWith({name}.class)"));
    let (check, message) = if runner == PARAMETERIZED {
        ("ParametersButNotParameterized", "This test has @Parameters but is using the default JUnit4 runner. The parameters will have no effect.")
    } else {
        (
            "TestParametersNotInitialized",
            "This test has @TestParameter fields but is using the default JUnit4 runner. The parameters will not be initialised beyond their default value.",
        )
    };
    context.report_fixed(check, class, class_keyword(class), message, &[fix]);
}

pub fn parameters_but_not_parameterized(context: &Context, node: Node) {
    if !is_class(node) || !runs_with_any(context, node, &TEST_RUNNERS) {
        return;
    }
    if member_annotated(context, node, &["org.junit.runners.Parameterized.Parameter", "org.junit.runners.Parameterized.Parameters"]) {
        use_runner(context, node, PARAMETERIZED);
    }
}

pub fn test_parameters_not_initialized(context: &Context, node: Node) {
    if !is_class(node) || !runs_with_any(context, node, &NON_PARAMETERIZED_RUNNERS) || runs_with_any(context, node, &[TEST_PARAMETER_INJECTOR]) {
        return;
    }
    if member_annotated(context, node, &["com.google.testing.junit.testparameterinjector.TestParameter"]) {
        use_runner(context, node, TEST_PARAMETER_INJECTOR);
    }
}

/// Deletes the `expected` argument of `@Test(...)` and returns what it expected, as `deleteExpectedException` does.
fn delete_expected<'t>(context: &Context, method: Node<'t>, fix: &mut Fix) -> Option<Node<'t>> {
    for annotation in annotations_of(method) {
        if annotation_class(context, annotation).as_deref() != Some("org.junit.Test") {
            continue;
        }
        let arguments = annotation_arguments(annotation);
        for (at, argument) in arguments.iter().enumerate() {
            let key = argument.child_by_field_name("key").filter(|_| argument.kind() == "element_value_pair");
            if key.is_none_or(|key| context.text(key) != "expected") {
                continue;
            }
            if arguments.len() == 1 {
                let name = qualify_type(context, method, "org.junit.Test", fix);
                *fix = std::mem::take(fix).and(annotation.start_byte(), annotation.end_byte(), format!("@{name}"));
            } else if at == arguments.len() - 1 {
                let end = arguments[at].end_byte();
                *fix = std::mem::take(fix).and(end, end, "");
            } else {
                *fix = std::mem::take(fix).and(argument.start_byte(), arguments[at + 1].start_byte(), "");
            }
            return argument.child_by_field_name("value");
        }
    }
    None
}

pub fn test_exception_checker(context: &Context, node: Node) {
    if node.kind() != "method_declaration" {
        return;
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    let mut fix = Fix::new();
    let Some(expected) = delete_expected(context, node, &mut fix) else { return };
    let statements: Vec<Node> = named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    if let Some(last) = statements.last() {
        fix = fix.with_imports();
        let mut prefix = format!("assertThrows({}, () -> ", context.text(expected));
        match last.kind() {
            "expression_statement" => {
                if let Some(expression) = last.named_child(0) {
                    fix = fix.insert(expression.start_byte(), prefix).insert(expression.end_byte(), ")");
                }
            }
            _ => {
                prefix.push_str(" {");
                fix = fix.insert(last.start_byte(), prefix).insert(last.end_byte(), "});");
            }
        }
    }
    let Some(name) = node.child_by_field_name("name") else { return };
    let message = "Using @Test(expected=...) is discouraged, since the test will pass if *any* statement in the test method throws the expected exception";
    context.report_fixed("TestExceptionChecker", node, name.start_byte(), message, &[fix]);
}
