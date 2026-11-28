//! The calls of a unit with their effects, and `publishesAfterCommit`: whether a publish sits in an
//! `afterCommit` hook or every write was committed before it.
use super::no_dual_write::Check;
use crate::typescript::rules::effects::tags::{Effects, has};
use crate::typescript::rules::held_scopes::estree_calls::is_function;
use crate::typescript::rules::held_scopes::scopes::{ScopeKind, Role, body_index, closes, held_scope};
use crate::typescript::rules::support::view::Node;
use std::rc::Rc;

#[derive(Clone)]
pub struct Site<'v> {
    pub call: Node<'v>,
    pub effects: Rc<Effects>,
}

pub fn sites_with<'s, 'v>(sites: &'s [Site<'v>], tag: &str, excluded: &[&str]) -> Vec<Site<'v>> {
    sites.iter().filter(|site| has(&site.effects, tag) && !excluded.iter().any(|other| has(&site.effects, other))).cloned().collect()
}

fn is_callback(node: Node) -> bool {
    node.is("ArrowFunctionExpression") || node.is("FunctionExpression")
}

fn is_in_after_commit_hook(call: Node, unit: Node) -> bool {
    call.ancestors().filter(|ancestor| is_callback(*ancestor) && unit.contains(*ancestor) && *ancestor != unit).any(|function| {
        let Some(parent) = function.parent().filter(|parent| parent.is("CallExpression")) else { return false };
        let callee = parent.node("callee").filter(|callee| callee.is("MemberExpression"));
        parent.nodes("arguments").contains(&function) && callee.and_then(|callee| callee.node("property")).and_then(|property| property.name()).as_deref() == Some("afterCommit")
    })
}

impl<'a, 'v> Check<'a, 'v> {
    /// `heldScope('transaction', write.call).closing`.
    fn closing(&mut self, write: Node<'v>) -> Option<Node<'v>> {
        let mut types = self.types.borrow_mut();
        let scope = held_scope(Some(&mut types), &mut self.held, ScopeKind::Transaction, write, self.program)?;
        let callback = scope.opener.nodes("arguments").into_iter().any(|argument| is_function(argument) && argument.node("body") == Some(scope.root));
        if callback {
            return scope.opener.parent().filter(|parent| parent.is("AwaitExpression")).map(|_| scope.opener);
        }
        let index = body_index(Some(&mut types), &mut self.held, ScopeKind::Transaction, scope.root);
        index.markers.iter().find(|marker| marker.role == Role::Ends && marker.call.start() >= scope.opener.end() && closes(marker, scope.opener)).map(|marker| marker.call)
    }

    fn is_committed_before(&mut self, write: &Site<'v>, publish: &Site<'v>) -> bool {
        self.closing(write.call).is_some_and(|closing| closing.end() <= publish.call.start())
    }

    pub fn publishes_after_commit(&mut self, publish: &Site<'v>, writes: &[Site<'v>], unit: Node<'v>) -> bool {
        if is_in_after_commit_hook(publish.call, unit) {
            return true;
        }
        for write in writes {
            if !self.is_committed_before(write, publish) {
                return false;
            }
        }
        true
    }
}
