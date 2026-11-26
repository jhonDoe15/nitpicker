//! Where a type may not be `unknown`: the type of a parameter, a property or an index signature, and not a caught
//! error named `cause` or `error`.
use crate::typescript::rules::support::view::Node;

const CAUGHT_ERROR_NAMES: [&str; 2] = ["cause", "error"];
const PARAMETER_WRAPPERS: [&str; 3] = ["AssignmentPattern", "RestElement", "TSParameterProperty"];
const PARAMETER_OWNERS: [&str; 10] = [
    "FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression", "TSDeclareFunction", "TSEmptyBodyFunctionExpression",
    "TSFunctionType", "TSConstructorType", "TSMethodSignature", "TSCallSignatureDeclaration", "TSConstructSignatureDeclaration",
];

fn is_parameter(pattern: Node) -> bool {
    let mut outer = pattern;
    while let Some(parent) = outer.parent().filter(|parent| PARAMETER_WRAPPERS.contains(&parent.kind())) {
        outer = parent;
    }
    outer.parent().is_some_and(|parent| PARAMETER_OWNERS.contains(&parent.kind()) && parent.nodes("params").contains(&outer))
}

fn is_annotated_member(annotation: Node) -> bool {
    let Some(owner) = annotation.parent() else { return false };
    matches!(owner.kind(), "TSPropertySignature" | "TSIndexSignature") || (owner.node("typeAnnotation") == Some(annotation) && is_parameter(owner))
}

fn member_name(owner: Node) -> Option<String> {
    let named = if owner.is("TSPropertySignature") { owner.node("key")? } else { owner };
    named.name().map(|name| name.into_owned())
}

fn through_parens(node: Node) -> Node {
    let mut top = node;
    while let Some(parent) = top.parent().filter(|parent| parent.is("TSParenthesizedType")) {
        top = parent;
    }
    top
}

pub fn is_caught_error_slot(node: Node, annotation: Node) -> bool {
    through_parens(node).parent() == Some(annotation) && annotation.parent().and_then(member_name).is_some_and(|name| CAUGHT_ERROR_NAMES.contains(&name.as_str()))
}

pub fn is_unknown_member(node: Node) -> bool {
    node.is("TSUnknownKeyword") && !through_parens(node).parent().is_some_and(|parent| parent.is("TSTypeAnnotation") && is_caught_error_slot(node, parent))
}

/// `reportUnknown`'s conditions: the nearest annotated member comes before any type parameter, and the node is
/// not a caught error's slot.
pub fn is_reportable(node: Node) -> bool {
    let chain: Vec<Node> = std::iter::once(node).chain(node.ancestors()).collect();
    let Some(member_at) = chain.iter().position(|current| current.is("TSTypeAnnotation") && is_annotated_member(*current)) else { return false };
    let parameter_at = chain.iter().position(|current| current.is("TSTypeParameter"));
    parameter_at.is_none_or(|at| member_at < at) && !is_caught_error_slot(node, chain[member_at])
}
