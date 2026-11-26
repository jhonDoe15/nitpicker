use super::{Doc, source};
use crate::java::checkstyle::report::Report;
use tree_sitter::Node;

const KINDS: [&str; 4] = [
    "method_declaration",
    "constructor_declaration",
    "compact_constructor_declaration",
    "annotation_type_element_declaration",
];

struct Tag {
    name: &'static str,
    line: usize,
    col: usize,
    arg: String,
}

pub fn check(doc: &Doc, report: &mut Report) {
    let declaration = doc.declaration;
    if !KINDS.contains(&declaration.kind()) || !public(declaration, &doc.file.text) {
        return;
    }
    let rule = source("JavadocMethod");
    let tags = tags(doc);
    let text = &doc.file.text;
    let constructor = declaration.kind().contains("constructor");
    if tags.is_empty()
        && doc.comment.body.contains("{@inheritDoc}")
        && (constructor || has_modifier(declaration, text, "static"))
    {
        let (line, col) = start(declaration, text);
        report.at(
            line,
            Some(col),
            &rule,
            "Invalid use of the '@inheritDoc' tag.".to_string(),
        );
    }
    let element = declaration.kind() == "annotation_type_element_declaration";
    let (mut parameters, mut types) = parameters(declaration, text);
    let void = constructor
        || declaration
            .child_by_field_name("type")
            .is_some_and(|kind| kind.kind() == "void_type");
    let mut returns = 0;
    for tag in &tags {
        match tag.name {
            "param" if element => {
                report.at(tag.line, None, &rule, "Unused Javadoc tag.".to_string())
            }
            "param" => {
                let names = match tag
                    .arg
                    .strip_prefix('<')
                    .and_then(|arg| arg.strip_suffix('>'))
                {
                    Some(inner) => (&mut types, inner),
                    None => (&mut parameters, tag.arg.as_str()),
                };
                match names.0.iter().position(|name| name == names.1) {
                    Some(at) => {
                        names.0.remove(at);
                    }
                    None => {
                        let message = format!("Unused @param tag for '{}'.", tag.arg);
                        report.at(tag.line, Some(tag.col), &rule, message);
                    }
                }
            }
            "return" if void => report.at(tag.line, None, &rule, "Unused Javadoc tag.".to_string()),
            "return" => {
                returns += 1;
                if returns > 1 {
                    report.at(
                        tag.line,
                        Some(tag.col),
                        &rule,
                        "Duplicate @return tag.".to_string(),
                    );
                }
            }
            _ => {}
        }
    }
}

fn public(declaration: Node, text: &str) -> bool {
    if !declared_public(declaration, text) {
        return false;
    }
    let mut node = declaration;
    while let Some(parent) = node.parent() {
        match parent.kind() {
            "class_declaration"
            | "interface_declaration"
            | "enum_declaration"
            | "record_declaration"
            | "annotation_type_declaration" => {
                if !declared_public(parent, text) {
                    return false;
                }
            }
            "object_creation_expression" | "block" | "constructor_body" | "lambda_expression" => {
                return false;
            }
            _ => {}
        }
        node = parent;
    }
    true
}

fn declared_public(declaration: Node, text: &str) -> bool {
    if has_modifier(declaration, text, "public") {
        return true;
    }
    let body = declaration.parent().map_or("", |parent| parent.kind());
    matches!(body, "interface_body" | "annotation_type_body")
        && !has_modifier(declaration, text, "private")
}

fn has_modifier(declaration: Node, text: &str, word: &str) -> bool {
    let mut cursor = declaration.walk();
    let modifiers = declaration
        .children(&mut cursor)
        .find(|child| child.kind() == "modifiers");
    modifiers.is_some_and(|modifiers| {
        let mut cursor = modifiers.walk();
        modifiers
            .children(&mut cursor)
            .any(|child| child.utf8_text(text.as_bytes()) == Ok(word))
    })
}

fn start(node: Node, text: &str) -> (usize, usize) {
    let point = node.start_position();
    let byte = node.start_byte();
    (
        point.row + 1,
        text[byte - point.column..byte].encode_utf16().count(),
    )
}

fn parameters(declaration: Node, text: &str) -> (Vec<String>, Vec<String>) {
    let name = |node: Node| node.utf8_text(text.as_bytes()).unwrap_or("").to_string();
    let mut parameters = Vec::new();
    let list = match declaration.kind() {
        "compact_constructor_declaration" => declaration
            .parent()
            .and_then(|body| body.parent())
            .and_then(|record| record.child_by_field_name("parameters")),
        _ => declaration.child_by_field_name("parameters"),
    };
    if let Some(list) = list {
        let mut cursor = list.walk();
        for parameter in list.named_children(&mut cursor) {
            let declared = match parameter.kind() {
                "formal_parameter" => parameter.child_by_field_name("name"),
                "spread_parameter" => {
                    let mut cursor = parameter.walk();
                    let declarator = parameter
                        .named_children(&mut cursor)
                        .find(|child| child.kind() == "variable_declarator");
                    declarator.and_then(|declarator| declarator.child_by_field_name("name"))
                }
                _ => None,
            };
            parameters.extend(declared.map(name));
        }
    }
    let mut types = Vec::new();
    if let Some(list) = declaration.child_by_field_name("type_parameters") {
        let mut cursor = list.walk();
        for parameter in list
            .named_children(&mut cursor)
            .filter(|child| child.kind() == "type_parameter")
        {
            let mut cursor = parameter.walk();
            let identifier = parameter
                .named_children(&mut cursor)
                .find(|child| child.kind() == "type_identifier");
            types.extend(identifier.map(name));
        }
    }
    (parameters, types)
}

fn tags(doc: &Doc) -> Vec<Tag> {
    let lines: Vec<&str> = doc
        .comment
        .body
        .split('\n')
        .map(|line| line.trim_end_matches('\r'))
        .collect();
    let mut tags = Vec::new();
    for (index, line) in lines.iter().enumerate() {
        let base = if index == 0 { doc.comment.col + 3 } else { 0 };
        let Some((col, rest)) = tag_start(line, index > 0) else {
            continue;
        };
        let length = rest
            .find(|c: char| !c.is_ascii_alphabetic())
            .unwrap_or(rest.len());
        let (word, after) = rest.split_at(length);
        if !after.is_empty() && !after.starts_with(char::is_whitespace) {
            continue;
        }
        let name = match word {
            "param" => "param",
            "throws" => "throws",
            "exception" => "exception",
            "return" => "return",
            "see" => "see",
            _ => continue,
        };
        let arg = after.split_whitespace().next().unwrap_or("").to_string();
        let present = match name {
            "return" | "see" => !arg.is_empty() || continues(&lines[index + 1..]),
            _ => !arg.is_empty(),
        };
        if present {
            tags.push(Tag {
                name,
                line: doc.comment.line + index,
                col: base + col,
                arg,
            });
        }
    }
    tags
}

fn tag_start(line: &str, star: bool) -> Option<(usize, &str)> {
    let mut rest = line.trim_start_matches([' ', '\t', '\u{c}']);
    if star {
        rest = rest
            .strip_prefix('*')
            .unwrap_or(rest)
            .trim_start_matches([' ', '\t', '\u{c}']);
    }
    let rest = rest.strip_prefix('@')?;
    let col = line[..line.len() - rest.len() - 1].encode_utf16().count();
    Some((col, rest))
}

fn continues(lines: &[&str]) -> bool {
    let strip = |line: &&str| {
        let line = line.trim_start();
        line.strip_prefix('*').unwrap_or(line).trim().to_string()
    };
    lines
        .iter()
        .map(strip)
        .find(|line| !line.is_empty())
        .is_some_and(|line| !line.starts_with('@'))
}
