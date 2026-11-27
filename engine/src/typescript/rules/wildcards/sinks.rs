//! `regex-sinks.mts`: whether a value reaches `RegExp(...)` as its whole pattern or as a part of one, directly or
//! through the variable it initializes.
use crate::typescript::rules::security_values::defs;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;

#[derive(Clone, Copy, PartialEq)]
pub enum Flow {
    Whole,
    Built,
}

fn is_regexp_argument(parent: Node, node: Node) -> bool {
    (parent.is("NewExpression") || parent.is("CallExpression"))
        && parent.node("callee").is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("RegExp"))
        && parent.list("arguments").first().copied().flatten() == Some(node)
}

fn is_pass_through(parent: Node) -> bool {
    matches!(parent.kind(), "TemplateLiteral" | "TSAsExpression" | "TSNonNullExpression")
        || (parent.is("BinaryExpression") && parent.text("operator").as_deref() == Some("+"))
}

fn reaches_regexp(node: Node) -> Option<Flow> {
    let mut current = node;
    loop {
        let parent = current.parent()?;
        if is_regexp_argument(parent, current) {
            return Some(if current == node { Flow::Whole } else { Flow::Built });
        }
        if !is_pass_through(parent) {
            return None;
        }
        current = parent;
    }
}

/// `flowsToRegExp`.
pub fn flows_to_regexp(scopes: &Scopes, node: Node) -> Option<Flow> {
    if let Some(direct) = reaches_regexp(node) {
        return Some(direct);
    }
    let holder = node.parent().filter(|holder| holder.is("VariableDeclarator") && holder.node("init") == Some(node))?;
    let declared = holder.node("id").filter(|id| id.is("Identifier"))?;
    let symbol = scopes.variable_by_name(&declared.name()?, declared.start())?;
    if defs(scopes, declared).len() != 1 {
        return None;
    }
    let initializer = |identifier: Node| identifier == declared;
    let flows: Vec<Option<Flow>> =
        scopes.references(symbol).into_iter().filter(|reference| !initializer(reference.identifier)).map(|reference| reaches_regexp(reference.identifier)).collect();
    if flows.contains(&Some(Flow::Whole)) { Some(Flow::Whole) } else { flows.into_iter().flatten().next() }
}
