//! SpotBugs' DumbMethods, DumbMethodInvocations and URLProblems detectors, one family of patterns per module.
mod boxing;
mod calls;
mod found;
mod numbers;
mod threads;
mod urls;

use super::idioms::{Compiled, compiled};
use super::{Context, place};
use crate::engine::source::children;
use crate::java::types::scope::TYPE_DECLARATIONS;
use found::Findings;
use tree_sitter::Node;

pub const URLS: &[&str] = &[urls::COLLECTION, urls::BLOCKING];

pub fn dumb<'a>(context: &Context<'a>, class: Node<'a>) {
    let values = context.wants(numbers::PATTERNS) || calls::wanted(context);
    if !context.wants(URLS) && !context.wants(boxing::PATTERNS) && !context.wants(threads::PATTERNS) && !values {
        return;
    }
    let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"));
    let Some(body) = body.filter(|_| TYPE_DECLARATIONS.contains(&class.kind()) || matches!(class.kind(), "object_creation_expression" | "enum_constant")) else { return };
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let members = place::members(body);
    let methods = compiled(context, &own, class);
    urls::check(context, &own, class, &members, &methods);
    boxing::check(context, &methods);
    threads::check(context, &own, &methods);
    if values {
        constants(context, &own, &methods);
    }
}

/// The patterns about values and constant arguments, reported once per method and message.
fn constants<'a>(context: &Context<'a>, own: &str, methods: &[Compiled<'a>]) {
    for method in methods {
        let mut found = Findings::default();
        for node in method.nodes.iter().copied() {
            numbers::check(context, node, &method.label, &mut found);
            calls::check(context, own, node, &method.label, &mut found);
        }
        found.report(context, &method.label);
    }
}
