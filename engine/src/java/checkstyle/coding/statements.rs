use super::CODING;
use crate::engine::source::children;
use crate::java::checkstyle::report::Report;
use tree_sitter::Node;

const ENDED: &[&str] = &[
    "expression_statement",
    "local_variable_declaration",
    "field_declaration",
    "constant_declaration",
    "return_statement",
    "break_statement",
    "continue_statement",
    "throw_statement",
    "yield_statement",
    "assert_statement",
    "do_statement",
    "import_declaration",
    "package_declaration",
    "explicit_constructor_invocation",
    "method_declaration",
    "annotation_type_element_declaration",
];

pub fn check(root: Node, report: &mut Report) {
    let mut last = None;
    visit(root, &mut last, report);
}

fn line(node: Node) -> usize {
    node.start_position().row + 1
}

fn counted(node: Node) -> Option<Node> {
    if node.kind() == ";"
        && node
            .parent()
            .is_some_and(|p| matches!(p.kind(), "enum_body" | "enum_body_declarations"))
    {
        return Some(node);
    }
    if !ENDED.contains(&node.kind()) {
        return None;
    }
    let parent = node.parent()?;
    if parent.kind() == "switch_rule"
        || (parent.kind() == "for_statement" && parent.child_by_field_name("init") == Some(node))
    {
        return None;
    }
    let end = children(node)
        .into_iter()
        .last()
        .filter(|last| last.kind() == ";")?;
    Some(end)
}

fn has_lambda(node: Node) -> bool {
    let mut found = false;
    crate::engine::source::walk(node, |part| found |= part.kind() == "lambda_expression");
    found
}

fn visit(node: Node, last: &mut Option<usize>, report: &mut Report) {
    if node.kind() == "lambda_expression" {
        let mut inner = None;
        for child in children(node) {
            visit(child, &mut inner, report);
        }
        return;
    }
    for child in children(node) {
        visit(child, last, report);
    }
    if let Some(end) = counted(node) {
        if *last == Some(line(node)) && !has_lambda(node) {
            let source = format!("{CODING}OneStatementPerLineCheck");
            report.node(
                end,
                &source,
                "Only one statement per line allowed.".to_string(),
            );
        }
        *last = Some(line(end));
    }
}
