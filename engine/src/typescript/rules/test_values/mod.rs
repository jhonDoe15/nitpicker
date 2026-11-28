//! Test-code rules of the ESLint plugin on the values a test pins and the paths, delays and listings it depends on:
//! `no-weak-assertion`, `no-float-equality-in-tests`, `no-unpinned-assertion`, `no-uninjectable-delay`,
//! `no-listing-order-in-assertions` and `no-shared-temp-path-in-tests`.
pub mod float_equality;
mod listing_calls;
pub mod listing_order;
pub mod temp_paths;
pub mod uninjectable_delay;
pub mod unpinned;
pub mod weak;

use crate::typescript::rules::support::scope::{Reference, Scopes};
use crate::typescript::rules::support::view::Node;
use oxc_semantic::SymbolId;

/// `findVariable(context, node, node.name)`: the variable of that name along the scope chain from the node, types
/// included, as `scope.set` holds them.
pub fn find_variable(scopes: &Scopes, node: Node) -> Option<SymbolId> {
    scopes.variable_by_name(&node.name()?, node.start())
}

/// typescript-eslint reads the target of an assignment or update written as `(x satisfies T)` and does not write it.
fn satisfied(reference: &Reference) -> bool {
    let Some(wrapper) = reference.identifier.parent().filter(|parent| parent.is("TSSatisfiesExpression")) else { return false };
    wrapper.parent().is_some_and(|target| {
        (target.is("AssignmentExpression") && target.node("left") == Some(wrapper)) || target.is("UpdateExpression")
    })
}

/// `reference.isWrite()`.
pub fn is_write(reference: &Reference) -> bool {
    reference.write && !satisfied(reference)
}

/// `reference.isRead()`.
pub fn is_read(reference: &Reference) -> bool {
    reference.read || reference.as_type || satisfied(reference)
}
