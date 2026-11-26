//! The syntax questions of `no-falsy-default`: the operands of a `||` chain, member reads, the literal a
//! default falls back to, and whether the expression is a condition.
use crate::typescript::rules::signatures::unwrap;
use crate::typescript::rules::support::view::{Node, Value};

const NULLISH_WRAPPERS: &[&str] = &["ChainExpression", "TSNonNullExpression", "TSAsExpression"];
const TEST_PARENTS: &[&str] = &["IfStatement", "WhileStatement", "DoWhileStatement", "ForStatement", "ConditionalExpression"];
const TRANSPARENT: &[&str] = &["LogicalExpression", "TSNonNullExpression"];

pub const STRING_CLASS: &str = "string";
pub const NUMBER_CLASS: &str = "number";
pub const BIGINT_CLASS: &str = "bigint";
pub const BOOLEAN_CLASS: &str = "boolean";

/// `unwrapped`: the expression under optional chains, non-null and `as` assertions.
pub fn unwrapped(node: Node) -> Node {
    unwrap(node, NULLISH_WRAPPERS)
}

pub fn is_logical(node: Node, operator: &str) -> bool {
    node.is("LogicalExpression") && node.text("operator").as_deref() == Some(operator)
}

/// `orderedOperandsOf(root, '||')`.
pub fn or_operands(root: Node) -> Vec<Node> {
    let mut pending = vec![root];
    let mut operands = Vec::new();
    let mut index = 0;
    while index < pending.len() {
        let node = pending[index];
        index += 1;
        let join = (node.is("LogicalExpression") || node.is("BinaryExpression")) && node.text("operator").as_deref() == Some("||");
        match (join, node.node("left"), node.node("right")) {
            (true, Some(left), Some(right)) => pending.extend([left, right]),
            _ => operands.push(node),
        }
    }
    operands.sort_by_key(Node::start);
    operands
}

/// Whether the chain is not the left operand of an enclosing `||`.
pub fn is_outer_chain(node: Node) -> bool {
    !node.parent().is_some_and(|parent| is_logical(parent, "||") && parent.node("left") == Some(node))
}

pub fn is_computed_member(node: Node) -> bool {
    let target = unwrapped(node);
    target.is("MemberExpression") && target.flag("computed")
}

pub fn is_member_read(node: Node) -> bool {
    unwrapped(node).is("MemberExpression") && !is_computed_member(node)
}

pub fn is_identifier_named(node: Node, name: &str) -> bool {
    node.is("Identifier") && node.name().as_deref() == Some(name)
}

pub fn is_null_literal(node: Node) -> bool {
    node.is("Literal") && node.get("value") == Value::Null && node.text("raw").as_deref() == Some("null")
}

pub fn is_absent_value(node: Node) -> bool {
    is_identifier_named(node, "undefined") || is_null_literal(node)
}

/// `literalClass`: the falsy class a literal default belongs to.
pub fn literal_class(node: Node) -> Option<&'static str> {
    if node.is("Literal") {
        if node.text("bigint").is_some() {
            return (node.text("bigint").as_deref() == Some("0")).then_some(BIGINT_CLASS);
        }
        return match node.get("value") {
            Value::Text(start, end, false) if start == end => Some(STRING_CLASS),
            Value::Number(number) if number == 0.0 => Some(NUMBER_CLASS),
            Value::Bool(false) => Some(BOOLEAN_CLASS),
            _ => None,
        };
    }
    let quasis = node.nodes("quasis");
    let cooked = |quasi: Node| match quasi.get("value") {
        Value::Node(index) => quasi.view.at(index).text("cooked").is_some_and(|text| text.is_empty()),
        _ => false,
    };
    let empty = quasis.len() == 1 && cooked(quasis[0]);
    (node.is("TemplateLiteral") && empty).then_some(STRING_CLASS)
}

fn is_truth_test(parent: Node, child: Node) -> bool {
    if is_logical(parent, "&&") {
        return true;
    }
    if parent.is("UnaryExpression") {
        return parent.text("operator").as_deref() == Some("!");
    }
    if TEST_PARENTS.contains(&parent.kind()) {
        return parent.node("test") == Some(child);
    }
    parent.is("CallExpression") && parent.node("callee").is_some_and(|callee| is_identifier_named(callee, "Boolean"))
}

/// `isCondition`: the expression, through `||` chains and non-null assertions, is tested for truth.
pub fn is_condition(node: Node) -> bool {
    let mut child = node;
    for parent in node.ancestors() {
        if !TRANSPARENT.contains(&parent.kind()) || is_logical(parent, "&&") {
            return is_truth_test(parent, child);
        }
        child = parent;
    }
    false
}
