//! The walks and shapes the handler rules share: ESLint's `inside`, `chainOf` and named members.
use crate::typescript::rules::security_values::defs;
use crate::typescript::rules::support::scope::{Def, DefKind, Scopes};
use crate::typescript::rules::support::view::Node;

const FUNCTIONS: [&str; 3] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];

/// `isFunction`.
pub fn is_function(node: Node) -> bool {
    FUNCTIONS.contains(&node.kind())
}

/// The function around a node, the node itself left out.
pub fn enclosing_function(node: Node) -> Option<Node> {
    node.ancestors().find(|ancestor| is_function(*ancestor))
}

/// Whether `root` or a node below it passes `test`, without going below the nodes `stop` holds back.
pub fn any_below<'v>(root: Node<'v>, stop: impl Fn(Node<'v>) -> bool, test: impl Fn(Node<'v>) -> bool) -> bool {
    let mut pending = vec![root];
    while let Some(node) = pending.pop() {
        if test(node) {
            return true;
        }
        if !stop(node) {
            pending.extend(node.children());
        }
    }
    false
}

/// Whether a node in `inside(root)`, the syntax of `root` outside the functions nested in it, passes `test`.
pub fn any_inside<'v>(root: Node<'v>, test: impl Fn(Node<'v>) -> bool) -> bool {
    any_below(root, |node| node != root && is_function(node), test)
}

/// `chainOf(start, next)`.
pub fn chain_of<'v>(start: Option<Node<'v>>, next: impl Fn(Node<'v>) -> Option<Node<'v>>) -> Vec<Node<'v>> {
    let mut nodes: Vec<Node> = start.into_iter().collect();
    while let Some(following) = nodes.last().and_then(|last| next(*last)) {
        nodes.push(following);
    }
    nodes
}

/// A member written `object.name`: its name.
pub fn named_member(node: Node) -> Option<String> {
    let property = node.node("property").filter(|property| property.is("Identifier"))?;
    (node.is("MemberExpression") && !node.flag("computed")).then(|| property.name().map(|name| name.into_owned())).flatten()
}

pub fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

/// `findVariable(getScope(identifier), identifier)?.defs[0]`.
pub fn first_def<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> Option<Def<'s>> {
    defs(scopes, identifier).into_iter().next()
}
