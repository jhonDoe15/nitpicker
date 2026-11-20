//! A sample of nitpicker's own PMD XPath rules, to test how far syntax plus file-local type lookup goes.
use super::helpers::{annotation_names, declarators, report};
use crate::engine::source::{SourceFile, children, walk};
use crate::engine::{FileRule, finding::Finding};
use regex::Regex;
use std::sync::OnceLock;
use tree_sitter::Node;

struct Simple {
    id: &'static str,
    check: fn(&SourceFile, Node, &mut Vec<Finding>),
}

impl FileRule for Simple {
    fn id(&self) -> &'static str {
        self.id
    }
    fn check(&self, file: &SourceFile, out: &mut Vec<Finding>) {
        walk(file.tree.root_node(), |node| (self.check)(file, node, out));
    }
}

fn simple_name(text: &str) -> &str {
    text.rsplit('.').next().unwrap_or(text)
}

fn annotations<'t>(list: Node<'t>) -> Vec<Node<'t>> {
    children(list).into_iter().filter(|part| matches!(part.kind(), "marker_annotation" | "annotation")).collect()
}

fn annotation_name<'f>(file: &'f SourceFile, annotation: Node) -> &'f str {
    annotation.child_by_field_name("name").map(|name| simple_name(file.text_of(name))).unwrap_or_default()
}

fn generated_on_hand_written(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    let owner = matches!(
        node.kind(),
        "class_declaration" | "record_declaration" | "enum_declaration" | "method_declaration"
            | "constructor_declaration" | "compact_constructor_declaration"
    );
    let Some(list) = owner.then(|| super::helpers::modifiers(node)).flatten() else { return };
    for annotation in annotations(list) {
        if annotation_name(file, annotation).contains("Generated") {
            report(out, file, annotation, "GeneratedOnHandWrittenCode", "Generated marker on hand-written code.".into());
        }
    }
}

fn compatibility_shim(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    if node.kind() != "modifiers" {
        return;
    }
    let overriding = node.parent().is_some_and(|owner| {
        owner.kind() == "method_declaration" && annotation_names(file, owner).iter().any(|n| simple_name(n) == "Override")
    });
    if overriding {
        return;
    }
    for annotation in annotations(node) {
        if annotation_name(file, annotation) == "Deprecated" {
            report(out, file, annotation, "CompatibilityShim", "Deprecated code kept for compatibility.".into());
        }
    }
}

fn unwrap<'t>(mut node: Node<'t>) -> Node<'t> {
    while node.kind() == "parenthesized_expression" {
        match node.named_child(0) {
            Some(inner) => node = inner,
            None => break,
        }
    }
    node
}

fn operator<'f>(file: &'f SourceFile, node: Node) -> &'f str {
    node.child_by_field_name("operator").map(|op| file.text_of(op)).unwrap_or_default()
}

fn logical_parent<'t>(node: Node<'t>) -> Option<Node<'t>> {
    let mut parent = node.parent()?;
    while parent.kind() == "parenthesized_expression" {
        parent = parent.parent()?;
    }
    Some(parent)
}

fn operands<'t>(file: &SourceFile, node: Node<'t>, op: &str, out: &mut Vec<Node<'t>>) {
    for side in ["left", "right"] {
        let Some(child) = node.child_by_field_name(side).map(unwrap) else { continue };
        if child.kind() == "binary_expression" && operator(file, child) == op {
            operands(file, child, op, out);
        } else {
            out.push(child);
        }
    }
}

fn negated_operands(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    if node.kind() != "binary_expression" {
        return;
    }
    let op = operator(file, node);
    if !matches!(op, "&&" | "||") {
        return;
    }
    let nested = logical_parent(node).is_some_and(|p| p.kind() == "binary_expression" && operator(file, p) == op);
    if nested {
        return;
    }
    let mut parts = Vec::new();
    operands(file, node, op, &mut parts);
    if parts.iter().all(|part| part.kind() == "unary_expression" && operator(file, *part) == "!") {
        let mut at = node;
        while let Some(parent) = at.parent().filter(|p| p.kind() == "parenthesized_expression") {
            at = parent;
        }
        report(out, file, at, "NegatedOperands", "Every operand is negated.".into());
    }
}

fn generic_package_name(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    static FORMAT: OnceLock<Regex> = OnceLock::new();
    if node.kind() != "package_declaration" {
        return;
    }
    let format = FORMAT.get_or_init(|| {
        Regex::new(r"(^|\.)(utils?|utilit(y|ies)|helpers?|managers?|commons?|misc|miscellaneous)(\.|$)").expect("format")
    });
    let name = children(node)
        .into_iter()
        .find(|child| matches!(child.kind(), "scoped_identifier" | "identifier"))
        .map(|child| file.text_of(child))
        .unwrap_or_default();
    if format.is_match(name) {
        report(out, file, node, "GenericPackageName", "Generic package name.".into());
    }
}

/// File-local stand-in for type attribution: the declared type of a name, nearest scope first.
fn declared_type<'f>(file: &'f SourceFile, usage: Node, name: &str) -> Option<&'f str> {
    let mut scope = usage.parent();
    while let Some(node) = scope {
        let mut found = None;
        for child in children(node) {
            if child.start_byte() > usage.start_byte() && !matches!(node.kind(), "class_body" | "enum_body_declarations") {
                break;
            }
            match child.kind() {
                "local_variable_declaration" | "field_declaration" => {
                    let named = declarators(child)
                        .iter()
                        .any(|d| d.child_by_field_name("name").is_some_and(|n| file.text_of(n) == name));
                    if named {
                        found = child.child_by_field_name("type").map(|t| file.text_of(t));
                    }
                }
                "formal_parameters" => {
                    for parameter in children(child) {
                        if parameter.child_by_field_name("name").is_some_and(|n| file.text_of(n) == name) {
                            found = parameter.child_by_field_name("type").map(|t| file.text_of(t));
                        }
                    }
                }
                _ => {}
            }
        }
        if node.kind() == "enhanced_for_statement" && node.child_by_field_name("name").is_some_and(|n| file.text_of(n) == name) {
            found = node.child_by_field_name("type").map(|t| file.text_of(t));
        }
        if found.is_some() {
            return found;
        }
        scope = node.parent();
    }
    None
}

const STRING_METHODS: &[&str] = &[
    "toString", "trim", "strip", "toLowerCase", "toUpperCase", "substring", "replace", "replaceAll", "replaceFirst",
    "concat", "format", "valueOf", "join", "name", "getName", "getSimpleName", "getMessage",
];

fn is_string(file: &SourceFile, expression: Node) -> bool {
    let expression = unwrap(expression);
    match expression.kind() {
        "string_literal" => true,
        "identifier" => {
            let declared = declared_type(file, expression, file.text_of(expression));
            matches!(declared, Some("String" | "java.lang.String"))
        }
        "method_invocation" => {
            expression.child_by_field_name("name").is_some_and(|n| STRING_METHODS.contains(&file.text_of(n)))
        }
        "binary_expression" => {
            operator(file, expression) == "+"
                && ["left", "right"].iter().any(|s| expression.child_by_field_name(s).is_some_and(|e| is_string(file, e)))
        }
        _ => false,
    }
}

fn plain_text_regex(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    static SPECIAL: OnceLock<Regex> = OnceLock::new();
    if node.kind() != "method_invocation" {
        return;
    }
    let named = node.child_by_field_name("name").is_some_and(|n| file.text_of(n) == "replaceAll");
    let Some(arguments) = node.child_by_field_name("arguments") else { return };
    let Some(receiver) = node.child_by_field_name("object") else { return };
    if !named || arguments.named_child_count() != 2 || !is_string(file, receiver) {
        return;
    }
    let first = unwrap(arguments.named_child(0).expect("argument"));
    if first.kind() != "string_literal" {
        return;
    }
    let text = file.text_of(first);
    let value = text[1..text.len() - 1].replace("\\\\", "\\");
    let special = SPECIAL.get_or_init(|| Regex::new(r"[\\^$.|?*+()\[\]{}]").expect("format"));
    if !special.is_match(&value) {
        report(out, file, node, "PlainTextRegexLocal", "replaceAll with a plain-text pattern.".into());
    }
}

pub fn rules() -> Vec<Box<dyn FileRule>> {
    let simple = |id, check| Box::new(Simple { id, check }) as Box<dyn FileRule>;
    vec![
        simple("GeneratedOnHandWrittenCode", generated_on_hand_written),
        simple("CompatibilityShim", compatibility_shim),
        simple("NegatedOperands", negated_operands),
        simple("GenericPackageName", generic_package_name),
        simple("PlainTextRegexLocal", plain_text_regex),
    ]
}
