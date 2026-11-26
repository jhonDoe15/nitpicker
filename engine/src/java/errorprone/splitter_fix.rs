//! The fix StringSplitter suggests: `Guava's Splitter` in place of `String.split`.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::{parent, walk};
use crate::java::types::expr::unwrap;
use crate::java::types::model::Type;
use tree_sitter::Node;

fn literal_of(pattern: &str) -> Option<String> {
    let mut result = String::new();
    let mut quoted = false;
    let mut characters = pattern.chars();
    while let Some(current) = characters.next() {
        if !quoted && "[].^$?*+{}()|".contains(current) {
            return None;
        }
        if current != '\\' {
            result.push(current);
            continue;
        }
        match characters.next()? {
            'Q' => quoted = true,
            'E' => quoted = false,
            't' => result.push('\t'),
            'n' => result.push('\n'),
            'f' => result.push('\u{c}'),
            'r' => result.push('\r'),
            '\\' => result.push('\\'),
            escaped if "[].^$?*+{}()|".contains(escaped) => result.push(escaped),
            _ => return None,
        }
    }
    Some(result)
}

fn escaped(text: &str) -> String {
    let mut out = String::new();
    for unit in text.encode_utf16() {
        match unit {
            8 => out.push_str("\\b"),
            12 => out.push_str("\\f"),
            10 => out.push_str("\\n"),
            13 => out.push_str("\\r"),
            9 => out.push_str("\\t"),
            34 => out.push_str("\\\""),
            92 => out.push_str("\\\\"),
            39 => out.push_str("\\'"),
            32..=126 => out.push(char::from(unit as u8)),
            _ => out.push_str(&format!("\\u{unit:04x}")),
        }
    }
    out
}

fn on_pattern(context: &Context, argument: Node) -> String {
    format!("on(Pattern.compile({}))", context.text(argument))
}

fn method_and_argument(context: &Context, argument: Node) -> String {
    let stripped = unwrap(argument);
    if stripped.kind() != "string_literal" {
        return on_pattern(context, argument);
    }
    let Some(value) = context.resolver.constant_string(stripped) else { return on_pattern(context, argument) };
    let Some(literal) = literal_of(&value) else { return on_pattern(context, argument) };
    let shown = escaped(&literal);
    if literal.encode_utf16().count() == 1 { format!("on('{shown}')") } else { format!("on(\"{shown}\")") }
}

/// Rewrites the call itself: `text.split(",")` becomes `Splitter.on(',').split(text)`.
fn replace_with_splitter(context: &Context, fix: Fix, call: Node, argument: Node, method: &str, mutable: bool) -> Fix {
    let Some(receiver) = call.child_by_field_name("object") else { return fix };
    let open = if mutable { "new ArrayList<>(" } else { "" };
    let close = if mutable { ")" } else { "" };
    let fix = fix.with_imports();
    let string = matches!(context.resolver.type_of(receiver), Some(Type::Class(name, _)) if name == "java.lang.String");
    if string {
        let chosen = method_and_argument(context, argument);
        return fix
            .insert(receiver.start_byte(), format!("{open}Splitter.{chosen}.{method}("))
            .and(receiver.end_byte(), call.end_byte(), format!("{close})"));
    }
    fix.insert(receiver.start_byte(), format!("{open}Splitter.on("))
        .insert(receiver.end_byte(), ")")
        .and(receiver.end_byte(), argument.start_byte(), format!(".{method}("))
        .and(argument.end_byte(), call.end_byte(), format!("{close})"))
}

struct Uses {
    fix: Fix,
    list: bool,
    mutable: bool,
}

fn use_fix(context: &Context, ident: Node, uses: &mut Uses) {
    let Some(holder) = parent(ident) else { return };
    match holder.kind() {
        "array_access" if holder.child_by_field_name("array") == Some(ident) => {
            let Some(index) = holder.child_by_field_name("index") else { return };
            let assignment = parent(holder).filter(|above| above.kind() == "assignment_expression" && above.child_by_field_name("left") == Some(holder));
            let fix = std::mem::take(&mut uses.fix);
            uses.fix = match assignment.and_then(|above| above.child_by_field_name("right").map(|right| (above, right))) {
                Some((above, right)) => {
                    uses.mutable = true;
                    fix.and(ident.end_byte(), index.start_byte(), ".set(").and(index.end_byte(), right.start_byte(), ", ").insert(above.end_byte(), ")")
                }
                None => fix.and(ident.end_byte(), index.start_byte(), ".get(").and(index.end_byte(), holder.end_byte(), ")"),
            };
            uses.list = true;
        }
        "field_access" if holder.child_by_field_name("object") == Some(ident) => {
            let fix = std::mem::take(&mut uses.fix);
            uses.fix = fix.and(ident.end_byte(), holder.end_byte(), ".size()");
            uses.list = true;
        }
        _ => {}
    }
}

fn enclosing(call: Node) -> Option<Node> {
    std::iter::successors(parent(call), |at| parent(*at)).find(|at| matches!(at.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "lambda_expression"))
}

fn variable_fix(context: &Context, call: Node, argument: Node, declarator: Node) -> Fix {
    let (Some(name), Some(declaration), Some(scope)) = (declarator.child_by_field_name("name"), parent(declarator), enclosing(call)) else { return Fix::new() };
    let name = context.text(name);
    let mut uses = Uses { fix: Fix::new(), list: false, mutable: false };
    walk(scope, |part| {
        if part.kind() == "identifier" && context.text(part) == name && part.id() != declarator.child_by_field_name("name").map_or(0, |written| written.id()) && matches!(super::vars::named(context, part), Some(super::vars::Named::Variable(found)) if found.id() == declarator.id()) {
            use_fix(context, part, &mut uses);
        }
    });
    let written = declaration.child_by_field_name("type");
    let explicit = written.filter(|written| context.text(*written) != "var");
    let mut fix = uses.fix;
    if let Some(written) = explicit {
        let end = declarator.child_by_field_name("dimensions").map_or(written.end_byte(), |dimensions| dimensions.end_byte());
        fix = fix.and(written.start_byte(), end, if uses.list { "List<String>" } else { "Iterable<String>" });
    }
    let method = if uses.list { "splitToList" } else { "split" };
    replace_with_splitter(context, fix, call, argument, method, uses.mutable)
}

pub fn fix(context: &Context, call: Node) -> Fix {
    let Some(argument) = call.child_by_field_name("arguments").and_then(|list| list.named_child(0)) else { return Fix::new() };
    let Some(holder) = parent(call) else { return Fix::new() };
    match holder.kind() {
        "enhanced_for_statement" => replace_with_splitter(context, Fix::new(), call, argument, "split", false),
        "array_access" => {
            let Some(index) = holder.child_by_field_name("index") else { return Fix::new() };
            let fix = Fix::new()
                .with_imports()
                .insert(holder.start_byte(), "Iterables.get(")
                .and(call.end_byte(), index.start_byte(), ", ")
                .and(index.end_byte(), holder.end_byte(), ")");
            replace_with_splitter(context, fix, call, argument, "split", false)
        }
        "variable_declarator" => variable_fix(context, call, argument, holder),
        _ => Fix::new(),
    }
}
