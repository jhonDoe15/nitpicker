//! Where javac puts the position of a tree, and small questions about the nodes around a check's match.
use crate::engine::source::{children, parent};
use tree_sitter::Node;

pub const TYPE_KEYWORDS: &[&str] = &["class", "interface", "enum", "record", "@interface"];

/// The position javac reports for a type declaration: its keyword, after the `@` of an annotation type.
pub fn class_position(declaration: Node) -> usize {
    let keyword = children(declaration).into_iter().find(|part| TYPE_KEYWORDS.contains(&part.kind()));
    keyword.map_or(declaration.start_byte(), |word| word.start_byte() + usize::from(word.kind() == "@interface"))
}

/// The position of a method or variable: its name.
pub fn name_position(declaration: Node) -> usize {
    declaration.child_by_field_name("name").map_or(declaration.start_byte(), |name| name.start_byte())
}

/// The first child of that kind.
pub fn token<'t>(node: Node<'t>, kind: &str) -> Option<Node<'t>> {
    children(node).into_iter().find(|part| part.kind() == kind)
}

/// The position javac gives an expression: an operator for binary and assignment, the `(` of a call, the `.` of a
/// member select, `new` for a creation, the start for anything else.
pub fn position(node: Node) -> usize {
    let at = |found: Option<Node>| found.map_or(node.start_byte(), |part| part.start_byte());
    match node.kind() {
        "binary_expression" | "assignment_expression" => at(node.child_by_field_name("operator")),
        "method_invocation" => at(node.child_by_field_name("arguments")),
        "field_access" => at(token(node, ".")),
        "object_creation_expression" | "array_creation_expression" => at(token(node, "new")),
        "ternary_expression" => at(token(node, "?")),
        "instanceof_expression" => at(token(node, "instanceof")),
        "array_access" => at(token(node, "[")),
        "update_expression" => {
            let operator = children(node).into_iter().find(|part| matches!(part.kind(), "++" | "--"));
            at(operator)
        }
        "unary_expression" => at(children(node).into_iter().next()),
        _ => node.start_byte(),
    }
}

/// The node without the parentheses around it.
pub fn unparenthesized(mut node: Node) -> Node {
    while node.kind() == "parenthesized_expression" {
        match node.named_child(0) {
            Some(inner) => node = inner,
            None => break,
        }
    }
    node
}

/// The nearest enclosing node of those kinds, stopping at a class so a method of an outer class is not found.
pub fn enclosing<'t>(node: Node<'t>, kinds: &[&str]) -> Option<Node<'t>> {
    let mut current = parent(node);
    while let Some(above) = current {
        if kinds.contains(&above.kind()) {
            return Some(above);
        }
        current = parent(above);
    }
    None
}

/// The statements of a block, comments left out.
pub fn statements<'t>(block: Node<'t>) -> Vec<Node<'t>> {
    children(block).into_iter().filter(|part| part.is_named() && !part.kind().ends_with("comment")).collect()
}

/// Whether the node is an anonymous class body or a class declaration of kind class.
pub fn is_plain_class(node: Node) -> bool {
    node.kind() == "class_declaration" || (node.kind() == "object_creation_expression" && token(node, "class_body").is_some())
}

/// Whether an identifier node is a name read or written as an expression: not a declaration, a field or method name after
/// a dot, a label or a part of a qualified name.
pub fn is_variable_use(node: Node) -> bool {
    let Some(holder) = parent(node) else { return false };
    let named = holder.child_by_field_name("name").is_some_and(|written| written.id() == node.id());
    match holder.kind() {
        "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "enhanced_for_statement" | "resource" | "spread_parameter" | "labeled_statement" | "break_statement" | "continue_statement" => false,
        "field_access" => holder.child_by_field_name("field").is_none_or(|field| field.id() != node.id()),
        "method_invocation" => !named || holder.child_by_field_name("object").is_none(),
        "method_reference" | "scoped_identifier" | "inferred_parameters" | "annotation" | "marker_annotation" | "element_value_pair" | "type_pattern" | "record_pattern_component" => false,
        "instanceof_expression" => !named,
        "lambda_expression" => holder.child_by_field_name("parameters").is_none_or(|list| list.id() != node.id()),
        _ => true,
    }
}
