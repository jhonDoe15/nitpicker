//! Small SpotBugs detectors of the long tail, one per module: IDivResultCastToDouble (`casts`), WaitInLoop
//! (`waits`), StartInConstructor (`starts`) and MutableEnum (`enums`).
mod casts;
mod enums;
mod starts;
mod waits;

use super::Context;
use super::idioms::compiled;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &[
    casts::DIVISION,
    casts::CEIL,
    casts::ROUND,
    waits::WAIT,
    waits::AWAIT,
    waits::NOTIFY,
    starts::START,
    enums::SETTER,
    enums::MUTABLE,
];

pub fn tail<'a>(context: &Context<'a>, class: Node<'a>) {
    if !context.wants(PATTERNS) {
        return;
    }
    let declared = TYPE_DECLARATIONS.contains(&class.kind()) || matches!(class.kind(), "object_creation_expression" | "enum_constant");
    let Some(own) = context.resolver.scope.names.get(&class.id()).cloned().filter(|_| declared) else { return };
    let methods = compiled(context, &own, class);
    casts::check(context, &methods);
    waits::check(context, &methods);
    starts::check(context, &own, class, &methods);
    enums::check(context, &own, class);
}

/// The calls and other nodes of a method in the order of the instructions javac writes for them: an expression
/// after the expressions it is made of.
fn in_order<'a>(nodes: &[Node<'a>]) -> Vec<Node<'a>> {
    let mut ordered = nodes.to_vec();
    ordered.sort_by_key(|node| (node.end_byte(), std::cmp::Reverse(node.start_byte())));
    ordered
}
