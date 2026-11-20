//! Checkstyle MagicNumber as nitpicker configures it:
//! ignoreHashCodeMethod, ignoreAnnotation, default ignoreNumbers (-1, 0, 1, 2) and waiver tokens.
use super::helpers::{has_modifier, in_interface_or_annotation, report};
use crate::engine::source::{SourceFile, walk};
use crate::engine::{FileRule, finding::Finding};
use tree_sitter::Node;

pub struct MagicNumber;

const LITERALS: &[&str] = &[
    "decimal_integer_literal",
    "hex_integer_literal",
    "octal_integer_literal",
    "binary_integer_literal",
    "decimal_floating_point_literal",
    "hex_floating_point_literal",
];
const WAIVED_BINARY: &[&str] =
    &["*", "+", "-", "/", "%", ">>", ">>>", "<<", "^", "|", "&", "==", "!=", ">=", ">", "<=", "<"];

fn value(text: &str) -> Option<f64> {
    let cleaned: String = text.chars().filter(|c| *c != '_').collect::<String>().to_lowercase();
    let integer = |digits: &str, radix: u32| {
        let long = digits.ends_with('l');
        let parsed = u64::from_str_radix(digits.trim_end_matches('l'), radix).ok()?;
        Some(if long { parsed as i64 as f64 } else { parsed as u32 as i32 as f64 })
    };
    if let Some(hex) = cleaned.strip_prefix("0x") {
        if hex.contains('p') || hex.contains('.') {
            return None;
        }
        return integer(hex, 16);
    }
    if let Some(binary) = cleaned.strip_prefix("0b") {
        return integer(binary, 2);
    }
    let floating = cleaned.contains('.') || cleaned.contains('e') || cleaned.ends_with('f') || cleaned.ends_with('d');
    if floating {
        return cleaned.trim_end_matches(['f', 'd']).parse().ok();
    }
    if cleaned.len() > 1 && cleaned.starts_with('0') && cleaned.trim_end_matches('l').chars().all(|c| c.is_ascii_digit()) {
        return integer(&cleaned, 8);
    }
    integer(&cleaned, 10)
}

fn unary_sign<'t>(file: &SourceFile, literal: Node<'t>) -> Option<(Node<'t>, &'static str)> {
    let parent = literal.parent()?;
    if parent.kind() != "unary_expression" {
        return None;
    }
    match file.text_of(parent.child_by_field_name("operator")?) {
        "-" => Some((parent, "-")),
        "+" => Some((parent, "+")),
        _ => None,
    }
}

fn ignored(file: &SourceFile, literal: Node) -> bool {
    let Some(mut number) = value(file.text_of(literal)) else { return false };
    if matches!(unary_sign(file, literal), Some((_, "-"))) {
        number = -number;
    }
    [-1.0, 0.0, 1.0, 2.0].contains(&number)
}

fn in_hash_code(file: &SourceFile, literal: Node) -> bool {
    let mut current = literal.parent();
    while let Some(node) = current {
        if node.kind() == "method_declaration" {
            let name = node.child_by_field_name("name").map(|n| file.text_of(n));
            let empty = node.child_by_field_name("parameters").is_some_and(|p| p.named_child_count() == 0);
            return name == Some("hashCode") && empty;
        }
        current = node.parent();
    }
    false
}

fn in_annotation(literal: Node) -> bool {
    let mut current = literal.parent();
    while let Some(node) = current {
        if matches!(node.kind(), "annotation" | "annotation_type_element_declaration") {
            return true;
        }
        current = node.parent();
    }
    false
}

/// Whether stepping from `child` up to `parent` crosses a Checkstyle token outside the waiver list.
fn waived_step(file: &SourceFile, child: Node, parent: Node) -> bool {
    match parent.kind() {
        "parenthesized_expression" | "argument_list" | "array_initializer" | "cast_expression"
        | "ternary_expression" | "variable_declarator" | "enum_constant" => true,
        "object_creation_expression" => child.kind() != "class_body",
        "method_invocation" => parent.child_by_field_name("object") != Some(child),
        "assignment_expression" => parent.child_by_field_name("operator").is_some_and(|op| file.text_of(op) == "="),
        "binary_expression" => {
            parent.child_by_field_name("operator").is_some_and(|op| WAIVED_BINARY.contains(&file.text_of(op)))
        }
        "unary_expression" => {
            parent.child_by_field_name("operator").is_some_and(|op| matches!(file.text_of(op), "-" | "+" | "~"))
        }
        _ => false,
    }
}

enum Holder {
    None,
    Constant,
    Magic,
}

fn holder(file: &SourceFile, literal: Node) -> Holder {
    let mut waived = true;
    let mut child = literal;
    while let Some(parent) = child.parent() {
        match parent.kind() {
            "enum_constant" => return if waived { Holder::Constant } else { Holder::Magic },
            "field_declaration" | "constant_declaration" | "local_variable_declaration" => {
                if child.kind() != "variable_declarator" {
                    return Holder::None;
                }
                let constant = in_interface_or_annotation(parent) || has_modifier(parent, "final");
                return match (constant, waived) {
                    (false, _) => Holder::None,
                    (true, true) => Holder::Constant,
                    (true, false) => Holder::Magic,
                };
            }
            _ => {}
        }
        waived = waived && waived_step(file, child, parent);
        child = parent;
    }
    Holder::None
}

impl FileRule for MagicNumber {
    fn id(&self) -> &'static str {
        "MagicNumber"
    }
    fn check(&self, file: &SourceFile, out: &mut Vec<Finding>) {
        walk(file.tree.root_node(), |node| {
            if !LITERALS.contains(&node.kind()) || in_annotation(node) || ignored(file, node) || in_hash_code(file, node) {
                return;
            }
            if matches!(holder(file, node), Holder::Constant) {
                return;
            }
            let (at, sign) = unary_sign(file, node).unwrap_or((node, ""));
            let message = format!(
                "'{sign}{}' is a magic number. Name it as a private static final constant.",
                file.text_of(node)
            );
            report(out, file, at, self.id(), message);
        });
    }
}
