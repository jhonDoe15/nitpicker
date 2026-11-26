//! MissingTestCall: a test helper is set up in a test but never run.
use super::Context;
use super::guice::annotations;
use super::hierarchy::formals;
use super::nodes::name_position;
use crate::engine::source::{ancestor, children, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::{Binding, Receiver};
use tree_sitter::Node;

struct Pairing {
    name: &'static str,
    class: &'static str,
    set_up: &'static [&'static str],
    run: &'static [&'static str],
}

const PAIRINGS: [Pairing; 3] = [
    Pairing { name: "EqualsTester", class: "com.google.common.testing.EqualsTester", set_up: &["addEqualityGroup"], run: &["testEquals"] },
    Pairing {
        name: "BugCheckerRefactoringTestHelper",
        class: "com.google.errorprone.BugCheckerRefactoringTestHelper",
        set_up: &["addInput", "addInputLines", "addInputFile", "addOutput", "addOutputLines", "addOutputFile", "expectUnchanged"],
        run: &["doTest"],
    },
    Pairing {
        name: "CompilationTestHelper",
        class: "com.google.errorprone.CompilationTestHelper",
        set_up: &["addSourceLines", "addSourceFile", "expectNoDiagnostics"],
        run: &["doTest"],
    },
];

fn is_test_case(context: &Context, method: Node) -> bool {
    let junit3 = method.child_by_field_name("name").is_some_and(|name| context.text(name).starts_with("test"))
        && formals(method).is_empty()
        && has_modifier(method, "public")
        && method.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "void");
    junit3 || annotations(context, method).iter().any(|(_, name)| name == "org.junit.Test" || name == "org.junit.experimental.theories.Theory")
}

fn matches_call(context: &Context, node: Node, class: &str, names: &[&str]) -> bool {
    if node.kind() == "method_reference" {
        let parts = children(node);
        let (Some(qualifier), Some(last)) = (parts.first().copied(), parts.last().copied()) else { return false };
        if !names.contains(&context.text(last)) {
            return false;
        }
        let owner = match context.resolver.receiver(qualifier) {
            Some(Receiver::Value(kind)) => kind.erased().name(),
            Some(Receiver::Static(owner)) => owner,
            None => return false,
        };
        return context.resolver.index.is_subtype(&owner, class);
    }
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|name| !names.contains(&context.text(name))) {
        return false;
    }
    let Some(resolved) = context.resolver.resolve_call(node) else { return false };
    let owner = if node.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring.clone() };
    !resolved.method.is_static && context.resolver.index.is_subtype(&owner, class)
}

fn ultimate_receiver<'t>(node: Node<'t>) -> Option<Node<'t>> {
    let mut last = None;
    let mut current = node;
    loop {
        let next = match current.kind() {
            "method_invocation" | "field_access" => current.child_by_field_name("object"),
            "method_reference" => children(current).first().copied(),
            _ => None,
        };
        match next {
            Some(found) => {
                last = Some(found);
                current = found;
            }
            None => return last,
        }
    }
}

fn is_field(context: &Context, node: Option<Node>) -> bool {
    let Some(node) = node.filter(|node| matches!(node.kind(), "identifier" | "this" | "super")) else { return false };
    if node.kind() != "identifier" {
        return true;
    }
    matches!(context.resolver.binding(node, context.text(node)), Some(Binding::Field(..)))
}

pub fn missing_test_call(context: &Context, method: Node) {
    if method.kind() != "method_declaration" || !is_test_case(context, method) {
        return;
    }
    let mut required: Vec<usize> = Vec::new();
    let mut called: Vec<usize> = Vec::new();
    walk(method, |node| {
        if !matches!(node.kind(), "method_invocation" | "method_reference") {
            return;
        }
        for (at, pairing) in PAIRINGS.iter().enumerate() {
            if matches_call(context, node, pairing.class, pairing.set_up) && !is_field(context, ultimate_receiver(node)) && ancestor(node, &["return_statement"]).is_none() {
                required.push(at);
            }
            if matches_call(context, node, pairing.class, pairing.run) {
                called.push(at);
            }
        }
    });
    if let Some(at) = required.into_iter().find(|at| !called.contains(at)) {
        let message = format!("{} requires a terminating method call to have any effect.", PAIRINGS[at].name);
        context.report_fixed("MissingTestCall", method, name_position(method), &message, &[]);
    }
}
