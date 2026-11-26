//! AnnotationPosition: declaration annotations go before the modifiers, type annotations after them, and doc
//! comments before both.
use super::Context;
use super::fixes::Fix;
use super::tokens::{Tok, Token, tokens};
use crate::engine::source::{children, parent};
use crate::java::types::model::target;
use tree_sitter::Node;

const CHECK: &str = "AnnotationPosition";
const TYPES: &[&str] = &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];
const VARIABLES: &[&str] = &["enhanced_for_statement", "formal_parameter", "spread_parameter", "catch_formal_parameter", "resource", "local_variable_declaration", "field_declaration", "constant_declaration"];

#[derive(Clone, Copy, PartialEq)]
enum Position {
    Before,
    After,
    Either,
}

/// What the annotations are on: the element kinds of `@Target` that fit it, and whether a type annotation does.
struct Element {
    declared: u16,
    typed: bool,
}

pub fn annotation_position(context: &Context, node: Node) {
    let kind = node.kind();
    if TYPES.contains(&kind) {
        let keyword = children(node).into_iter().find(|part| matches!(part.kind(), "class" | "interface" | "enum" | "record" | "@interface"));
        let end = node.child_by_field_name("body").and_then(first_member).unwrap_or(node.end_byte());
        let name = node.child_by_field_name("name").map(|name| context.text(name));
        let at = keyword.map_or(node.start_byte(), |keyword| keyword.start_byte() + usize::from(keyword.kind() == "@interface"));
        return handle(context, node, node, name, end, at, None);
    }
    match kind {
        "method_declaration" | "annotation_type_element_declaration" => {
            let Some(returned) = node.child_by_field_name("type") else { return };
            let name = node.child_by_field_name("name");
            let typed = context.text(returned) != "void";
            let element = Element { declared: target::bit("METHOD"), typed };
            handle(context, node, node, name.map(|name| context.text(name)), returned.start_byte(), name.map_or(node.start_byte(), |name| name.start_byte()), Some(element));
        }
        "constructor_declaration" | "compact_constructor_declaration" => {
            let parameters: Vec<Node> = if kind == "compact_constructor_declaration" {
                parent(node).and_then(parent).and_then(|record| record.child_by_field_name("parameters")).map(parameters_of).unwrap_or_default()
            } else {
                node.child_by_field_name("parameters").map(parameters_of).unwrap_or_default()
            };
            let body = node.child_by_field_name("body");
            let end = match parameters.first() {
                Some(first) if first.start_byte() >= node.start_byte() => first.start_byte(),
                Some(_) => node.end_byte(),
                None => body.and_then(|body| body.named_children(&mut body.walk()).find(|statement| !statement.kind().ends_with("comment"))).map_or(node.end_byte(), |statement| statement.start_byte()),
            };
            let name = node.child_by_field_name("name").map_or(node.start_byte(), |name| name.start_byte());
            handle(context, node, node, None, end, name, Some(Element { declared: target::bit("CONSTRUCTOR"), typed: true }));
        }
        "instanceof_expression" => pattern(context, node),
        "enum_constant" => {
            let name = node.child_by_field_name("name");
            let end = name.map_or(node.end_byte(), |name| name.start_byte());
            let element = Element { declared: target::bit("FIELD"), typed: true };
            handle(context, node, node, name.map(|name| context.text(name)), end, node.start_byte(), Some(element));
        }
        _ if VARIABLES.contains(&kind) => variable(context, node),
        _ => {}
    }
}

fn parameters_of(list: Node) -> Vec<Node> {
    children(list).into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter" | "receiver_parameter")).collect()
}

fn first_member(body: Node) -> Option<usize> {
    let mut members = children(body).into_iter().filter(|part| part.is_named() && !part.kind().ends_with("comment"));
    let first = members.next()?;
    if first.kind() == "enum_body_declarations" {
        return children(first).into_iter().find(|part| part.is_named() && !part.kind().ends_with("comment")).map(|member| member.start_byte());
    }
    Some(first.start_byte())
}

fn variable(context: &Context, node: Node) {
    let kind = node.kind();
    let owner = parent(node).map(|owner| owner.kind()).unwrap_or_default();
    let declared = match kind {
        "field_declaration" | "constant_declaration" => "FIELD",
        "local_variable_declaration" | "resource" | "enhanced_for_statement" => "LOCAL_VARIABLE",
        "formal_parameter" if owner == "formal_parameters" && parent(node).and_then(parent).is_some_and(|holder| holder.kind() == "record_declaration") => return,
        _ => "PARAMETER",
    };
    let Some(written) = node.child_by_field_name("type").or_else(|| children(node).into_iter().find(|part| part.kind().ends_with("type") || part.kind() == "type_identifier")) else { return };
    let var = context.text(written) == "var";
    let modifiers = crate::java::helpers::modifiers(node);
    let end = if var { modifiers.map_or(node.start_byte(), |held| held.end_byte()) } else { written.start_byte() };
    let element = Element { declared: target::bit(declared), typed: !var };
    let names: Vec<Node> = match kind {
        "field_declaration" | "constant_declaration" | "local_variable_declaration" => {
            crate::java::helpers::declarators(node).into_iter().filter_map(|declarator| declarator.child_by_field_name("name")).collect()
        }
        "spread_parameter" => children(node)
            .into_iter()
            .find(|part| part.kind() == "variable_declarator")
            .and_then(|declarator| declarator.child_by_field_name("name"))
            .into_iter()
            .collect(),
        _ => node.child_by_field_name("name").into_iter().collect(),
    };
    for name in names {
        let element = Element { declared: element.declared, typed: element.typed };
        handle(context, node, name, Some(context.text(name)), end, name.start_byte(), Some(element));
    }
}

/// Error Prone's rule for one declaration. `element` is none for a class, whose annotations all go before.
fn handle(context: &Context, declaration: Node, reported: Node, name: Option<&str>, end: usize, at: usize, element: Option<Element>) {
    let Some(modifiers) = crate::java::helpers::modifiers(declaration) else { return };
    let annotations = annotations_in(modifiers);
    check(context, declaration, reported, name, (declaration.start_byte(), end), &annotations, at, element);
}

fn annotations_in(holder: Node) -> Vec<Node> {
    children(holder).into_iter().filter(|part| matches!(part.kind(), "marker_annotation" | "annotation")).collect()
}

/// A pattern variable: `o instanceof final @A Type name`.
fn pattern(context: &Context, node: Node) {
    let (Some(written), Some(name)) = (node.child_by_field_name("right"), node.child_by_field_name("name")) else { return };
    if written.kind() != "annotated_type" {
        return;
    }
    let annotations = annotations_in(written);
    let Some(inner) = children(written).into_iter().filter(|part| part.is_named() && !annotations.contains(part)).last() else { return };
    let start = children(node).into_iter().find(|part| part.kind() == "final").map_or(written.start_byte(), |keyword| keyword.start_byte());
    let element = Element { declared: target::bit("LOCAL_VARIABLE"), typed: true };
    check(context, node, name, Some(context.text(name)), (start, inner.start_byte()), &annotations, name.start_byte(), Some(element));
}

#[allow(clippy::too_many_arguments)]
fn check(context: &Context, declaration: Node, reported: Node, name: Option<&str>, span: (usize, usize), annotations: &[Node], at: usize, element: Option<Element>) {
    if annotations.is_empty() {
        return;
    }
    let (start, end) = span;
    let found = tokens(&context.file.text, start, end.max(start));
    let dangling = orphaned(&found, name);
    let dangling = dangling.map(|(at, text)| (at, text, context.file.text.as_bytes().get(at + text.len()) == Some(&b'\n')));
    let marked: Vec<&Token> = found.iter().filter(|token| token.kind == Tok::Modifier || (token.kind == Tok::Identifier && matches!(token.text, "sealed" | "non"))).collect();
    let first_modifier = marked.first().map_or(usize::MAX, |token| token.start);
    let last_modifier = marked.last().map_or(0, |token| token.end);
    let placed: Vec<(Node, Position)> = annotations.iter().map(|annotation| (*annotation, position(context, declaration, *annotation, element.as_ref()))).collect();
    let before: Vec<Node> = placed
        .iter()
        .filter(|(annotation, place)| *place == Position::Before || (*place == Position::Either && annotation.start_byte() < first_modifier))
        .map(|(annotation, _)| *annotation)
        .collect();
    let after: Vec<Node> = placed
        .iter()
        .filter(|(annotation, place)| *place == Position::After || (*place == Position::Either && annotation.start_byte() > first_modifier))
        .map(|(annotation, _)| *annotation)
        .collect();
    let last_declared = before.iter().map(Node::start_byte).fold(last_modifier, usize::max);
    let first_typed = after.iter().map(Node::start_byte).fold(first_modifier, usize::min);
    let move_before: Vec<Node> = before.into_iter().filter(|annotation| annotation.start_byte() > first_typed).collect();
    let move_after: Vec<Node> = after.into_iter().filter(|annotation| annotation.start_byte() < last_declared).collect();
    let names = |listed: &[Node]| -> (String, usize) {
        let written: Vec<String> = listed
            .iter()
            .filter_map(|annotation| annotation.child_by_field_name("name"))
            .map(|name| format!("@{}", context.text(name).rsplit('.').next().unwrap_or_default().trim()))
            .collect();
        (written.join(", "), written.len())
    };
    let mut messages = Vec::new();
    if !move_before.is_empty() {
        let (joined, count) = names(&move_before);
        let is = if count > 1 { "are not TYPE_USE annotations" } else { "is not a TYPE_USE annotation" };
        messages.push(format!("{joined} {is}, so should appear before any modifiers and after Javadocs."));
    }
    if !move_after.is_empty() {
        let (joined, count) = names(&move_after);
        let is = if count > 1 { "are TYPE_USE annotations" } else { "is a TYPE_USE annotation" };
        messages.push(format!("{joined} {is}, so should appear after modifiers and directly before the type."));
    }
    if !messages.is_empty() {
        let moved: Vec<Node> = move_before.iter().chain(&move_after).copied().collect();
        let fix = moved.iter().fold(Fix::new(), |fix, annotation| fix.delete(annotation.start_byte(), annotation.end_byte()));
        let (fix, javadoc) = match dangling {
            Some(found) => remove_javadoc(found, fix),
            None => (fix, String::new()),
        };
        let source = |listed: &[Node]| listed.iter().map(|annotation| context.text(*annotation)).collect::<Vec<_>>().join(" ");
        let fix = if last_modifier == 0 {
            fix.insert(start, format!("{javadoc}{} ", source(&moved)))
        } else {
            fix.insert(first_modifier, format!("{javadoc}{} ", source(&move_before))).insert(last_modifier, format!(" {} ", source(&move_after)))
        };
        return context.report_fixed(CHECK, reported, at, &messages.join(" "), &[fix]);
    }
    if let Some(found) = dangling.filter(|_| !documented(context, declaration)) {
        let (fix, javadoc) = remove_javadoc(found, Fix::new());
        context.report_fixed(CHECK, reported, at, "Javadocs should appear before any modifiers or annotations.", &[fix.insert(start, javadoc)]);
    }
}

/// Error Prone's removal of a misplaced doc comment, with the newline after it; the comment's text is what moves.
fn remove_javadoc((at, text, newline): (usize, &str, bool), fix: Fix) -> (Fix, String) {
    (fix.delete(at, at + text.len() + usize::from(newline)), text.to_string())
}

/// Whether a doc comment stands among the tokens before the declaration's name.
fn orphaned<'f>(found: &[Token<'f>], name: Option<&str>) -> Option<(usize, &'f str)> {
    for token in found {
        if let Some(comment) = token.comments.iter().find(|(_, text)| text.starts_with("/**")) {
            return Some(*comment);
        }
        if token.kind == Tok::Identifier && Some(token.text) == name {
            return None;
        }
    }
    None
}

/// Whether javac attaches a doc comment to the declaration: one among the comments before its first token.
fn documented(context: &Context, declaration: Node) -> bool {
    let mut current = declaration.prev_sibling();
    while let Some(at) = current.filter(|at| matches!(at.kind(), "block_comment" | "line_comment")) {
        if context.text(at).starts_with("/**") {
            return true;
        }
        current = at.prev_sibling();
    }
    false
}

fn position(context: &Context, declaration: Node, annotation: Node, element: Option<&Element>) -> Position {
    let Some(element) = element else { return Position::Before };
    let Some(name) = annotation.child_by_field_name("name") else { return Position::Before };
    let Some(full) = context.resolver.class_name(declaration, context.text(name)) else { return Position::Before };
    let Some(info) = context.resolver.index.get(&full) else { return Position::Before };
    let Some(bits) = info.targets else { return Position::Before };
    let declared = bits & element.declared != 0;
    let typed = element.typed && bits & target::bit("TYPE_USE") != 0;
    match (declared, typed) {
        (true, false) => Position::Before,
        (false, true) => Position::After,
        _ => Position::Either,
    }
}
