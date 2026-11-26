use super::NAMING;
use super::names::{pattern_variable, record_components};
use crate::engine::source::{SourceFile, children};
use crate::java::checkstyle::report::Report;
use crate::java::helpers::{
    annotation_names, declarators, has_modifier, in_interface_or_annotation,
};
use tree_sitter::Node;

const TYPES: &[&str] = &[
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "annotation_type_declaration",
    "record_declaration",
];

pub fn check(file: &SourceFile, node: Node, report: &mut Report) {
    let mut names = Vec::new();
    match node.kind() {
        kind if TYPES.contains(&kind) => {
            names.extend(node.child_by_field_name("name"));
            if kind == "record_declaration" {
                names.extend(record_components(node));
            }
        }
        "annotation_type_element_declaration" => names.extend(node.child_by_field_name("name")),
        "method_declaration" => {
            if !annotation_names(file, node)
                .iter()
                .any(|name| matches!(*name, "Override" | "java.lang.Override"))
            {
                names.extend(node.child_by_field_name("name"));
            }
        }
        "formal_parameter" | "catch_formal_parameter" => {
            if node
                .parent()
                .and_then(|list| list.parent())
                .is_none_or(|owner| owner.kind() != "record_declaration")
            {
                names.extend(node.child_by_field_name("name"));
            }
        }
        "spread_parameter" => {
            if node
                .parent()
                .and_then(|list| list.parent())
                .is_none_or(|owner| owner.kind() != "record_declaration")
            {
                names.extend(
                    declarators(node)
                        .into_iter()
                        .filter_map(|d| d.child_by_field_name("name")),
                );
            }
        }
        "inferred_parameters" => names.extend(
            children(node)
                .into_iter()
                .filter(|part| part.kind() == "identifier"),
        ),
        "field_declaration" => {
            if !in_interface_or_annotation(node) && !has_modifier(node, "static") {
                names.extend(
                    declarators(node)
                        .into_iter()
                        .filter_map(|d| d.child_by_field_name("name")),
                );
            }
        }
        "local_variable_declaration" => {
            names.extend(
                declarators(node)
                    .into_iter()
                    .filter_map(|d| d.child_by_field_name("name")),
            );
        }
        "enhanced_for_statement" => names.extend(node.child_by_field_name("name")),
        _ => names.extend(pattern_variable(node)),
    }
    for name in names {
        let text = file.text_of(name);
        if abbreviated(text) {
            let message = format!(
                "Abbreviation in name '{text}' must contain no more than '1' consecutive capital letters."
            );
            report.node(
                name,
                &format!("{NAMING}AbbreviationAsWordInNameCheck"),
                message,
            );
        }
    }
}

fn abbreviated(name: &str) -> bool {
    let mut run = 0;
    for c in name.chars() {
        run = if c.is_uppercase() { run + 1 } else { 0 };
        if run > 1 {
            return true;
        }
    }
    false
}
