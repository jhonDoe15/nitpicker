//! TheoryButNoTheories, JUnitParameterMethodNotFound, TryFailThrowable and UseCorrectAssertInTests.
use super::Context;
use super::consts::{Const, constant};
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::guice::annotations;
use super::hierarchy::closure;
use super::junit_init::{annotated_on_overridden, enclosing_class, members, runner_annotation};
use super::nodes::{statements, unparenthesized};
use super::positions::arguments;
use super::testcode::is_junit_test_code;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

const THEORIES: &str = "org.junit.experimental.theories.Theories";
const THEORY_TYPES: [&str; 3] = ["org.junit.experimental.theories.Theory", "org.junit.experimental.theories.DataPoint", "org.junit.experimental.theories.DataPoints"];
const TEST_RUNNERS: [&str; 2] = ["org.mockito.junit.MockitoJUnitRunner", "org.junit.runners.BlockJUnit4ClassRunner"];

pub fn theory_but_no_theories(context: &Context, class: Node) {
    if !matches!(class.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration") {
        return;
    }
    if runner_annotation(context, class, None, &TEST_RUNNERS).is_none() || runner_annotation(context, class, None, &[THEORIES]).is_some() {
        return;
    }
    let annotated = members(class).into_iter().any(|member| annotations(context, member).iter().any(|(_, name)| THEORY_TYPES.contains(&name.as_str())));
    if !annotated {
        return;
    }
    let Some(run_with) = annotations(context, class).into_iter().map(|(annotation, _)| annotation).find(|annotation| {
        annotation.child_by_field_name("name").is_some_and(|name| context.text(name).rsplit('.').next() == Some("RunWith"))
    }) else {
        return;
    };
    let mut fix = Fix::new();
    let theories = qualify_type(context, class, THEORIES, &mut fix);
    let fix = fix.and(run_with.start_byte(), run_with.end_byte(), format!("@RunWith({theories}.class)"));
    let message = "This test has members annotated with @Theory, @DataPoint, or @DataPoints but is using the default JUnit4 runner.";
    context.report_fixed("TheoryButNoTheories", class, super::nodes::class_position(class), message, &[fix]);
}

fn argument_pairs<'t>(context: &Context, annotation: Node<'t>) -> Vec<(String, Node<'t>)> {
    let Some(list) = annotation.child_by_field_name("arguments") else { return Vec::new() };
    named_children(list)
        .into_iter()
        .filter(|part| !part.kind().ends_with("comment"))
        .filter_map(|part| match part.kind() {
            "element_value_pair" => Some((context.text(part.child_by_field_name("key")?).to_string(), part.child_by_field_name("value")?)),
            _ => Some(("value".to_string(), part)),
        })
        .collect()
}

fn method_names(context: &Context, class: &str) -> Vec<String> {
    let index = context.resolver.index;
    let mut names = Vec::new();
    for owner in std::iter::once(class.to_string()).chain(closure(index, class)) {
        if let Some(info) = index.get(&owner) {
            names.extend(info.methods.iter().map(|method| method.name.clone()));
        }
    }
    names
}

fn pascal_case(name: &str) -> String {
    let mut chars = name.chars();
    match chars.next() {
        Some(first) => first.to_ascii_uppercase().to_string() + chars.as_str(),
        None => String::new(),
    }
}

pub fn junit_parameter_method_not_found(context: &Context, method: Node) {
    if method.kind() != "method_declaration" || method.child_by_field_name("body").is_none() {
        return;
    }
    let Some(parameters) = annotations(context, method).into_iter().find(|(_, name)| name == "junitparams.Parameters").map(|(annotation, _)| annotation) else { return };
    let Some(class) = enclosing_class(method) else { return };
    if runner_annotation(context, class, None, &["junitparams.JUnitParamsRunner"]).is_none() {
        return;
    }
    if !annotated_on_overridden(context, method, &["org.junit.Test"]) || annotated_on_overridden(context, method, &["org.junit.Ignore"]) {
        return;
    }
    let pairs = argument_pairs(context, parameters);
    let mut required: Vec<String> = Vec::new();
    let mut in_source: Vec<String> = Vec::new();
    if pairs.is_empty() {
        let Some(name) = method.child_by_field_name("name") else { return };
        required.push(format!("parametersFor{}", pascal_case(context.text(name))));
    } else if let Some((_, expression)) = pairs.iter().find(|(key, _)| key == "method") {
        let Some(Const::Str(listed)) = constant(context, *expression) else { return };
        required.extend(listed.split(',').map(|part| part.trim_matches(char::is_whitespace).to_string()));
        if let Some((_, source)) = pairs.iter().find(|(key, _)| key == "source") {
            if let Some(Type::Class(_, given)) = context.resolver.type_of(*source) {
                if let Some(Type::Class(owner, _)) = given.first() {
                    in_source = method_names(context, owner);
                }
            }
        }
    }
    if in_source.is_empty() {
        let Some(own) = context.resolver.scope.names.get(&class.id()) else { return };
        in_source = method_names(context, own);
    }
    required.sort_by_key(|name| name.encode_utf16().collect::<Vec<u16>>());
    required.dedup();
    let missing: Vec<&String> = required.iter().filter(|name| !in_source.contains(name)).collect();
    if missing.is_empty() {
        return;
    }
    let listed = missing.iter().map(|name| name.as_str()).collect::<Vec<_>>().join(",");
    let at = method.child_by_field_name("name").map_or(method.start_byte(), |name| name.start_byte());
    context.report_fixed("JUnitParameterMethodNotFound", method, at, &format!("{listed} method(s) not found"), &[]);
}

const ASSERT_CLASSES: [&str; 3] = ["org.junit.Assert", "junit.framework.Assert", "junit.framework.TestCase"];

fn fail_or_assert(context: &Context, statement: Node) -> bool {
    let Some(call) = statement.named_child(0).filter(|call| statement.kind() == "expression_statement" && call.kind() == "method_invocation") else { return false };
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    if !(name.starts_with("assert") || name.starts_with("fail")) {
        return false;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    resolved.method.is_static && (ASSERT_CLASSES.contains(&resolved.declaring.as_str()) || resolved.declaring.ends_with("MoreAsserts"))
}

#[derive(PartialEq)]
enum Caught {
    Error,
    Throwable,
    Assertion,
}

fn caught_type(context: &Context, parameter: Node) -> Option<Caught> {
    let kind = children(parameter).into_iter().find(|part| part.kind() == "catch_type")?;
    let listed = named_children(kind);
    let [only] = listed.as_slice() else { return None };
    match context.resolver.type_node(*only)? {
        Type::Class(name, _) => match name.as_str() {
            "java.lang.Throwable" => Some(Caught::Throwable),
            "java.lang.Error" => Some(Caught::Error),
            "java.lang.AssertionError" | "junit.framework.AssertionFailedError" => Some(Caught::Assertion),
            _ => None,
        },
        _ => None,
    }
}

fn message_snippet(context: &Context, fail: Node, others: bool) -> String {
    let Some(call) = fail.named_child(0) else { return String::new() };
    let first_is_string = context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.parameters.first().is_some_and(|first| *first == Type::class("java.lang.String")));
    match arguments(call).first() {
        Some(first) if first_is_string => format!("{}{}", context.text(*first), if others { ", " } else { "" }),
        _ => String::new(),
    }
}

pub fn try_fail_throwable(context: &Context, tree: Node) {
    if !matches!(tree.kind(), "try_statement" | "try_with_resources_statement") {
        return;
    }
    let Some(block) = tree.child_by_field_name("body") else { return };
    let Some(fail) = statements(block).into_iter().find(|statement| fail_or_assert(context, *statement)) else { return };
    let catches: Vec<Node> = children(tree).into_iter().filter(|part| part.kind() == "catch_clause").collect();
    let [catch] = catches.as_slice() else { return };
    let Some(parameter) = children(*catch).into_iter().find(|part| part.kind() == "catch_formal_parameter") else { return };
    let Some(kind) = caught_type(context, parameter) else { return };
    let Some(handler) = catch.child_by_field_name("body") else { return };
    if !statements(handler).is_empty() {
        return;
    }
    let name = parameter.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let mut fixes = Vec::new();
    if kind == Caught::Throwable {
        fixes.push(Fix::replace(parameter.start_byte(), parameter.end_byte(), format!("Exception {name}")));
    }
    if kind == Caught::Assertion {
        let message = message_snippet(context, fail, false);
        fixes.push(Fix::replace(fail.start_byte(), fail.end_byte(), format!("throw new Error({message});")));
    }
    let in_method_end = parent(tree).is_some_and(|block_parent| {
        matches!(block_parent.kind(), "block" | "constructor_body")
            && parent(block_parent).is_some_and(|owner| matches!(owner.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration"))
            && statements(block_parent).last().is_some_and(|last| last.id() == tree.id())
    });
    let fix = Fix::new().delete(fail.start_byte(), fail.end_byte());
    if in_method_end {
        let message = message_snippet(context, fail, false);
        fixes.push(fix.and(handler.start_byte(), handler.end_byte(), "{ return; }").insert(tree.end_byte(), format!("fail({message});")));
    } else {
        let message = message_snippet(context, fail, true);
        fixes.push(
            fix.insert(tree.start_byte(), "boolean threw = false;")
                .and(handler.start_byte(), handler.end_byte(), "{ threw = true; }")
                .insert(tree.end_byte(), format!("assertTrue({message}threw);")),
        );
    }
    let text = "Catching Throwable/Error masks failures from fail() or assert*() in the try block";
    context.report_fixed("TryFailThrowable", tree, parameter.child_by_field_name("name").map_or(parameter.start_byte(), |name| name.start_byte()), text, &fixes);
}

fn skip_parens(node: Node) -> Node {
    unparenthesized(node)
}

fn add_fix(context: &Context, fix: Fix, expression: Node, assertion: Node, method: &str) -> Fix {
    let detail = named_children(assertion).get(1).copied();
    let source = context.text(skip_parens(expression));
    let replacement = match detail {
        None => format!("assertThat({source}).{method}"),
        Some(detail) => {
            let string = context.resolver.type_of(detail).is_some_and(|kind| kind == Type::class("java.lang.String"));
            format!("assertWithMessage({}{}).that({source}).{method}", context.text(detail), if string { "" } else { ".toString()" })
        }
    };
    fix.with_imports().and(assertion.start_byte(), assertion.end_byte(), replacement)
}

fn equality_fix(context: &Context, fix: Fix, assertion: Node, equal: bool) -> Fix {
    let condition = skip_parens(named_children(assertion)[0]);
    let (Some(left), Some(right)) = (condition.child_by_field_name("left"), condition.child_by_field_name("right")) else { return fix };
    let null = |side: Node| side.kind() == "null_literal";
    let (is_null, not_null) = ("isNull();", "isNotNull();");
    let primitive = |side: Node| matches!(context.resolver.type_of(side), Some(Type::Primitive(_)));
    if null(left) {
        add_fix(context, fix, right, assertion, if equal { is_null } else { not_null })
    } else if null(right) {
        add_fix(context, fix, left, assertion, if equal { is_null } else { not_null })
    } else if primitive(left) || primitive(right) {
        let call = if equal { "isEqualTo" } else { "isNotEqualTo" };
        add_fix(context, fix, left, assertion, &format!("{call}({});", context.text(right)))
    } else {
        let call = if equal { "isSameInstanceAs" } else { "isNotSameInstanceAs" };
        add_fix(context, fix, left, assertion, &format!("{call}({});", context.text(right)))
    }
}

fn replace_assert(context: &Context, fix: Fix, assertion: Node) -> Fix {
    let condition = skip_parens(named_children(assertion)[0]);
    if condition.kind() == "unary_expression" && condition.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "!") {
        let Some(operand) = condition.child_by_field_name("operand") else { return fix };
        return add_fix(context, fix, operand, assertion, "isFalse();");
    }
    if condition.kind() == "method_invocation" && condition.child_by_field_name("name").is_some_and(|name| context.text(name) == "equals") {
        let instance = context.resolver.resolve_call(condition).is_some_and(|resolved| !resolved.method.is_static);
        if let (true, Some(receiver), Some(first)) = (instance, condition.child_by_field_name("object"), arguments(condition).first().copied()) {
            return add_fix(context, fix, receiver, assertion, &format!("isEqualTo({});", context.text(skip_parens(first))));
        }
    }
    if condition.kind() == "binary_expression" {
        match condition.child_by_field_name("operator").map(|operator| context.text(operator)) {
            Some("==") => return equality_fix(context, fix, assertion, true),
            Some("!=") => return equality_fix(context, fix, assertion, false),
            _ => {}
        }
    }
    add_fix(context, fix, condition, assertion, "isTrue();")
}

pub fn use_correct_assert_in_tests(context: &Context, method: Node) {
    if !matches!(method.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration") || method.child_by_field_name("body").is_none() || !(is_junit_test_code(context, method) || context.test_only()) {
        return;
    }
    let mut asserts = Vec::new();
    walk(method, |node| {
        if node.kind() == "assert_statement" {
            asserts.push(node);
        }
    });
    let Some(first) = asserts.first().copied() else { return };
    let mut fix = Fix::new();
    for assertion in &asserts {
        fix = replace_assert(context, fix, *assertion);
    }
    let message = "Java assert is used in testing code. For testing purposes, prefer using Truth-based assertions.";
    context.report_fixed("UseCorrectAssertInTests", method, first.start_byte(), message, &[fix]);
}
