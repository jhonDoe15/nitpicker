//! StreamResourceLeak: streams of `Files` that must be closed, with Error Prone's combined per-method fix.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::{children, named_children, parent};
use tree_sitter::Node;

const MESSAGE: &str = "Streams that encapsulate a closeable resource should be closed using try-with-resources";
const CALLS: &[&str] = &["lines", "newDirectoryStream", "list", "walk", "find"];

enum Outcome {
    Exempt,
    Finding(Fix),
}

pub fn stream_resource_leak(context: &Context, node: Node) {
    if !matches!(node.kind(), "method_declaration" | "constructor_declaration") {
        return;
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    let mut merged = Fix::new();
    let mut first: Option<Node> = None;
    scan(context, body, &mut |call| {
        if context.suppressed("StreamResourceLeak", call) || context.suppressed("FilesLinesLeak", call) {
            return;
        }
        if let Outcome::Finding(fix) = check_closed(context, call) {
            merged = std::mem::replace(&mut merged, Fix::new()).merged(fix);
            first.get_or_insert(call);
        }
    });
    let Some(call) = first else { return };
    let position = call.child_by_field_name("arguments").map_or(call.start_byte(), |list| list.start_byte());
    context.report_fixed("StreamResourceLeak", call, position, MESSAGE, &[merged]);
}

fn scan<'t>(context: &Context, node: Node<'t>, visit: &mut impl FnMut(Node<'t>)) {
    for child in children(node) {
        if matches!(child.kind(), "method_declaration" | "constructor_declaration") {
            continue;
        }
        if child.kind() == "method_invocation" && matching(context, child) {
            visit(child);
        }
        scan(context, child, visit);
    }
}

fn matching(context: &Context, call: Node) -> bool {
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    CALLS.contains(&name) && context.resolver.matches_sig(call, &format!("java.nio.file.Files#{name}(_*)"))
}

fn enclosing_method(node: Node) -> Option<Node> {
    let mut at = parent(node);
    while let Some(up) = at {
        match up.kind() {
            "lambda_expression" | "object_creation_expression" => return None,
            "method_declaration" | "constructor_declaration" => return Some(up),
            _ => at = parent(up),
        }
    }
    None
}

fn check_closed(context: &Context, call: Node) -> Outcome {
    let method = enclosing_method(call);
    let mut prev = call;
    let mut path = parent(call);
    while let Some(up) = path {
        match up.kind() {
            "return_statement" => {
                let Some(method) = method else { return Outcome::Finding(Fix::new()) };
                if context.resolver.annotation_names(method).iter().any(|name| name.rsplit('.').next() == Some("MustBeClosed")) {
                    return Outcome::Exempt;
                }
                return Outcome::Finding(Fix::new().insert(method.start_byte(), "@MustBeClosed\n").with_imports());
            }
            "lambda_expression" => return Outcome::Finding(Fix::new()),
            "ternary_expression" if up.child_by_field_name("consequence") == Some(prev) || up.child_by_field_name("alternative") == Some(prev) => {
                prev = up;
                path = parent(up);
                continue;
            }
            "method_invocation" if up.child_by_field_name("object") == Some(prev) => {
                if stream_to_stream(context, prev, up) {
                    prev = up;
                    path = parent(up);
                    continue;
                }
            }
            "resource" => return Outcome::Exempt,
            "variable_declarator" => {
                let declaration = parent(up);
                let in_field = declaration.is_some_and(|holder| holder.kind() == "field_declaration");
                if in_field && declaration.is_some_and(|holder| has_static_final(context, holder)) {
                    return Outcome::Exempt;
                }
                if declaration.is_some_and(|holder| closed_in_finally(context, holder, up)) {
                    return Outcome::Exempt;
                }
            }
            "assignment_expression" => return Outcome::Finding(Fix::new()),
            _ => {}
        }
        return Outcome::Finding(definite_fix(context, call, up));
    }
    Outcome::Finding(Fix::new())
}

fn stream_to_stream(context: &Context, receiver: Node, invocation: Node) -> bool {
    let is_stream = |node: Node| context.resolver.type_of(node).is_some_and(|found| found.name() == "java.util.stream.Stream");
    is_stream(receiver) && is_stream(invocation)
}

fn has_static_final(context: &Context, declaration: Node) -> bool {
    let text = children(declaration).into_iter().find(|part| part.kind() == "modifiers").map_or("", |part| context.text(part));
    text.split_whitespace().any(|word| word == "static") && text.split_whitespace().any(|word| word == "final")
}

fn closed_in_finally(context: &Context, declaration: Node, declarator: Node) -> bool {
    let Some(name) = declarator.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    if declaration.kind() != "local_variable_declaration" || !is_final(context, declaration, name) {
        return false;
    }
    let Some(block) = parent(declaration).filter(|holder| holder.kind() == "block") else { return false };
    let statements = statements(block);
    let Some(index) = statements.iter().position(|statement| *statement == declaration) else { return false };
    let Some(next) = statements.get(index + 1).filter(|next| next.kind() == "try_statement") else { return false };
    let Some(finally) = children(*next).into_iter().find(|part| part.kind() == "finally_clause") else { return false };
    let mut closed = false;
    crate::engine::source::walk(finally, |part| {
        if part.kind() == "method_invocation"
            && part.child_by_field_name("name").is_some_and(|called| context.text(called) == "close")
            && part.child_by_field_name("object").is_some_and(|object| object.kind() == "identifier" && context.text(object) == name)
            && context.resolver.matches_sig(part, "java.lang.AutoCloseable#close(_*)")
        {
            closed = true;
        }
    });
    closed
}

fn is_final(context: &Context, declaration: Node, name: &str) -> bool {
    let explicit = children(declaration).into_iter().find(|part| part.kind() == "modifiers").is_some_and(|part| context.text(part).split_whitespace().any(|word| word == "final"));
    if explicit {
        return true;
    }
    let Some(scope) = crate::engine::source::ancestor(declaration, &["method_declaration", "constructor_declaration", "lambda_expression"]) else { return false };
    let mut assigned = false;
    crate::engine::source::walk(scope, |part| {
        let target = match part.kind() {
            "assignment_expression" => part.child_by_field_name("left"),
            "update_expression" => named_children(part).into_iter().next(),
            _ => None,
        };
        if target.is_some_and(|target| target.kind() == "identifier" && context.text(target) == name) {
            assigned = true;
        }
    });
    !assigned
}

fn statements(block: Node) -> Vec<Node> {
    named_children(block).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn stream_type(context: &Context, call: Node) -> &'static str {
    match context.text(call.child_by_field_name("name").unwrap_or(call)) {
        "lines" => "Stream<String>",
        "newDirectoryStream" => "DirectoryStream<Path>",
        _ => "Stream<Path>",
    }
}

fn statement_of(node: Node) -> Option<Node> {
    let mut at = parent(node);
    while let Some(up) = at {
        if up.kind().ends_with("_statement") || matches!(up.kind(), "local_variable_declaration" | "field_declaration") {
            return Some(up);
        }
        at = parent(up);
    }
    None
}

fn definite_fix(context: &Context, call: Node, holder: Node) -> Fix {
    let text = &context.file.text;
    let kind = stream_type(context, call);
    let source = context.text(call);
    let header = format!("try ({kind} stream = {source}) {{\n");
    let (start, end) = (call.start_byte(), call.end_byte());
    match holder.kind() {
        "method_invocation" if holder.child_by_field_name("object").is_some_and(|object| object.end_byte() >= end && object.start_byte() <= start) => {
            let Some(statement) = statement_of(call) else { return Fix::new() };
            if matches!(statement.kind(), "local_variable_declaration" | "field_declaration") {
                let Some(declarator) = named_children(statement).into_iter().find(|part| part.kind() == "variable_declarator") else { return Fix::new() };
                let (Some(name), Some(value)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value")) else { return Fix::new() };
                let begin = statement.start_byte();
                let equals = begin + text[begin..value.start_byte()].rfind('=').unwrap_or(0);
                let replacement = format!(";\ntry ({kind} stream = {source}) {{\n{} =", context.text(name));
                return Fix::replace(equals, value.start_byte(), replacement).and(start, end, "stream").insert(statement.end_byte(), "}");
            }
            Fix::new().insert(statement.start_byte(), header).and(start, end, "stream").insert(statement.end_byte(), "}")
        }
        "local_variable_declaration" | "variable_declarator" => variable_fix(context, call, holder),
        "enhanced_for_statement" => Fix::new().insert(holder.start_byte(), header).and(start, end, "stream").insert(holder.end_byte(), "}"),
        "argument_list" => {
            let Some(invocation) = parent(holder).filter(|node| node.kind() == "method_invocation") else { return Fix::new() };
            let Some(statement) = parent(invocation).filter(|node| node.kind() == "expression_statement") else { return Fix::new() };
            Fix::new().insert(invocation.start_byte(), header).and(start, end, "stream").insert(statement.end_byte(), "}")
        }
        _ => Fix::new(),
    }
}

fn variable_fix(context: &Context, call: Node, declarator: Node) -> Fix {
    let declaration = if declarator.kind() == "variable_declarator" { parent(declarator) } else { Some(declarator) };
    let Some(declaration) = declaration.filter(|node| node.kind() == "local_variable_declaration") else { return Fix::new() };
    let Some(block) = parent(declaration).filter(|node| node.kind() == "block") else { return Fix::new() };
    let Some(value) = named_children(declaration).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("value")) else { return Fix::new() };
    let _ = call;
    let name = named_children(declaration).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name")).map(|part| context.text(part)).unwrap_or("");
    let list = statements(block);
    let Some(index) = list.iter().position(|statement| *statement == declaration) else { return Fix::new() };
    let mut last = index;
    for (offset, statement) in list.iter().enumerate().skip(index + 1) {
        let mut found = false;
        crate::engine::source::walk(*statement, |part| {
            if part.kind() == "identifier" && context.text(part) == name {
                found = true;
            }
        });
        if found {
            last = offset;
        }
    }
    Fix::new().insert(declaration.start_byte(), "try (").and(value.end_byte(), declaration.end_byte(), ") {").insert(list[last].end_byte(), "}")
}
