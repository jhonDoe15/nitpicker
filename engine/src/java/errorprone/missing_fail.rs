//! MissingFail: a test's try block that expects an exception and never fails when none comes.
use super::Context;
use super::assert_throws_fix::{Namer, catch_parameter, catch_type, catches, try_fail_to_assert_throws};
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::missing_fail_parts::{any_argument, called, contains, instance_field, log_call, on_asserts, real_assert, strip, symbol_kind, throw_or_fail};
use super::guice::has_annotation;
use super::junit_init::{TEST, annotated_on_overridden, members, runner_annotation};
use super::shape::is_class;
use crate::engine::source::{named_children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::Binding;
use tree_sitter::Node;

const MESSAGE: &str = "Not calling fail() when expecting an exception masks bugs";
const RUNNERS: [&str; 2] = ["org.mockito.junit.MockitoJUnitRunner", "org.junit.runners.BlockJUnit4ClassRunner"];
const INAPPLICABLE: [&str; 4] = ["java.lang.InterruptedException", "java.lang.AssertionError", "java.lang.Throwable", "junit.framework.AssertionFailedError"];

fn test_class(context: &Context, class: Node) -> bool {
    let name = context.resolver.scope.names.get(&class.id()).cloned();
    name.is_some_and(|name| context.resolver.index.is_subtype(&name, "junit.framework.TestCase"))
        || (is_class(class) && runner_annotation(context, class, None, &RUNNERS).is_some())
        || members(class).into_iter().any(|member| member.kind() == "method_declaration" && annotated_on_overridden(context, member, &[TEST]))
}

fn in_test_class(context: &Context, tree: Node) -> bool {
    let mut current = parent(tree);
    while let Some(at) = current {
        if super::idents::is_class_tree(at) && test_class(context, at) {
            return true;
        }
        current = parent(at);
    }
    false
}

fn ancestor_of<'t>(tree: Node<'t>, kinds: &[&str]) -> Option<Node<'t>> {
    let mut current = parent(tree);
    while let Some(at) = current {
        if kinds.contains(&at.kind()) {
            return Some(at);
        }
        current = parent(at);
    }
    None
}

fn set_up_or_tear_down(context: &Context, method: Node, name: &str) -> bool {
    let visible = has_modifier(method, "public") || has_modifier(method, "protected");
    called(context, method) == name
        && super::hierarchy::formals(method).is_empty()
        && visible
        && !has_modifier(method, "abstract")
        && !has_modifier(method, "static")
        && method.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "void")
}

fn inapplicable_method(context: &Context, tree: Node) -> bool {
    let Some(method) = ancestor_of(tree, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"]) else { return true };
    let name = called(context, method);
    set_up_or_tear_down(context, method, "setUp")
        || set_up_or_tear_down(context, method, "tearDown")
        || name == "main"
        || name == "suite"
        || has_annotation(context, method, &["org.junit.Before", "org.junit.After"])
}

fn any_catch(tree: Node, test: &mut dyn FnMut(Node) -> bool) -> bool {
    catches(tree).into_iter().filter_map(|clause| clause.child_by_field_name("body")).any(|body| contains(body, test))
}

fn parameter_named(context: &Context, tree: Node, wanted: &str) -> bool {
    catches(tree).into_iter().filter_map(catch_parameter).filter_map(|parameter| parameter.child_by_field_name("name")).any(|name| context.text(name) == wanted)
}

fn return_after(tree: Node) -> bool {
    let mut next = parent(tree).filter(|up| matches!(up.kind(), "block" | "constructor_body")).and_then(|_| tree.next_named_sibling());
    while let Some(at) = next.filter(|at| at.kind().ends_with("comment")) {
        next = at.next_named_sibling();
    }
    next.is_some_and(|next| next.kind() == "return_statement")
}

fn matches_try(context: &Context, tree: Node, block: Node) -> bool {
    if !in_test_class(context, tree) || parameter_named(context, tree, "tolerated") {
        return false;
    }
    let assert_in_catch = any_catch(tree, &mut |node| real_assert(context, node));
    if !parameter_named(context, tree, "expected") && !assert_in_catch {
        return false;
    }
    let inapplicable = catches(tree).into_iter().filter_map(catch_parameter).filter_map(catch_type).any(|kind| {
        let [one] = named_children(kind)[..] else { return false };
        context.resolver.type_node(one).is_some_and(|found| INAPPLICABLE.contains(&found.name().as_str()))
    });
    let in_loop = ancestor_of(tree, &["for_statement", "enhanced_for_statement", "while_statement", "do_statement"]).is_some();
    let while_true = contains(tree, &mut |node| node.kind() == "while_statement" && node.child_by_field_name("condition").is_some_and(|condition| strip(condition).kind() == "true"));
    if contains(tree, &mut |node| throw_or_fail(context, node))
        || inapplicable_method(context, tree)
        || contains(tree, &mut |node| node.kind() == "return_statement")
        || return_after(tree)
        || inapplicable
        || in_loop
        || while_true
        || contains(tree, &mut |node| node.kind() == "continue_statement")
        || named_children(tree).iter().any(|part| part.kind() == "finally_clause")
        || any_catch(tree, &mut |node| log_call(context, node))
    {
        return false;
    }
    let body = super::assert_throws::javac_statements(block);
    if assert_in_catch {
        let field_assignment = any_catch(tree, &mut |node| {
            node.kind() == "assignment_expression"
                && node.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "=")
                && node.child_by_field_name("left").is_some_and(|left| instance_field(context, left))
        });
        let boolean_variable = any_catch(tree, &mut |node| {
            (on_asserts(context, node, "assertTrue") || on_asserts(context, node, "assertFalse"))
                && any_argument(context, node, &|argument| instance_field(context, argument) || matches!(symbol_kind(context, argument), Some(Binding::Local(_))))
        });
        let last_asserts = body.last().is_some_and(|last| {
            contains(last.declarator.unwrap_or(last.node), &mut |node| real_assert(context, node) || static_on_class(context, node, "org.mockito.Mockito", &["verify"]))
        });
        if field_assignment || boolean_variable || last_asserts {
            return false;
        }
    }
    !body.is_empty()
}

/// The scan does not enter nested classes: Error Prone matches their methods on their own.
fn same_method(node: Node, method: Node) -> bool {
    let mut current = parent(node);
    while let Some(at) = current {
        if at.id() == method.id() {
            return true;
        }
        if at.kind() == "class_body" {
            return false;
        }
        current = parent(at);
    }
    false
}

pub fn missing_fail(context: &Context, method: Node) {
    if !matches!(method.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration") {
        return;
    }
    let Some(method_body) = method.child_by_field_name("body") else { return };
    let mut namer = Namer::at(context, method);
    let mut tries = Vec::new();
    walk(method_body, |node| {
        if matches!(node.kind(), "try_statement" | "try_with_resources_statement") && same_method(node, method) {
            tries.push(node);
        }
    });
    for tree in tries {
        let Some(block) = tree.child_by_field_name("body") else { continue };
        if !matches_try(context, tree, block) || context.suppressed("MissingFail", tree) {
            continue;
        }
        let body = super::assert_throws::javac_statements(block);
        let Some(last) = body.last() else { continue };
        let fail = Fix::new().insert(last.end(), "\nfail(\"Expected\");").with_imports();
        let at = if last.declarator.is_some() || last.node.kind() == "class_declaration" { last.position() } else { super::positions::preferred(context, last.node) };
        let matched = last.node;
        let assert_throws = try_fail_to_assert_throws(context, tree, &body, &mut namer).unwrap_or_default();
        context.report_fixed("MissingFail", matched, at, MESSAGE, &[assert_throws, fail]);
    }
}
