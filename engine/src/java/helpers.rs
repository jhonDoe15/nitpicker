use crate::java::fields::Fields;
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
                .filter_map(|annotation| annotation.field("name"))
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
        symbol: None,
    });
}

pub fn declarators<'t>(declaration: Node<'t>) -> Vec<Node<'t>> {
    children(declaration).into_iter().filter(|child| child.kind() == "variable_declarator").collect()
}

/// Whether a declaration carries an annotation that NullAway reads as "may be null". An annotation that can
/// only sit on a type (JSpecify's, the Checker Framework's) marks the elements when the type is an array.
pub fn marked_nullable(file: &SourceFile, declaration: Node) -> bool {
    let nullable = |name: &str| matches!(name.rsplit('.').next(), Some("Nullable" | "CheckForNull" | "ParametricNullness"));
    let named = |annotation: Node| {
        matches!(annotation.kind(), "marker_annotation" | "annotation") && annotation.child_by_field_name("name").is_some_and(|name| nullable(file.text_of(name)))
    };
    let kind = declaration.child_by_field_name("type");
    // Written on the type itself: before a method's return type, on an array's brackets, inside a qualified name.
    let on_brackets = kind.filter(|kind| kind.kind() == "array_type").and_then(|kind| kind.child_by_field_name("dimensions")).is_some_and(|dimensions| children(dimensions).into_iter().next().is_some_and(named));
    let qualified = kind.map(|kind| if kind.kind() == "generic_type" { kind.child(0).unwrap_or(kind) } else { kind });
    let in_name = qualified.filter(|kind| kind.kind() == "scoped_type_identifier").is_some_and(|kind| children(kind).into_iter().any(named));
    if on_brackets || in_name {
        return true;
    }
    let array = kind.is_some_and(|kind| kind.kind() == "array_type")
        || children(declaration).iter().any(|part| part.kind() == "variable_declarator" && part.child_by_field_name("dimensions").is_some());
    let on_types = file.text.contains("import org.jspecify.annotations.Nullable;") || file.text.contains("import org.checkerframework.checker.nullness.qual.Nullable;");
    let marked = annotation_names(file, declaration).iter().any(|name| nullable(name)) || children(declaration).into_iter().any(named);
    marked && !(array && on_types)
}
