//! StringConcatToTextBlock: a concatenation of lines that reads better as a text block.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::{named_children, parent, walk};
use crate::java::types::expr::literal_text;
use tree_sitter::Node;

const MESSAGE: &str = "This string literal can be written more clearly as a text block";
const DELIMITER: &str = "\"\"\"";

fn is_space(character: char) -> bool {
    super::doc::is_space(character)
}

/// `String.stripIndent`.
fn strip_indent(text: &str) -> String {
    if text.is_empty() {
        return String::new();
    }
    let lines: Vec<&str> = text.lines().collect();
    let opt_out = text.ends_with(['\n', '\r']);
    let leading = |line: &str| line.chars().take_while(|character| is_space(*character)).count();
    let outdent = if opt_out || lines.is_empty() {
        0
    } else {
        let mut outdent = usize::MAX;
        for line in &lines {
            if leading(line) != line.chars().count() {
                outdent = outdent.min(leading(line));
            }
        }
        let last = lines[lines.len() - 1];
        if last.chars().all(is_space) {
            outdent = outdent.min(last.chars().count());
        }
        if outdent == usize::MAX { 0 } else { outdent }
    };
    let cut: Vec<String> = lines
        .iter()
        .map(|line| {
            let trimmed = line.trim_end_matches(is_space);
            if trimmed.is_empty() {
                return String::new();
            }
            trimmed.chars().skip(outdent.min(leading(line))).collect()
        })
        .collect();
    format!("{}{}", cut.join("\n"), if opt_out { "\n" } else { "" })
}

/// Guava's Java text block escaper: control and non-ASCII characters become unicode escapes.
fn escape(line: &str) -> String {
    let mut out = String::new();
    for unit in line.encode_utf16() {
        match unit {
            8 => out.push_str("\\b"),
            12 => out.push_str("\\f"),
            10 => out.push_str("\\n"),
            13 => out.push_str("\\r"),
            9 => out.push_str("\\t"),
            92 => out.push_str("\\\\"),
            0x20..=0x7e => out.push(char::from(unit as u8)),
            other => out.push_str(&format!("\\u{other:04x}")),
        }
    }
    out
}

fn column(context: &Context, offset: usize) -> usize {
    let start = context.file.text[..offset].rfind('\n').map_or(0, |at| at + 1);
    let mut column = 0usize;
    for character in context.file.text[start..offset].chars() {
        column = if character == '\t' { column / 8 * 8 + 8 } else { column + character.len_utf16() };
    }
    column
}

fn replacement(context: &Context, from: usize, to: usize, strings: &[String]) -> Option<String> {
    let last = strings.last()?;
    let mut has_comment = false;
    let root = context.file.tree.root_node();
    if let Some(inside) = root.descendant_for_byte_range(from, to) {
        walk(inside, |part| has_comment |= part.kind().ends_with("comment") && part.start_byte() >= from && part.end_byte() <= to);
    }
    if has_comment || strings.iter().any(|string| string.contains(DELIMITER)) {
        return None;
    }
    let trailing = last.ends_with('\n');
    let joined = strings.join("\n");
    let stripped = strip_indent(&joined);
    let outdented: Vec<String> = stripped
        .lines()
        .zip(joined.lines())
        .map(|(cut, original)| {
            let spaces = original.len() - original.trim_end_matches(' ').len();
            format!("{cut}{}", " ".repeat(spaces))
        })
        .collect();
    let indent = " ".repeat(column(context, from));
    let suffix = if trailing { "" } else { "\\" };
    let lines: Vec<String> = outdented
        .iter()
        .map(|line| if line.is_empty() { String::new() } else { format!("{indent}{line}") })
        .map(|line| escape(&line))
        .map(|line| match line.strip_suffix(' ') {
            Some(rest) => format!("{rest}\\s"),
            None => line,
        })
        .collect();
    let text = format!("{DELIMITER}\n{}{suffix}\n{indent}{DELIMITER}", lines.join("\n"));
    (context.file.text[from..to] != text).then_some(text)
}

fn string_pieces<'t>(node: Node<'t>, out: &mut Vec<Node<'t>>) -> bool {
    match node.kind() {
        "string_literal" => {
            out.push(node);
            true
        }
        "binary_expression" => {
            let (Some(left), Some(right), Some(operator)) = (node.child_by_field_name("left"), node.child_by_field_name("right"), node.child_by_field_name("operator")) else { return false };
            operator.kind() == "+" && string_pieces(left, out) && right.kind() == "string_literal" && {
                out.push(right);
                true
            }
        }
        _ => false,
    }
}

fn literal_chain(context: &Context, node: Node) {
    let mut pieces = Vec::new();
    if node.kind() != "binary_expression" || !string_pieces(node, &mut pieces) {
        return;
    }
    if parent(node).is_some_and(|holder| holder.kind() == "binary_expression" && holder.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "+")) {
        return;
    }
    let Some(strings) = pieces.iter().map(|piece| literal_text(context.file, *piece)).collect::<Option<Vec<String>>>() else { return };
    let trailing = strings.last().is_some_and(|last| last.ends_with('\n'));
    if strings.len() < if trailing { 2 } else { 3 } {
        return;
    }
    if !strings[..strings.len() - 1].iter().all(|string| string.ends_with('\n')) {
        return;
    }
    let mut lines: Vec<String> = strings[..strings.len() - 1].iter().map(|string| string[..string.len() - 1].to_string()).collect();
    lines.push(strings[strings.len() - 1].clone());
    if let Some(text) = replacement(context, node.start_byte(), node.end_byte(), &lines) {
        let fix = Fix::replace(node.start_byte(), node.end_byte(), text);
        context.report_fixed("StringConcatToTextBlock", node, node.start_byte(), MESSAGE, &[fix]);
    }
}

fn newline(context: &Context, node: Node) -> bool {
    context.resolver.constant_string(node).is_some_and(|value| value == "\n") || (node.kind() == "character_literal" && context.text(node) == "'\\n'")
}

fn literal_arguments(context: &Context, arguments: &[Node]) -> Option<Vec<String>> {
    arguments.iter().map(|argument| if argument.kind() == "string_literal" { literal_text(context.file, *argument) } else { None }).collect()
}

fn argument_nodes(call: Node) -> Vec<Node> {
    call.child_by_field_name("arguments").map(|list| named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()).unwrap_or_default()
}

fn report_call(context: &Context, call: Node, strings: &[String]) {
    if let Some(text) = replacement(context, call.start_byte(), call.end_byte(), strings) {
        let at = call.child_by_field_name("arguments").map_or(call.start_byte(), |list| list.start_byte());
        context.report_fixed("StringConcatToTextBlock", call, at, MESSAGE, &[Fix::replace(call.start_byte(), call.end_byte(), text)]);
    }
}

fn method_form(context: &Context, call: Node) {
    let name = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let arguments = argument_nodes(call);
    match name {
        "join" if context.resolver.matches_sig(call, "com.google.common.base.Joiner#join(_*)") => {
            let Some(strings) = literal_arguments(context, &arguments).filter(|strings| !strings.is_empty()) else { return };
            let Some(receiver) = call.child_by_field_name("object").filter(|object| object.kind() == "method_invocation") else { return };
            let on = argument_nodes(receiver);
            if context.resolver.matches_sig(receiver, "com.google.common.base.Joiner#on(_*)") && on.len() == 1 && newline(context, on[0]) {
                report_call(context, call, &strings);
            }
        }
        "join" if context.resolver.matches_sig(call, "java.lang.String#join(_*)") => {
            let Some(first) = arguments.first() else { return };
            let Some(strings) = literal_arguments(context, &arguments[1..]) else { return };
            if newline(context, *first) {
                report_call(context, call, &strings);
            }
        }
        "toString" if context.resolver.matches_sig(call, "java.util.StringJoiner#toString(_*)") => {
            let mut strings = Vec::new();
            let mut current = call;
            while let Some(receiver) = current.child_by_field_name("object").filter(|object| object.kind() == "method_invocation") {
                if !context.resolver.matches_sig(receiver, "java.util.StringJoiner#add(_*)") {
                    break;
                }
                let added = argument_nodes(receiver);
                let [only] = added.as_slice() else { return };
                let Some(text) = (only.kind() == "string_literal").then(|| literal_text(context.file, *only)).flatten() else { return };
                strings.insert(0, text);
                current = receiver;
            }
            let Some(creation) = current.child_by_field_name("object").filter(|object| object.kind() == "object_creation_expression") else { return };
            let made = argument_nodes(creation);
            let known = context.resolver.type_of(creation).is_some_and(|kind| kind.name() == "java.util.StringJoiner");
            if known && made.len() == 1 && newline(context, made[0]) {
                report_call(context, call, &strings);
            }
        }
        "forSourceLines" if context.resolver.matches_sig(call, "com.google.testing.compile.JavaFileObjects#forSourceLines(_*)") => {
            let Some(strings) = arguments.get(1..).and_then(|rest| literal_arguments(context, rest)) else { return };
            let (first, last) = (arguments[1], arguments[arguments.len() - 1]);
            if let Some(text) = replacement(context, first.start_byte(), last.end_byte(), &strings) {
                context.report_fixed("StringConcatToTextBlock", first, first.start_byte(), MESSAGE, &[Fix::replace(first.start_byte(), last.end_byte(), text)]);
            }
        }
        _ => {}
    }
}

pub fn string_concat_to_text_block(context: &Context, node: Node) {
    match node.kind() {
        "binary_expression" => literal_chain(context, node),
        "method_invocation" => {
            let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
            if matches!(name, "join" | "toString" | "forSourceLines") {
                method_form(context, node);
            }
        }
        _ => {}
    }
}
