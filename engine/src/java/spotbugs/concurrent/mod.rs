//! Detectors about calls and methods that threads share: AtomicityProblem
//! (AT_OPERATION_SEQUENCE_ON_CONCURRENT_ABSTRACTION) and FindUnsyncGet (UG_SYNC_SET_UNSYNC_GET).
mod getters;
mod sequences;

use super::Context;
use super::statements::{member_label, own_nodes};
use crate::engine::source::children;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

pub fn concurrent<'a>(context: &Context<'a>, class: Node<'a>) {
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let Some(body) = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body")) else { return };
    let members = super::place::members(body);
    if context.wants(&[getters::PATTERN]) {
        getters::check(context, &own, class, &members);
    }
    if !context.wants(&[sequences::PATTERN]) || !context.text(body).contains("put") {
        return;
    }
    for member in members.iter().filter(|member| !TYPE_DECLARATIONS.contains(&member.kind())) {
        let mut nodes = Vec::new();
        let mut lambdas = Vec::new();
        own_nodes(*member, &mut nodes, &mut lambdas);
        if let Some(label) = member_label(context, &own, class, *member) {
            sequences::check(context, &own, &nodes, &label);
        }
        while let Some(lambda) = lambdas.pop() {
            let mut nodes = Vec::new();
            own_nodes(lambda, &mut nodes, &mut lambdas);
            if let Some(label) = super::names::lambda(context, lambda) {
                sequences::check(context, &own, &nodes, &label);
            }
        }
    }
}
