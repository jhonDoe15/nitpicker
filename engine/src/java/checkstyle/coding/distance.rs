use super::CODING;
use crate::engine::source::{SourceFile, named_children, walk};
use crate::java::checkstyle::report::{Report, grouped};
use crate::java::helpers::{declarators, has_modifier};
use std::collections::HashSet;
use tree_sitter::Node;

const ALLOWED: usize = 3;
const BLOCKS: &[&str] = &["block", "constructor_body", "switch_block_statement_group"];

pub fn check(file: &SourceFile, node: Node, report: &mut Report) {
    if !BLOCKS.contains(&node.kind()) {
        return;
    }
    let statements: Vec<Node> = named_children(node)
        .into_iter()
        .filter(|part| {
            !matches!(
                part.kind(),
                "line_comment" | "block_comment" | "switch_label"
            )
        })
        .collect();
    let mut used: Vec<Option<HashSet<&str>>> = vec![None; statements.len()];
    for (at, statement) in statements.iter().enumerate() {
        if statement.kind() != "local_variable_declaration" || has_modifier(*statement, "final") {
            continue;
        }
        for name in declarators(*statement)
            .into_iter()
            .filter_map(|d| d.child_by_field_name("name"))
        {
            let name = file.text_of(name);
            if let Some(distance) = distance(file, &statements, &mut used, at, name) {
                let message = format!(
                    "Distance between variable '{name}' declaration and its first usage is {}, but allowed \
                     {ALLOWED}.  Consider making that variable final if you still need to store its value in advance \
                     (before method calls that might have side effects on the original value).",
                    grouped(distance)
                );
                report.node(
                    declaration_start(*statement),
                    &format!("{CODING}VariableDeclarationUsageDistanceCheck"),
                    message,
                );
            }
        }
    }
}

fn distance<'f>(
    file: &'f SourceFile,
    statements: &[Node],
    used: &mut [Option<HashSet<&'f str>>],
    declared: usize,
    name: &str,
) -> Option<usize> {
    let mut distance = 0;
    let mut sequence: Option<Option<String>> = None;
    for at in declared + 1..statements.len() {
        let statement = statements[at];
        let names = used[at].get_or_insert_with(|| identifiers(file, statement));
        if names.contains(name) {
            if matches!(statement.kind(), "block" | "synchronized_statement") {
                return None;
            }
            let initializing = match &sequence {
                Some(Some(object)) => {
                    statement.kind() == "local_variable_declaration"
                        || receiver(file, statement).as_ref() == Some(object)
                }
                _ => false,
            };
            distance += 1;
            return (distance > ALLOWED && !initializing).then_some(distance);
        }
        if !matches!(statement.kind(), "local_variable_declaration" | ";") {
            distance += 1;
            let object = receiver(file, statement);
            sequence = match sequence {
                None => Some(object),
                Some(Some(known)) if object.as_ref() == Some(&known) => Some(Some(known)),
                _ => Some(None),
            };
        }
    }
    None
}

fn identifiers<'f>(file: &'f SourceFile, statement: Node) -> HashSet<&'f str> {
    let mut names = HashSet::new();
    walk(statement, |node| {
        if matches!(node.kind(), "identifier" | "type_identifier") {
            names.insert(file.text_of(node));
        }
    });
    names
}

pub fn declaration_start(declaration: Node) -> Node {
    if declaration
        .named_child(0)
        .is_some_and(|first| first.kind() == "modifiers")
    {
        return declaration;
    }
    let mut kind = declaration.child_by_field_name("type");
    while let Some(part) = kind {
        match part.kind() {
            "array_type" => kind = part.child_by_field_name("element"),
            "generic_type" => kind = part.named_child(0),
            "scoped_type_identifier" => {
                let mut cursor = part.walk();
                let dot = part
                    .children(&mut cursor)
                    .filter(|child| child.kind() == ".")
                    .last();
                return dot.unwrap_or(declaration);
            }
            _ => break,
        }
    }
    declaration
}

fn receiver(file: &SourceFile, statement: Node) -> Option<String> {
    let call = statement
        .named_child(0)
        .filter(|_| statement.kind() == "expression_statement")?;
    if call.kind() != "method_invocation" {
        return None;
    }
    call.child_by_field_name("object")
        .map(|object| instance(file, object))
}

fn instance(file: &SourceFile, node: Node) -> String {
    let plain = |node: Node| {
        file.text_of(node)
            .chars()
            .filter(|c| !c.is_whitespace())
            .collect::<String>()
    };
    match node.kind() {
        "method_invocation" | "parenthesized_expression" | "cast_expression" => String::new(),
        "field_access" => match node
            .child_by_field_name("object")
            .map(|object| instance(file, object))
        {
            Some(object) if !object.is_empty() => {
                format!(
                    "{object}.{}",
                    node.child_by_field_name("field")
                        .map(plain)
                        .unwrap_or_default()
                )
            }
            _ => String::new(),
        },
        "array_access" => format!(
            "[]{}",
            node.child_by_field_name("array")
                .map(|array| instance(file, array))
                .unwrap_or_default()
        ),
        "object_creation_expression" => {
            format!(
                "new {}",
                node.child_by_field_name("type")
                    .map(plain)
                    .unwrap_or_default()
            )
        }
        _ => plain(node),
    }
}
