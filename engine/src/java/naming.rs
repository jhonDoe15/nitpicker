//! Checkstyle naming checks with the formats of google_checks.xml and nitpicker's edits.
use super::helpers::{declarators, has_modifier, in_interface_or_annotation, report};
use crate::engine::source::{SourceFile, children, walk};
use crate::engine::{FileRule, finding::Finding};
use regex::Regex;
use tree_sitter::Node;

type Names = for<'t> fn(&SourceFile, Node<'t>, &mut Vec<Node<'t>>);

struct NameRule {
    id: &'static str,
    format: Regex,
    names: Names,
    message: fn(&str, &str) -> String,
}

fn pattern_message(name: &str, format: &str) -> String {
    format!("Name '{name}' must match pattern '{format}'.")
}

fn constant_message(name: &str, _format: &str) -> String {
    format!("Constant '{name}' must be UPPER_SNAKE_CASE (a logger may be log or logger).")
}

const CONSTANT_TYPES: &[&str] = &[
    "String", "Integer", "Long", "Short", "Byte", "Double", "Float", "Character", "Boolean", "BigDecimal",
    "BigInteger", "Duration",
];

fn name_of<'t>(node: Node<'t>, out: &mut Vec<Node<'t>>) {
    if let Some(name) = node.child_by_field_name("name") {
        out.push(name);
    }
}

fn constant_names<'t>(file: &SourceFile, node: Node<'t>, out: &mut Vec<Node<'t>>) {
    let field = match node.kind() {
        "constant_declaration" => true,
        "field_declaration" => {
            in_interface_or_annotation(node) || (has_modifier(node, "static") && has_modifier(node, "final"))
        }
        _ => false,
    };
    if !field {
        return;
    }
    let Some(kind) = node.child_by_field_name("type") else { return };
    let checked = match kind.kind() {
        "type_identifier" => CONSTANT_TYPES.contains(&file.text_of(kind)),
        "integral_type" | "floating_point_type" | "boolean_type" => true,
        _ => false,
    };
    if !checked {
        return;
    }
    for declarator in declarators(node) {
        if declarator.child_by_field_name("dimensions").is_some() {
            continue;
        }
        if let Some(name) = declarator.child_by_field_name("name") {
            if !matches!(file.text_of(name), "serialVersionUID" | "serialPersistentFields") {
                out.push(name);
            }
        }
    }
}

fn class_names<'t>(_: &SourceFile, node: Node<'t>, out: &mut Vec<Node<'t>>) {
    if node.kind() == "class_declaration" {
        name_of(node, out);
    }
}

fn other_type_names<'t>(_: &SourceFile, node: Node<'t>, out: &mut Vec<Node<'t>>) {
    if matches!(
        node.kind(),
        "interface_declaration" | "enum_declaration" | "annotation_type_declaration" | "record_declaration"
    ) {
        name_of(node, out);
    }
}

fn method_names<'t>(file: &SourceFile, node: Node<'t>, out: &mut Vec<Node<'t>>) {
    if node.kind() != "method_declaration" {
        return;
    }
    let test = super::helpers::annotation_names(file, node).iter().any(|name| name.contains("Test"));
    let Some(name) = node.child_by_field_name("name") else { return };
    if test && test_method_format().is_match(file.text_of(name)) {
        return;
    }
    out.push(name);
}

fn test_method_format() -> &'static Regex {
    static FORMAT: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    FORMAT.get_or_init(|| Regex::new("^[a-z][a-z0-9][a-zA-Z0-9]*(?:_[a-z][a-z0-9][a-zA-Z0-9]*)*$").expect("format"))
}

fn parameter_names<'t>(_: &SourceFile, node: Node<'t>, out: &mut Vec<Node<'t>>) {
    let owner = node.parent().and_then(|list| list.parent()).map(|n| n.kind());
    if !matches!(owner, Some("method_declaration" | "constructor_declaration" | "compact_constructor_declaration")) {
        return;
    }
    match node.kind() {
        "formal_parameter" => name_of(node, out),
        "spread_parameter" => {
            for declarator in declarators(node) {
                name_of(declarator, out);
            }
        }
        _ => {}
    }
}

fn lambda_parameter_names<'t>(_: &SourceFile, node: Node<'t>, out: &mut Vec<Node<'t>>) {
    if node.kind() != "lambda_expression" {
        return;
    }
    let Some(parameters) = node.child_by_field_name("parameters") else { return };
    match parameters.kind() {
        "identifier" => out.push(parameters),
        "inferred_parameters" => {
            out.extend(children(parameters).into_iter().filter(|child| child.kind() == "identifier"));
        }
        _ => {
            for parameter in children(parameters) {
                match parameter.kind() {
                    "formal_parameter" => name_of(parameter, out),
                    "spread_parameter" => {
                        for declarator in declarators(parameter) {
                            name_of(declarator, out);
                        }
                    }
                    _ => {}
                }
            }
        }
    }
}

fn catch_parameter_names<'t>(_: &SourceFile, node: Node<'t>, out: &mut Vec<Node<'t>>) {
    if node.kind() == "catch_formal_parameter" {
        name_of(node, out);
    }
}

fn local_names<'t>(_: &SourceFile, node: Node<'t>, out: &mut Vec<Node<'t>>) {
    if has_modifier(node, "final") {
        return;
    }
    match node.kind() {
        "local_variable_declaration" => {
            for declarator in declarators(node) {
                name_of(declarator, out);
            }
        }
        "enhanced_for_statement" => name_of(node, out),
        _ => {}
    }
}

fn rule(
    id: &'static str,
    format: &str,
    names: Names,
    message: fn(&str, &str) -> String,
) -> Box<dyn FileRule> {
    Box::new(NameRule { id, format: Regex::new(format).expect("format"), names, message })
}

impl FileRule for NameRule {
    fn id(&self) -> &'static str {
        self.id
    }
    fn check(&self, file: &SourceFile, out: &mut Vec<Finding>) {
        let mut names = Vec::new();
        walk(file.tree.root_node(), |node| (self.names)(file, node, &mut names));
        for name in names {
            let text = file.text_of(name);
            if !self.format.is_match(text) {
                report(out, file, name, self.id, (self.message)(text, self.format.as_str()));
            }
        }
    }
}

pub fn rules() -> Vec<Box<dyn FileRule>> {
    const LOWER: &str = "^[a-z]([a-z0-9][a-zA-Z0-9]*)?$";
    const LOWER_OR_UNNAMED: &str = "^(_|[a-z]([a-z0-9][a-zA-Z0-9]*)?)$";
    vec![
        rule("ConstantName", "^([A-Z][A-Z0-9]*(_[A-Z0-9]+)*|log|logger)$", constant_names, constant_message),
        rule("TypeName", CLASS_FORMAT, class_names, pattern_message),
        rule("TypeName", "^[A-Z][a-zA-Z0-9]*$", other_type_names, pattern_message),
        rule("MethodName", LOWER, method_names, pattern_message),
        rule("ParameterName", LOWER, parameter_names, pattern_message),
        rule("LambdaParameterName", LOWER_OR_UNNAMED, lambda_parameter_names, pattern_message),
        rule("CatchParameterName", LOWER_OR_UNNAMED, catch_parameter_names, pattern_message),
        rule("LocalVariableName", LOWER_OR_UNNAMED, local_names, pattern_message),
    ]
}

const CLASS_FORMAT: &str = "^[A-Z][a-zA-Z0-9]*(?:[0-9](?:_[0-9]+)*)?$";
