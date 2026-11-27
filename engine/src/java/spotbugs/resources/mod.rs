//! SpotBugs patterns that follow a resource or a lock from where it is taken to every way out of a method.
mod flow;
mod locks;

use super::Context;
use crate::engine::source::walk;
use tree_sitter::Node;

pub fn resources(context: &Context) {
    if context.wants(locks::PATTERNS) {
        locks::unreleased(context);
    }
}

/// The bodies SpotBugs analyses as methods of their own: those of methods, constructors and lambdas.
fn bodies<'a>(context: &Context<'a>) -> Vec<Node<'a>> {
    let mut found = Vec::new();
    walk(context.file.tree.root_node(), |node| {
        let body = match node.kind() {
            "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => node.child_by_field_name("body"),
            "lambda_expression" => node.child_by_field_name("body"),
            _ => None,
        };
        found.extend(body);
    });
    found
}

/// The simple name of the method a label names, `<init>` for a constructor.
fn method_name(label: &str) -> &str {
    if label.starts_with("new ") {
        return "<init>";
    }
    let head = label.split('(').next().unwrap_or(label);
    head.rsplit('.').next().unwrap_or(head)
}
