//! Error Prone's `AssertThrowsUtils.tryFailToAssertThrows`, the fix MissingFail and TryFailRefactoring offer, with
//! `VariableNamer`, and TryFailRefactoring itself.
use super::Context;
use super::assert_throws::{Statement, javac_statements};
use super::fixes::Fix;
use super::junit_tests::is_test_case;
use crate::engine::source::{named_children, walk};
use std::collections::HashSet;
use tree_sitter::Node;

/// `SuggestedFixes.VariableNamer`: the names seen from the method, and each name it hands out.
pub struct Namer(HashSet<String>);

impl Namer {
    pub fn at(context: &Context, method: Node) -> Namer {
        Namer(super::idents::all_idents(context, method))
    }
    pub fn from(names: HashSet<String>) -> Namer {
        Namer(names)
    }
    pub fn avoid_shadowing(&mut self, name: &str) -> String {
        let mut index = 1;
        loop {
            let candidate = if index == 1 { name.to_string() } else { format!("{name}{index}") };
            if self.0.insert(candidate.clone()) {
                return candidate;
            }
            index += 1;
        }
    }
}

pub fn statements(block: Node) -> Vec<Node> {
    named_children(block).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

pub fn catches(tree: Node) -> Vec<Node> {
    named_children(tree).into_iter().filter(|part| part.kind() == "catch_clause").collect()
}

pub fn catch_parameter(clause: Node) -> Option<Node> {
    named_children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter")
}

pub fn catch_type(parameter: Node) -> Option<Node> {
    named_children(parameter).into_iter().find(|part| part.kind() == "catch_type")
}

fn parameter_comment(text: &str) -> bool {
    text.starts_with("/*") && text.ends_with("*/") && !text.contains('\n') && text[2..text.len() - 2].trim_end().ends_with('=')
}

/// The comments of the tokens from the try block to the end of the statement, as `getOffsetTokens` gives them.
fn comments(context: &Context, tree: Node, block: Node) -> Vec<String> {
    let tokens = super::tokens::tokens(&context.file.text, block.start_byte(), tree.end_byte());
    tokens
        .iter()
        .flat_map(|token| token.comments.iter().map(|(_, text)| text.to_string()))
        .filter(|text| !text.is_empty() && !parameter_comment(text))
        .collect()
}

/// The usages of a catch parameter in its block, renamed.
fn rename(context: &Context, body: Node, name: &str, new_name: &str, mut fix: Fix) -> Fix {
    walk(body, |node| {
        if node.kind() != "identifier" || context.text(node) != name {
            return;
        }
        let up = crate::engine::source::parent(node);
        let named = up.is_some_and(|up| {
            up.child_by_field_name("name").is_some_and(|part| part.id() == node.id())
                || (up.kind() == "field_access" && up.child_by_field_name("field").is_some_and(|part| part.id() == node.id()))
        });
        if !named && matches!(context.resolver.binding(node, name), Some(crate::java::types::expr::Binding::Local(_))) {
            fix = std::mem::take(&mut fix).and(node.start_byte(), node.end_byte(), new_name);
        }
    });
    fix
}

/// `tryFailToAssertThrows`: the try statement as an `assertThrows` call, or `None` where it gives no fix.
pub fn try_fail_to_assert_throws(context: &Context, tree: Node, throwing: &[Statement], namer: &mut Namer) -> Option<Fix> {
    let [clause] = catches(tree)[..] else { return None };
    let block = tree.child_by_field_name("body")?;
    let mut prefix = String::new();
    let found = comments(context, tree, block);
    if !found.is_empty() {
        prefix.push_str(&found.join("\n"));
        prefix.push('\n');
    }
    let (last, hoisted) = throwing.split_last()?;
    let parameter = catch_parameter(clause)?;
    let body = clause.child_by_field_name("body")?;
    let caught = statements(body);
    let mut fix = Fix::new();
    let mut suffix = "";
    if let Some(resources) = tree.child_by_field_name("resources") {
        let listed: Vec<&str> = named_children(resources).into_iter().filter(|part| part.kind() == "resource").map(|part| context.text(part)).collect();
        prefix.push_str(&format!("try ({}) {{\n", listed.join("\n")));
        suffix = "\n}";
    }
    for statement in hoisted {
        prefix.push_str(&context.file.text[statement.node.start_byte()..statement.end()]);
        prefix.push('\n');
    }
    if !caught.is_empty() {
        let name = context.text(parameter.child_by_field_name("name")?);
        let new_name = namer.avoid_shadowing(name);
        if new_name != name {
            fix = rename(context, body, name, &new_name, fix);
        }
        prefix.push_str(&format!("var {new_name} = "));
    }
    prefix.push_str(&format!("assertThrows({}.class, () -> ", context.text(catch_type(parameter)?)));
    let mut target = last.node;
    if target.kind() == "expression_statement" {
        target = target.named_child(0)?;
    }
    if target.kind() == "assignment_expression" && target.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=") {
        target = target.child_by_field_name("right")?;
    }
    if let Some(value) = last.declarator.and_then(|declarator| declarator.child_by_field_name("value")) {
        target = value;
    }
    let statement_switch = target.kind() == "switch_expression" && super::reach::is_statement_switch(target);
    let expression = !target.kind().ends_with("statement") && !target.kind().ends_with("declaration") && target.kind() != "block" && !statement_switch;
    let target_end = if expression || last.declarator.is_none() { target.end_byte() } else { last.end() };
    if !expression {
        prefix.push('{');
    }
    fix = fix.and(tree.start_byte(), target.start_byte(), prefix).insert(target_end, if expression { ")" } else { "});" });
    match (caught.first(), caught.last()) {
        (Some(first), Some(end)) => fix = fix.and(last.end(), first.start_byte(), "\n").and(end.end_byte(), tree.end_byte(), suffix),
        _ => fix = fix.and(last.end(), tree.end_byte(), suffix),
    }
    Some(fix.with_imports())
}

fn is_try(node: Node) -> bool {
    matches!(node.kind(), "try_statement" | "try_with_resources_statement")
}

/// `expressionStatement(staticMethod().anyClass().named("fail"))`.
fn calls_fail(context: &Context, statement: Node) -> bool {
    statement.kind() == "expression_statement"
        && statement.named_child(0).is_some_and(|call| {
            call.kind() == "method_invocation"
                && call.child_by_field_name("name").is_some_and(|name| context.text(name) == "fail")
                && context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.is_static)
        })
}

fn unresolved_fail(context: &Context, statement: Node) -> bool {
    statement.kind() == "expression_statement"
        && statement.named_child(0).is_some_and(|call| {
            call.kind() == "method_invocation"
                && call.child_by_field_name("name").is_some_and(|name| context.text(name) == "fail")
                && context.resolver.resolve_call(call).is_none()
        })
}

pub fn try_fail_refactoring(context: &Context, method: Node) {
    let Some(method_body) = method.child_by_field_name("body") else { return };
    if !is_test_case(context, method) {
        return;
    }
    let mut namer = Namer::at(context, method);
    let mut tries = Vec::new();
    walk(method_body, |node| {
        if is_try(node) {
            tries.push(node);
        }
    });
    for tree in tries {
        let Some(block) = tree.child_by_field_name("body") else { continue };
        let body = javac_statements(block);
        if body.is_empty() || named_children(tree).iter().any(|part| part.kind() == "finally_clause") || catches(tree).len() != 1 {
            continue;
        }
        let union = catches(tree).first().and_then(|clause| catch_parameter(*clause)).and_then(catch_type).is_some_and(|kind| named_children(kind).len() > 1);
        let last_fails = body.last().is_some_and(|last| last.declarator.is_none() && calls_fail(context, last.node));
        if union || !last_fails || context.suppressed("TryFailRefactoring", tree) {
            if !union && body.last().is_some_and(|last| unresolved_fail(context, last.node)) {
                context.hand_back("TryFailRefactoring", tree);
            }
            continue;
        }
        if let Some(fix) = try_fail_to_assert_throws(context, tree, &body[..body.len() - 1], &mut namer) {
            context.report_fixed("TryFailRefactoring", tree, tree.start_byte(), "Prefer assertThrows to try/fail", &[fix]);
        }
    }
}
