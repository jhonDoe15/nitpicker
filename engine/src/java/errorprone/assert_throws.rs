//! AssertThrowsMultipleStatements: the lambda of `Assert.assertThrows` should hold exactly one statement.
use super::Context;
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::nodes::{class_position, name_position};
use super::positions::{arguments, enclosing_statement};
use tree_sitter::Node;

/// One javac statement: a declaration with several declarators counts once per declarator.
pub(super) struct Statement<'t> {
    pub(super) node: Node<'t>,
    pub(super) declarator: Option<Node<'t>>,
    last_declarator: bool,
}

impl Statement<'_> {
    pub(super) fn end(&self) -> usize {
        match self.declarator {
            Some(declarator) if !self.last_declarator => declarator.next_sibling().map_or(declarator.end_byte(), |comma| comma.end_byte()),
            _ => self.node.end_byte(),
        }
    }

    pub(super) fn position(&self) -> usize {
        match self.declarator {
            Some(declarator) => name_position(declarator),
            None if self.node.kind() == "class_declaration" => class_position(self.node),
            None => self.node.start_byte(),
        }
    }

    fn simple(&self) -> bool {
        matches!(self.node.kind(), "expression_statement" | "local_variable_declaration")
    }
}

/// The children of a block that javac sees as statements: empty statements count, comments and braces do not.
pub(super) fn block_statements<'t>(block: Node<'t>) -> Vec<Node<'t>> {
    crate::engine::source::children(block).into_iter().filter(|part| !matches!(part.kind(), "{" | "}") && !part.kind().ends_with("comment")).collect()
}

pub(super) fn javac_statements<'t>(block: Node<'t>) -> Vec<Statement<'t>> {
    let mut found = Vec::new();
    for node in block_statements(block) {
        if node.kind() == "local_variable_declaration" {
            let declarators: Vec<Node> = crate::engine::source::children(node).into_iter().filter(|part| part.kind() == "variable_declarator").collect();
            let count = declarators.len();
            for (index, declarator) in declarators.into_iter().enumerate() {
                found.push(Statement { node, declarator: Some(declarator), last_declarator: index + 1 == count });
            }
        } else {
            found.push(Statement { node, declarator: None, last_declarator: true });
        }
    }
    found
}

pub fn assert_throws_multiple_statements(context: &Context, call: Node) {
    if !static_on_class(context, call, "org.junit.Assert", &["assertThrows"]) {
        return;
    }
    let Some(lambda) = arguments(call).last().copied().filter(|last| last.kind() == "lambda_expression") else { return };
    let Some(body) = lambda.child_by_field_name("body").filter(|body| body.kind() == "block") else { return };
    let all = javac_statements(body);
    let Some(last) = all.last() else { return };
    if all.len() == 1 {
        if !last.simple() {
            let message = "The lambda passed to assertThrows contains control flow or nested blocks. Extract setup logic outside the lambda.";
            context.report_fixed("AssertThrowsMultipleStatements", last.node, last.position(), message, &[]);
        }
        return;
    }
    let start = all[0].node.start_byte();
    let end = all[all.len() - 2].end();
    let mut fix = Fix::new();
    match last.node.named_child(0).filter(|expression| last.node.kind() == "expression_statement" && !expression.kind().ends_with("comment")) {
        Some(expression) => fix = fix.and(body.start_byte(), body.end_byte(), context.text(expression)),
        None => fix = fix.delete(start, end),
    }
    let Some(enclosing) = enclosing_statement(call, false) else { return };
    fix = fix.insert(enclosing.start_byte(), &context.file.text[start..end]);
    let message = "The lambda passed to assertThrows should contain exactly one statement";
    context.report_fixed("AssertThrowsMultipleStatements", last.node, last.position(), message, &[fix]);
}
