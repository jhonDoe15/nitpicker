//! Where a view node sits in the compiler's tree: how deep (the rule walks that tree breadth first, so the first of
//! two findings at one place is the shallower site) and whether a pattern is a destructuring target, which the
//! compiler parses as an object or array literal.
use super::bindings::is_method_value;
use super::tree::Tree;
use crate::typescript::rules::support::view::Node;

/// Whether an object or array pattern is the target of an assignment or a `for` head, not a declaration.
pub fn is_assignment_pattern(pattern: Node) -> bool {
    let mut current = pattern;
    while let Some(parent) = current.parent() {
        match parent.kind() {
            "Property" | "ObjectPattern" | "ArrayPattern" | "RestElement" => current = parent,
            "AssignmentPattern" if parent.node("left") == Some(current) => current = parent,
            "AssignmentExpression" => return parent.node("left") == Some(current),
            "ForInStatement" | "ForOfStatement" => return parent.node("left") == Some(current),
            _ => return false,
        }
    }
    false
}

fn in_pattern(node: Node) -> Option<bool> {
    let parent = node.parent()?;
    matches!(parent.kind(), "ObjectPattern" | "ArrayPattern").then(|| is_assignment_pattern(parent))
}

fn is_parameter_pattern(node: Node) -> bool {
    let Some(parent) = node.parent() else { return false };
    let direct = super::nest::is_parameter(node);
    let defaulted = parent.is("AssignmentPattern") && parent.node("left") == Some(node) && super::nest::is_parameter(parent);
    let rest = parent.is("RestElement") && super::nest::is_parameter(parent);
    direct && !defaulted && !rest
}

fn is_binding_element(node: Node) -> bool {
    node.parent().is_some_and(|parent| parent.is("ArrayPattern") && !is_assignment_pattern(parent))
}

fn holds(parent: Node, key: &str, child: Node) -> bool {
    parent.nodes(key).contains(&child) || parent.node(key) == Some(child)
}

fn computed_key(parent: Node, child: Node) -> bool {
    parent.flag("computed") && parent.node("key") == Some(child)
}

/// How many nodes of the compiler's tree `parent` stands for above `child`.
fn weight(parent: Node, child: Node) -> usize {
    let extra = usize::from(computed_key(parent, child)) + usize::from(parent.is("TemplateLiteral") && holds(parent, "expressions", child)) + usize::from(parent.is("SwitchStatement") && holds(parent, "cases", child)) + usize::from(parent.is("JSXOpeningElement") && holds(parent, "attributes", child)) + usize::from(parent.is("CatchClause") && parent.node("param") == Some(child)) + 2 * usize::from(parent.node("superClass") == Some(child)) + usize::from(parent.has("implements") && holds(parent, "implements", child)) + usize::from(parent.is("TSInterfaceDeclaration") && holds(parent, "extends", child));
    let decorated = child.is("Decorator") && is_parameter_pattern(parent);
    extra + if decorated { 1 } else { own_weight(parent) }
}

fn own_weight(node: Node) -> usize {
    match node.kind() {
        "ChainExpression" | "ClassBody" | "TSInterfaceBody" | "TSEnumBody" | "TSTypeAnnotation" | "TSTypeParameterDeclaration" | "TSTypeParameterInstantiation" => 0,
        "ExportNamedDeclaration" => usize::from(node.node("declaration").is_none()),
        "ExportDefaultDeclaration" => usize::from(!node.node("declaration").is_some_and(|inner| matches!(inner.kind(), "ClassDeclaration" | "FunctionDeclaration" | "TSInterfaceDeclaration" | "TSDeclareFunction"))),
        "VariableDeclaration" => {
            let head = node.parent().is_some_and(|parent| matches!(parent.kind(), "ForStatement" | "ForInStatement" | "ForOfStatement") && parent.node("body") != Some(node));
            if head { 1 } else { 2 }
        }
        "FunctionExpression" | "TSEmptyBodyFunctionExpression" => usize::from(!is_method_value(node)),
        "StaticBlock" => 2,
        "JSXOpeningElement" => usize::from(!node.flag("selfClosing")),
        "ObjectPattern" | "ArrayPattern" if is_parameter_pattern(node) || is_binding_element(node) => 2,
        "AssignmentPattern" | "Identifier" if node.parent().is_some_and(|parent| parent.is("TSParameterProperty")) => 0,
        "AssignmentPattern" => assignment_weight(node),
        "TSModuleDeclaration" => 1 + qualified_segments(node.node("id")),
        _ => 1,
    }
}

fn assignment_weight(node: Node) -> usize {
    let Some(parent) = node.parent() else { return 1 };
    if !parent.is("Property") || parent.node("value") != Some(node) {
        return 1;
    }
    match in_pattern(parent) {
        Some(true) => usize::from(!parent.flag("shorthand")),
        Some(false) => 0,
        None => 1,
    }
}

fn qualified_segments(id: Option<Node>) -> usize {
    let mut count = 0;
    let mut current = id;
    while let Some(node) = current.filter(|node| node.is("TSQualifiedName")) {
        count += 1;
        current = node.node("left");
    }
    count
}

/// The number of the compiler's nodes above this one.
pub fn depth(tree: &Tree, node: Node) -> usize {
    let mut total = 0;
    let mut child = node;
    while let Some(parent) = child.parent() {
        total += tree.slot(Some(child)).map_or(0, |slot| if slot.node == child { slot.level } else { 0 }) + weight(parent, child);
        child = parent;
    }
    total
}
