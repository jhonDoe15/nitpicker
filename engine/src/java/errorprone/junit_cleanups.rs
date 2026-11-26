//! ExtendingJUnitAssert, JUnit4EmptyMethods and AssertThrowsBlockToExpression.
use super::Context;
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::guice::has_annotation;
use super::hierarchy::closure;
use crate::engine::source::{children, named_children, walk};
use crate::java::helpers::declarators;
use tree_sitter::Node;

const ASSERT: &str = "org.junit.Assert";

/// javac's position of a type written as a name: a qualified name is reported at its last dot.
pub fn type_position(node: Node) -> usize {
    if matches!(node.kind(), "scoped_type_identifier" | "scoped_identifier") {
        if let Some(dot) = children(node).into_iter().rev().find(|part| part.kind() == ".") {
            return dot.start_byte();
        }
    }
    node.start_byte()
}

pub fn extending_junit_assert(context: &Context, node: Node) {
    if node.kind() != "class_declaration" {
        return;
    }
    let Some(clause) = node.child_by_field_name("superclass") else { return };
    let Some(written) = named_children(clause).into_iter().find(|part| !part.kind().ends_with("comment")) else { return };
    if !matches!(context.resolver.type_node(written), Some(kind) if kind.name() == ASSERT && matches!(kind, crate::java::types::model::Type::Class(_, _))) {
        return;
    }
    let mut fix = Fix::replace(clause.start_byte(), clause.end_byte(), "");
    let mut imported = false;
    if let Some(body) = node.child_by_field_name("body") {
        walk(body, |call| imported |= call.kind() == "method_invocation" && is_static_assert(context, call));
    }
    if imported {
        fix = fix.with_imports();
    }
    context.report_fixed(
        "ExtendingJUnitAssert",
        node,
        type_position(written),
        "When only using JUnit Assert's static methods, you should import statically instead of extending.",
        &[fix],
    );
}

fn is_static_assert(context: &Context, call: Node) -> bool {
    let Some(name) = call.child_by_field_name("name") else { return false };
    static_on_class(context, call, ASSERT, &[context.text(name)])
}

const JUNIT_METHODS: [&str; 4] = ["org.junit.BeforeClass", "org.junit.AfterClass", "org.junit.Before", "org.junit.After"];

fn contains_comments(node: Node) -> bool {
    let mut found = false;
    walk(node, |part| found |= matches!(part.kind(), "line_comment" | "block_comment"));
    found
}

pub fn junit4_empty_methods(context: &Context, node: Node) {
    if node.kind() != "method_declaration" {
        return;
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    if named_children(body).into_iter().any(|part| !part.kind().ends_with("comment")) || !has_annotation(context, node, &JUNIT_METHODS) {
        return;
    }
    let Some(owner) = super::fix_helpers::owner_class(context, node) else { return };
    if closure(context.resolver.index, &owner).len() != 1 || contains_comments(node) {
        return;
    }
    let message = "Empty JUnit4 @Before, @After, @BeforeClass, and @AfterClass methods are unnecessary and should be deleted.";
    context.report_fixed("JUnit4EmptyMethods", node, super::nodes::name_position(node), message, &[Fix::new().delete(node.start_byte(), node.end_byte())]);
}

/// The text of the comments between two offsets, as `\n` before and after each batch, or nothing.
fn kept_comments(context: &Context, within: Node, start: usize, end: usize) -> String {
    let mut found: Vec<String> = Vec::new();
    walk(within, |part| {
        if matches!(part.kind(), "line_comment" | "block_comment") && part.start_byte() >= start && part.end_byte() <= end {
            found.push(context.text(part).to_string());
        }
    });
    if found.is_empty() { String::new() } else { format!("\n{}\n", found.join("\n")) }
}

pub fn assert_throws_block_to_expression(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !static_on_class(context, node, ASSERT, &["assertThrows"]) {
        return;
    }
    let Some(lambda) = super::positions::arguments(node).last().copied().filter(|last| last.kind() == "lambda_expression") else { return };
    let Some(block) = lambda.child_by_field_name("body").filter(|body| body.kind() == "block") else { return };
    let statements: Vec<Node> = named_children(block).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let [statement] = statements[..] else { return };
    let expression = match statement.kind() {
        "expression_statement" => named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")),
        "local_variable_declaration" => {
            let all = declarators(statement);
            let [only] = all[..] else { return };
            only.child_by_field_name("value")
        }
        _ => None,
    };
    let Some(expression) = expression else { return };
    let start = block.start_byte();
    let first = Fix::replace(start, expression.start_byte(), kept_comments(context, block, start, expression.start_byte()));
    let fix = first.and(expression.end_byte(), block.end_byte(), kept_comments(context, block, expression.end_byte(), block.end_byte()));
    context.report_fixed(
        "AssertThrowsBlockToExpression",
        node,
        start,
        "assertThrows calls with lambdas containing a single statement can be expressed more concisely",
        &[fix],
    );
}
