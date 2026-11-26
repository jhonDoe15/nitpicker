//! Small helpers the checks of several files share: javac positions of declarations and suppression by other names.
use super::Context;
use crate::engine::source::{children, named_children};
use tree_sitter::Node;

/// Where javac puts a class declaration: its keyword (after the `@` of an annotation type).
pub fn class_keyword(node: Node) -> usize {
    let keyword = children(node).into_iter().find(|part| matches!(part.kind(), "class" | "interface" | "enum" | "record" | "@interface"));
    keyword.map_or(node.start_byte(), |keyword| keyword.start_byte() + usize::from(keyword.kind() == "@interface"))
}

/// Whether the node or a declaration around it suppresses any of the names.
pub fn suppressed_any(context: &Context, names: &[&str], node: Node) -> bool {
    names.iter().any(|name| context.suppressed(name, node))
}

/// The named children that are not comments.
pub fn parts(node: Node) -> Vec<Node> {
    named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}


pub fn is_class(node: Node) -> bool {
    matches!(node.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration")
}

/// Where javac reports a tree: the operator of a binary, the `(` of a call, the `.` of a field access and so on.
pub fn preferred(node: Node) -> usize {
    let token = |kinds: &[&str]| children(node).into_iter().find(|part| !part.is_named() && kinds.contains(&part.kind())).map(|part| part.start_byte());
    let found = match node.kind() {
        "binary_expression" if folded_strings(node) => None,
        "binary_expression" | "assignment_expression" => node.child_by_field_name("operator").map(|operator| operator.start_byte()),
        "method_invocation" => node.child_by_field_name("arguments").map(|list| list.start_byte()),
        "field_access" => token(&["."]),
        "ternary_expression" => token(&["?"]),
        "array_access" => token(&["["]),
        "instanceof_expression" => token(&["instanceof"]),
        "lambda_expression" => token(&["->"]),
        "cast_expression" | "parenthesized_expression" => token(&["("]),
        "update_expression" => token(&["++", "--"]),
        "unary_expression" => node.child_by_field_name("operator").map(|operator| operator.start_byte()),
        "object_creation_expression" => token(&["new"]),
        "array_creation_expression" => token(&["new"]),
        _ => None,
    };
    found.unwrap_or_else(|| node.start_byte())
}

/// The arguments of a call or a creation, without comments.
pub fn arguments(node: Node) -> Vec<Node> {
    node.child_by_field_name("arguments").map(parts).unwrap_or_default()
}

/// The expression inside any parentheses.
pub fn stripped(node: Node) -> Node {
    let mut current = node;
    while current.kind() == "parenthesized_expression" {
        match parts(current).into_iter().next() {
            Some(inner) => current = inner,
            None => break,
        }
    }
    current
}

/// What `SuggestedFixes.qualifyType` writes for a class at a place: its simple name when that is visible, else the
/// shortest qualified name that is.
pub fn qualify_type(context: &Context, at: Node, qualified: &str) -> String {
    let components: Vec<&str> = qualified.split('.').collect();
    let visible = |name: &str| -> Option<String> {
        if context.resolver.is_variable(at, name) {
            return Some(name.to_string());
        }
        context.resolver.class_name(at, name)
    };
    if visible(components[components.len() - 1]).is_some_and(|found| found == qualified) {
        return components[components.len() - 1].to_string();
    }
    for (index, component) in components.iter().enumerate() {
        if !component.chars().next().is_some_and(|first| first.is_uppercase()) {
            continue;
        }
        let name = components[..=index].join(".");
        match visible(component) {
            None => return components[index..].join("."),
            Some(found) if found == name => return components[index..].join("."),
            Some(_) => {}
        }
    }
    qualified.to_string()
}

/// Whether the parser folds the node into one string literal: strings joined by `+`.
pub fn folded_strings(node: Node) -> bool {
    match node.kind() {
        "string_literal" => true,
        "binary_expression" => {
            let plus = node.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "+");
            plus && node.child_by_field_name("left").is_some_and(folded_strings) && node.child_by_field_name("right").is_some_and(folded_strings)
        }
        _ => false,
    }
}

/// The value of a constant string, also when it is a `final` local variable with a constant initializer.
pub fn constant_text(context: &Context, node: Node) -> Option<String> {
    if let Some(value) = context.resolver.constant_string(node) {
        return Some(value);
    }
    let name = context.text(node);
    if node.kind() != "identifier" {
        return None;
    }
    let mut current = node;
    while let Some(holder) = crate::engine::source::parent(current) {
        if matches!(holder.kind(), "block" | "constructor_body" | "switch_block_statement_group") {
            for statement in children(holder) {
                if statement.start_byte() >= node.start_byte() {
                    break;
                }
                if statement.kind() != "local_variable_declaration" || !crate::java::helpers::has_modifier(statement, "final") {
                    continue;
                }
                for declarator in children(statement).into_iter().filter(|part| part.kind() == "variable_declarator") {
                    if declarator.child_by_field_name("name").is_some_and(|found| context.text(found) == name) {
                        return declarator.child_by_field_name("value").and_then(|value| constant_text(context, value));
                    }
                }
            }
        }
        current = holder;
    }
    None
}
