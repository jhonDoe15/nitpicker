//! `exclusive-branches.mts`: two nodes that cannot both run, in different branches of one `if`, `?:`, `switch` or
//! `try`, or after a branch that returns or throws.
use crate::typescript::rules::support::view::Node;

/// `endsInExit`.
pub fn ends_in_exit(branch: Option<Node>) -> bool {
    let last = match branch {
        Some(block) if block.is("BlockStatement") => block.nodes("body").last().copied(),
        other => other,
    };
    last.is_some_and(|last| last.is("ReturnStatement") || last.is("ThrowStatement"))
}

fn common_ancestor<'v>(left: Node<'v>, right: Node<'v>) -> Option<Node<'v>> {
    let outer: Vec<Node> = left.ancestors().collect();
    right.ancestors().find(|ancestor| outer.contains(ancestor))
}

fn branches_of(node: Node) -> Vec<Option<Node>> {
    match node.kind() {
        "IfStatement" | "ConditionalExpression" => vec![node.node("consequent"), node.node("alternate")],
        "SwitchStatement" => node.nodes("cases").into_iter().map(Some).collect(),
        "TryStatement" => vec![node.node("block"), node.node("handler")],
        _ => Vec::new(),
    }
}

fn exits_before(earlier: Node, later: Node) -> bool {
    earlier.ancestors().any(|node| {
        node.is("IfStatement")
            && node.end() <= later.start()
            && [node.node("consequent"), node.node("alternate")].into_iter().flatten().any(|branch| branch.contains(earlier) && ends_in_exit(Some(branch)))
    })
}

/// `inExclusiveBranches`.
pub fn in_exclusive_branches(left: Node, right: Node) -> bool {
    let (earlier, later) = if left.start() <= right.start() { (left, right) } else { (right, left) };
    if exits_before(earlier, later) {
        return true;
    }
    let Some(ancestor) = common_ancestor(left, right) else { return false };
    let branches: Vec<Node> = branches_of(ancestor).into_iter().flatten().collect();
    let left_branch = branches.iter().find(|branch| branch.contains(left));
    let right_branch = branches.iter().find(|branch| branch.contains(right));
    matches!((left_branch, right_branch), (Some(left), Some(right)) if left != right)
}
