//! Per-file facts for project passes: a token stream for duplicate detection and per-method metrics.
use crate::engine::source::{SourceFile, Token};
use crate::engine::{FileFacts, FunctionMetric};
use std::hash::{Hash, Hasher};
use tree_sitter::Node;

const DECISIONS: &[&str] = &[
    "if_statement", "for_statement", "enhanced_for_statement", "while_statement", "do_statement",
    "catch_clause", "ternary_expression", "switch_label", "switch_rule",
];
const NESTING: &[&str] = &[
    "if_statement", "for_statement", "enhanced_for_statement", "while_statement", "do_statement",
    "try_statement", "switch_expression", "lambda_expression",
];

fn token_kind(file: &SourceFile, node: Node) -> u32 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    node.kind_id().hash(&mut hasher);
    if node.is_named() {
        file.text_of(node).hash(&mut hasher);
    }
    hasher.finish() as u32
}

fn metric(file: &SourceFile, method: Node) -> FunctionMetric {
    let mut cyclomatic = 1u32;
    let mut max_nesting = 0u32;
    let mut cursor = method.walk();
    let mut depth = 0u32;
    let mut stack: Vec<bool> = Vec::new();
    'outer: loop {
        let node = cursor.node();
        let kind = node.kind();
        if DECISIONS.contains(&kind) {
            cyclomatic += 1;
        }
        if kind == "binary_expression" {
            let logical = node.child_by_field_name("operator").is_some_and(|op| matches!(op.kind(), "&&" | "||"));
            cyclomatic += u32::from(logical);
        }
        let nests = NESTING.contains(&kind);
        if nests {
            depth += 1;
            max_nesting = max_nesting.max(depth);
        }
        if cursor.goto_first_child() {
            stack.push(nests);
            continue;
        }
        if nests {
            depth -= 1;
        }
        loop {
            if cursor.goto_next_sibling() {
                break;
            }
            if !cursor.goto_parent() || stack.is_empty() {
                break 'outer;
            }
            if stack.pop() == Some(true) {
                depth -= 1;
            }
            if cursor.node() == method {
                break 'outer;
            }
        }
    }
    FunctionMetric {
        file: file.path.clone(),
        name: method.child_by_field_name("name").map(|n| file.text_of(n).to_string()).unwrap_or_default(),
        line: file.line(method),
        lines: method.end_position().row - method.start_position().row + 1,
        cyclomatic,
        parameters: method.child_by_field_name("parameters").map_or(0, |p| p.named_child_count() as u32),
        max_nesting,
    }
}

pub fn facts(file: &SourceFile) -> FileFacts {
    let mut facts = FileFacts::default();
    let mut cursor = file.tree.root_node().walk();
    let mut skip_imports = false;
    loop {
        let node = cursor.node();
        let kind = node.kind();
        if matches!(kind, "method_declaration" | "constructor_declaration") {
            facts.functions.push(metric(file, node));
        }
        skip_imports = matches!(kind, "import_declaration" | "package_declaration" | "line_comment" | "block_comment");
        let leaf = node.child_count() == 0;
        if leaf && !skip_imports {
            facts.tokens.push(Token { kind: token_kind(file, node), line: node.start_position().row as u32 + 1 });
        }
        if !skip_imports && cursor.goto_first_child() {
            continue;
        }
        loop {
            if cursor.goto_next_sibling() {
                break;
            }
            if !cursor.goto_parent() {
                return facts;
            }
        }
    }
}
