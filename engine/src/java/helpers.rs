use crate::engine::finding::Finding;
use crate::engine::source::{SourceFile, children};
use tree_sitter::Node;

pub const TYPE_SCOPES: &[&str] = &[
    "class_declaration",
    "interface_declaration",
    "annotation_type_declaration",
    "enum_declaration",
    "record_declaration",
    "object_creation_expression",
];

pub fn modifiers<'t>(declaration: Node<'t>) -> Option<Node<'t>> {
    children(declaration).into_iter().find(|child| child.kind() == "modifiers")
}

pub fn has_modifier(declaration: Node, keyword: &str) -> bool {
    modifiers(declaration).is_some_and(|m| children(m).iter().any(|child| child.kind() == keyword))
}

/// Checkstyle's ScopeUtil.isInInterfaceOrAnnotationBlock: the nearest type scope decides.
pub fn in_interface_or_annotation(node: Node) -> bool {
    let mut current = crate::engine::source::parent(node);
    while let Some(parent) = current {
        if TYPE_SCOPES.contains(&parent.kind()) {
            return matches!(parent.kind(), "interface_declaration" | "annotation_type_declaration");
        }
        current = crate::engine::source::parent(parent);
    }
    false
}

pub fn annotation_names<'f>(file: &'f SourceFile, declaration: Node) -> Vec<&'f str> {
    modifiers(declaration)
        .map(|m| {
            children(m)
                .into_iter()
                .filter(|child| matches!(child.kind(), "marker_annotation" | "annotation"))
                .filter_map(|annotation| annotation.child_by_field_name("name"))
                .map(|name| file.text_of(name))
                .collect()
        })
        .unwrap_or_default()
}

pub fn report(out: &mut Vec<Finding>, file: &SourceFile, at: Node, rule: &str, message: String) {
    out.push(Finding {
        file: file.path.clone(),
        line: file.line(at),
        column: file.column(at),
        rule: rule.to_string(),
        message,
    });
}

pub fn declarators<'t>(declaration: Node<'t>) -> Vec<Node<'t>> {
    children(declaration).into_iter().filter(|child| child.kind() == "variable_declarator").collect()
}
