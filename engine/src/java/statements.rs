//! Statement and declaration shape checks from google_checks.xml.
use crate::java::fields::Fields;
use super::helpers::{declarators, modifiers, report};
use crate::engine::source::{SourceFile, children, walk};
use crate::engine::{FileRule, finding::Finding};
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

fn keyword<'t>(node: Node<'t>, word: &str) -> Option<Node<'t>> {
    children(node).into_iter().find(|child| child.kind() == word)
}

fn need_braces(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    let mut flag = |word: &str, body: Option<Node>, else_if: bool| {
        let braced = body.is_some_and(|b| b.kind() == "block" || (else_if && b.kind() == "if_statement"));
        if !braced {
            if let Some(at) = keyword(node, word) {
                report(out, file, at, "NeedBraces", format!("'{word}' construct must use '{{}}'s."));
            }
        }
    };
    match node.kind() {
        "if_statement" => {
            flag("if", node.field("consequence"), false);
            if keyword(node, "else").is_some() {
                flag("else", node.field("alternative"), true);
            }
        }
        "for_statement" | "enhanced_for_statement" => flag("for", node.field("body"), false),
        "while_statement" => flag("while", node.field("body"), false),
        "do_statement" => flag("do", node.field("body"), false),
        _ => {}
    }
}

const STATEMENT_PARENTS: &[&str] = &[
    "block", "constructor_body", "switch_block_statement_group", "if_statement", "while_statement",
    "for_statement", "enhanced_for_statement", "do_statement", "labeled_statement",
];

fn missing_switch_default(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    if node.kind() != "switch_expression" || !node.parent().is_some_and(|p| STATEMENT_PARENTS.contains(&p.kind())) {
        return;
    }
    let mut has_default = false;
    let mut special = false;
    walk(node, |inner| {
        if inner.kind() != "switch_label" {
            return;
        }
        let mut owner = inner.parent();
        while let Some(candidate) = owner {
            if candidate.kind() == "switch_expression" {
                break;
            }
            owner = candidate.parent();
        }
        if owner != Some(node) {
            return;
        }
        let parts = children(inner);
        has_default = has_default || parts.iter().any(|part| part.kind() == "default");
        special = special
            || parts.iter().any(|part| matches!(part.kind(), "pattern" | "type_pattern" | "record_pattern" | "null_literal"));
    });
    if !has_default && !special {
        report(out, file, node, "MissingSwitchDefault", "switch without \"default\" clause.".to_string());
    }
}

fn upper_ell(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    let integer = matches!(
        node.kind(),
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal"
    );
    if integer && file.text_of(node).ends_with('l') {
        report(out, file, node, "UpperEll", "Should use uppercase 'L'.".to_string());
    }
}

fn array_type_style(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    let holder = matches!(node.kind(), "variable_declarator" | "formal_parameter" | "method_declaration" | "resource"
        | "enhanced_for_statement" | "catch_formal_parameter" | "annotation_type_element_declaration");
    if !holder {
        return;
    }
    if let Some(dimensions) = node.field("dimensions") {
        report(out, file, dimensions, "ArrayTypeStyle", "Array brackets at illegal position.".to_string());
    }
}

fn multiple_variable_declarations(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    if !matches!(node.kind(), "field_declaration" | "local_variable_declaration" | "constant_declaration") {
        return;
    }
    let in_for = node.parent().is_some_and(|p| p.kind() == "for_statement");
    let count = declarators(node).len();
    if count > 1 && !in_for {
        let message = "Each variable declaration must be in its own statement.".to_string();
        report(out, file, node, "MultipleVariableDeclarations", message);
    }
    if let Some(next) = node.next_sibling() {
        if next.kind() == node.kind() && !in_for && next.start_position().row == node.end_position().row {
            let message = "Only one variable definition per line allowed.".to_string();
            report(out, file, node, "MultipleVariableDeclarations", message);
        }
    }
}

fn avoid_star_import(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    if node.kind() == "import_declaration" && keyword(node, "asterisk").is_some() {
        let name = children(node)
            .into_iter()
            .find(|child| matches!(child.kind(), "scoped_identifier" | "identifier"))
            .map(|child| file.text_of(child))
            .unwrap_or_default();
        let message = format!("Using the '.*' form of import should be avoided - {name}.*.");
        let dot = children(node).into_iter().rev().find(|child| child.kind() == ".").unwrap_or(node);
        report(out, file, dot, "AvoidStarImport", message);
    }
}

const TOP_LEVEL: &[&str] = &[
    "class_declaration", "interface_declaration", "enum_declaration", "record_declaration",
    "annotation_type_declaration",
];

fn one_top_level_class(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    if node.kind() != "program" {
        return;
    }
    let types: Vec<Node> = children(node).into_iter().filter(|child| TOP_LEVEL.contains(&child.kind())).collect();
    let public = |declaration: &Node| super::helpers::has_modifier(*declaration, "public");
    let any_public = types.iter().any(public);
    let mut rest: Vec<&Node> = types.iter().filter(|declaration| !public(declaration)).collect();
    if !any_public && !rest.is_empty() {
        rest.remove(0);
    }
    for declaration in rest {
        let name = declaration.field("name").map(|n| file.text_of(n)).unwrap_or_default();
        let message = format!("Top-level class {name} has to reside in its own source file.");
        report(out, file, *declaration, "OneTopLevelClass", message);
    }
}

fn no_finalizer(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    if node.kind() != "method_declaration" {
        return;
    }
    let named = node.field("name").is_some_and(|n| file.text_of(n) == "finalize");
    let empty = node.field("parameters").is_some_and(|p| p.named_child_count() == 0);
    if named && empty {
        report(out, file, node, "NoFinalizer", "Avoid using finalizer method.".to_string());
    }
}

const JLS_ORDER: &[&str] = &[
    "public", "protected", "private", "abstract", "default", "static", "sealed", "non-sealed", "final",
    "transient", "volatile", "synchronized", "native", "strictfp",
];

fn annotation_on_type(list: Node) -> bool {
    let Some(owner) = list.parent() else { return false };
    match owner.kind() {
        "field_declaration" | "local_variable_declaration" | "constant_declaration" | "formal_parameter"
        | "spread_parameter" | "constructor_declaration" | "resource" | "enhanced_for_statement"
        | "catch_formal_parameter" => true,
        "method_declaration" => owner.field("type").is_some_and(|t| t.kind() != "void_type"),
        _ => false,
    }
}

fn modifier_order(file: &SourceFile, node: Node, out: &mut Vec<Finding>) {
    if node.kind() != "modifiers" {
        return;
    }
    let annotation = |part: &Node| matches!(part.kind(), "marker_annotation" | "annotation");
    let parts: Vec<Node> = children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let mut rest = parts.iter().skip_while(|part| annotation(part)).peekable();
    let mut index = 0;
    while let Some(part) = rest.next() {
        if annotation(part) {
            if !annotation_on_type(node) {
                let name = file.text_of(*part);
                let message = format!("'{name}' annotation modifier does not precede non-annotation modifiers.");
                report(out, file, *part, "ModifierOrder", message);
            }
            return;
        }
        let text = file.text_of(*part);
        while index < JLS_ORDER.len() && JLS_ORDER[index] != text {
            index += 1;
        }
        if index == JLS_ORDER.len() {
            let message = format!("'{text}' modifier out of order with the JLS suggestions.");
            report(out, file, *part, "ModifierOrder", message);
            return;
        }
    }
    let _ = modifiers;
}

pub fn rules() -> Vec<Box<dyn FileRule>> {
    let simple = |id, check| Box::new(Simple { id, check }) as Box<dyn FileRule>;
    vec![
        simple("NeedBraces", need_braces),
        simple("MissingSwitchDefault", missing_switch_default),
        simple("UpperEll", upper_ell),
        simple("ArrayTypeStyle", array_type_style),
        simple("MultipleVariableDeclarations", multiple_variable_declarations),
        simple("AvoidStarImport", avoid_star_import),
        simple("OneTopLevelClass", one_top_level_class),
        simple("NoFinalizer", no_finalizer),
        simple("ModifierOrder", modifier_order),
    ]
}
