//! Checks on the text and shape of a file or a statement that need little more than the tree.
use super::fixes::Fix;
use super::shape::{class_keyword, parts, suppressed_any};
use super::values::value_name;
use super::Context;
use crate::engine::source::{children, parent, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

const UNICODE: &str = "Using unicode escape sequences for printable ASCII characters is obfuscated, and potentially dangerous.";

fn banned(character: u32) -> bool {
    (0x20..=0x7E).contains(&character) || character == 0xA || character == 0xD
}

/// Error Prone's scan of the file for `\uXXXX` escapes of printable ASCII.
pub fn unicode_escape(context: &Context, _root: Node) {
    let bytes = context.file.text.as_bytes();
    let length = bytes.len();
    if length == 0 {
        return;
    }
    let (mut at, mut current, mut is_unicode, mut last) = (0usize, u32::from(bytes[0]), false, 0usize);
    let next = |at: &mut usize, current: &mut u32| {
        *at += 1;
        if *at < length {
            *current = u32::from(bytes[*at]);
        }
    };
    while at < length {
        if is_unicode && banned(current) {
            let peek = if at + 1 < length { bytes[at + 1] } else { 0 };
            if !(current == u32::from(b'\\') && peek == b'u') && !escape_suppressed(context, at) {
                let fix = Fix::replace(last, at + 1, char::from_u32(current).unwrap_or(' ').to_string());
                context.report_always_fixed("UnicodeEscape", at, UNICODE, &[fix]);
            }
        }
        if current == u32::from(b'\\') {
            last = at;
            next(&mut at, &mut current);
            if current == u32::from(b'u') && !is_unicode {
                while current == u32::from(b'u') {
                    next(&mut at, &mut current);
                }
                let digits = context.file.text.get(at..(at + 4).min(length)).unwrap_or_default();
                current = u32::from_str_radix(digits, 16).unwrap_or(0xFFFF);
                at += 3;
                is_unicode = true;
                continue;
            }
        }
        next(&mut at, &mut current);
        is_unicode = false;
    }
}

fn escape_suppressed(context: &Context, at: usize) -> bool {
    let root = context.file.tree.root_node();
    root.descendant_for_byte_range(at, at).is_some_and(|node| context.suppressed("UnicodeEscape", node))
}

pub fn multiple_top_level_classes(context: &Context, root: Node) {
    let declarations: Vec<Node> = children(root).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let classes: Vec<Node> = declarations.iter().copied().filter(|part| super::shape::is_class(*part)).collect();
    if classes.len() <= 1 || classes.iter().any(|class| suppressed_any(context, &["TopLevel", "MultipleTopLevelClasses"], *class)) {
        return;
    }
    let names: Vec<&str> = classes.iter().filter_map(|class| class.child_by_field_name("name")).map(|name| context.text(name)).collect();
    let message = format!("Expected at most one top-level class declaration, instead found: {}", names.join(", "));
    for declaration in declarations.iter().filter(|part| part.kind() != "package_declaration" && part.kind() != "import_declaration") {
        let at = if super::shape::is_class(*declaration) { class_keyword(*declaration) } else { declaration.start_byte() };
        context.report_always("MultipleTopLevelClasses", at, &message);
    }
}

pub fn negative_boolean(context: &Context, node: Node) {
    let Some(name) = node.child_by_field_name("name").filter(|_| node.kind() == "variable_declarator") else { return };
    let text = context.text(name);
    let rest = text.strip_prefix("not").or_else(|| text.strip_prefix("no"));
    if !rest.is_some_and(|rest| rest.chars().next().is_some_and(|first| first.is_ascii_uppercase())) {
        return;
    }
    let Some(declaration) = parent(node) else { return };
    if declaration.kind() != "local_variable_declaration" {
        return;
    }
    let boolean = match declaration.child_by_field_name("type") {
        Some(kind) if context.text(kind) == "var" => node.child_by_field_name("value").is_some_and(|value| matches!(context.resolver.type_of(value), Some(Type::Primitive("boolean")))),
        Some(kind) => kind.kind() == "boolean_type" && node.child_by_field_name("dimensions").is_none(),
        None => false,
    };
    if boolean {
        context.report_fixed("NegativeBoolean", node, name.start_byte(), "Prefer positive boolean names", &[]);
    }
}

pub fn negative_boolean_for_each(context: &Context, node: Node) {
    if node.kind() != "enhanced_for_statement" {
        return;
    }
    let Some(name) = node.child_by_field_name("name") else { return };
    let text = context.text(name);
    let rest = text.strip_prefix("not").or_else(|| text.strip_prefix("no"));
    if rest.is_some_and(|rest| rest.chars().next().is_some_and(|first| first.is_ascii_uppercase()))
        && node.child_by_field_name("type").is_some_and(|kind| kind.kind() == "boolean_type")
        && node.child_by_field_name("dimensions").is_none()
    {
        context.report_fixed("NegativeBoolean", node, name.start_byte(), "Prefer positive boolean names", &[]);
    }
}

fn short_circuit_operator<'t>(context: &Context, node: Node<'t>) -> Option<Node<'t>> {
    if node.kind() != "binary_expression" {
        return None;
    }
    node.child_by_field_name("operator").filter(|operator| matches!(context.text(*operator), "&" | "|"))
}

pub fn short_circuit_boolean(context: &Context, node: Node) {
    let Some(operator) = short_circuit_operator(context, node) else { return };
    if parent(node).is_some_and(|holder| short_circuit_operator(context, holder).is_some()) {
        return;
    }
    let boolean = |side: &str| {
        let operand = node.child_by_field_name(side)?;
        let kind = context.resolver.type_of(operand)?.unboxed_or_same();
        Some(kind == Type::Primitive("boolean"))
    };
    if boolean("left") != Some(true) || boolean("right") != Some(true) {
        return;
    }
    let mut fix = Fix::new();
    walk(node, |inner| {
        if let (Some(operator), Some(left), Some(right)) = (short_circuit_operator(context, inner), inner.child_by_field_name("left"), inner.child_by_field_name("right")) {
            fix = std::mem::take(&mut fix).and(left.end_byte(), right.start_byte(), if context.text(operator) == "&" { " && " } else { " || " });
        }
    });
    context.report_fixed("ShortCircuitBoolean", node, operator.start_byte(), "Prefer the short-circuiting boolean operators && and || to & and |.", &[fix]);
}

const CONTINUE: &str = "This continue statement is redundant and can be removed. It may be misleading.";

pub fn redundant_control_flow(context: &Context, node: Node) {
    if node.kind() != "continue_statement" || parts(node).iter().any(|part| part.kind() == "identifier") {
        return;
    }
    let mut last = node;
    let mut current = parent(node);
    while let Some(holder) = current {
        match holder.kind() {
            "for_statement" | "enhanced_for_statement" | "while_statement" | "do_statement" => {
                context.report_fixed("RedundantControlFlow", node, node.start_byte(), CONTINUE, &[Fix::new().delete(node.start_byte(), node.end_byte())]);
                return;
            }
            "switch_block_statement_group" | "switch_rule" => return,
            "block" => {
                if parts(holder).last().is_none_or(|end| end.id() != last.id()) {
                    return;
                }
            }
            _ => {}
        }
        last = holder;
        current = parent(holder);
    }
}

fn names_i(context: &Context, node: Node) -> bool {
    match node.kind() {
        "identifier" => context.text(node) == "i" && (value_name(node) || parent(node).is_some_and(|holder| holder.kind() == "method_invocation" && holder.child_by_field_name("object").is_none())),
        "type_identifier" => context.text(node) == "i" && parent(node).is_some_and(|holder| !matches!(holder.kind(), "scoped_type_identifier")),
        _ => false,
    }
}

pub fn loop_over_char_array(context: &Context, node: Node) {
    if node.kind() != "enhanced_for_statement" {
        return;
    }
    let Some(value) = node.child_by_field_name("value").filter(|value| value.kind() == "method_invocation") else { return };
    if value.child_by_field_name("name").is_none_or(|name| context.text(name) != "toCharArray") {
        return;
    }
    let Some(receiver) = value.child_by_field_name("object").filter(|object| object.kind() == "identifier") else { return };
    if value.child_by_field_name("arguments").is_some_and(|list| list.named_child_count() > 0) || !context.resolver.matches_sig(value, "java.lang.String#toCharArray()") {
        return;
    }
    if !matches!(context.resolver.type_of(receiver), Some(Type::Class(name, _)) if name == "java.lang.String") {
        return;
    }
    let Some(body) = node.child_by_field_name("body").filter(|body| body.kind() == "block") else { return };
    let Some(first) = parts(body).into_iter().next() else { return };
    let mut defined = false;
    walk(node, |inner| defined |= names_i(context, inner));
    let mut fixes = Vec::new();
    if !defined {
        let source = context.text(receiver);
        let variable = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
        let text = format!("for (int i = 0; i < {source}.length(); i++) {{ char {variable} = {source}.charAt(i);");
        fixes.push(Fix::replace(node.start_byte(), first.start_byte(), text));
    }
    context.report_fixed("LoopOverCharArray", node, node.start_byte(), "toCharArray allocates a new array, using charAt is more efficient", &fixes);
}
