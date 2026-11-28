//! What MustBeClosedChecker does with one call: whether it is closed, and the fix that wraps it in a try-with-resources.
use super::Context;
use super::fixes::Fix;
use super::hierarchy::simple_name;
use super::must_be_closed::annotated;
use super::qualify::qualify_type;
use crate::engine::source::{children, named_children, parent};
use crate::java::types::model::flag;
use std::collections::HashMap;
use tree_sitter::Node;

/// The decorators that close what they wrap: the type they wrap, and the supertypes of the decorators.
const DECORATORS: &[(&str, &[&str])] = &[
    ("java.io.InputStream", &["java.io.FilterInputStream", "java.io.InputStreamReader"]),
    ("java.io.OutputStream", &["java.io.FilterOutputStream", "java.io.OutputStreamWriter"]),
    ("java.io.Reader", &["java.io.Reader"]),
    ("java.io.Writer", &["java.io.Writer"]),
];
const STATEMENT_HOLDERS: &[&str] = &[
    "block", "constructor_body", "local_variable_declaration", "field_declaration", "constant_declaration", "resource", "class_declaration", "interface_declaration",
    "enum_declaration", "record_declaration", "annotation_type_declaration", "formal_parameter", "spread_parameter", "catch_formal_parameter", "enum_constant",
];

/// One call's contribution: its fix, and the place after which a close brace goes.
pub struct Change {
    pub fix: Fix,
    pub close_after: Option<usize>,
}

fn unfixed() -> Option<Change> {
    Some(Change { fix: Fix::new(), close_after: None })
}

/// The names given so far in one method, as `NameSuggester` hands them out.
#[derive(Default)]
pub struct Names(HashMap<String, u32>);

impl Names {
    fn uniquify(&mut self, base: &str) -> String {
        let count = self.0.entry(base.to_string()).or_insert(0);
        *count += 1;
        if *count == 1 { base.to_string() } else { format!("{base}{count}") }
    }

    fn suggest(&mut self, context: &Context, call: Node) -> String {
        let class = match call.kind() {
            "object_creation_expression" => context.resolver.resolve_constructor(call).map(|found| simple_name(&found.declaring).to_string()),
            _ => context.resolver.type_of(call).map(|kind| simple_name(&kind.name()).to_string()),
        };
        self.uniquify(&lower_camel(&class.unwrap_or_default()))
    }
}

/// Guava's `UPPER_CAMEL.to(LOWER_CAMEL, name)`: words start at each capital but the first character.
fn lower_camel(name: &str) -> String {
    let mut out = String::new();
    let mut word = String::new();
    let mut first = true;
    let flush = |word: &mut String, first: &mut bool, out: &mut String| {
        if word.is_empty() {
            return;
        }
        if *first {
            out.push_str(&word.to_ascii_lowercase());
        } else {
            let mut letters = word.chars();
            if let Some(head) = letters.next() {
                out.push(head.to_ascii_uppercase());
                out.push_str(&letters.as_str().to_ascii_lowercase());
            }
        }
        *first = false;
        word.clear();
    };
    for (index, letter) in name.chars().enumerate() {
        if index > 0 && letter.is_ascii_uppercase() {
            flush(&mut word, &mut first, &mut out);
        }
        word.push(letter);
    }
    flush(&mut word, &mut first, &mut out);
    out
}

pub fn new_keyword(creation: Node) -> usize {
    children(creation).into_iter().find(|part| !part.is_named() && part.kind() == "new").map_or(creation.start_byte(), |part| part.start_byte())
}

/// The parent as javac sees it: an argument list is not a node there.
fn up(node: Node) -> Option<Node> {
    parent(node).map(|above| if above.kind() == "argument_list" { parent(above).unwrap_or(above) } else { above })
}

fn static_final(declaration: Node) -> bool {
    let has = |word: &str| crate::java::helpers::has_modifier(declaration, word);
    let in_interface = parent(declaration).and_then(parent).is_some_and(|owner| matches!(owner.kind(), "interface_declaration" | "annotation_type_declaration"));
    let in_enum = parent(declaration).and_then(parent).is_some_and(|owner| owner.kind() == "enum_declaration");
    in_interface || (has("final") && (has("static") || in_enum))
}

/// Error Prone's `isInStaticInitializer`: some tree around is a static final variable, or an assignment to one.
pub fn in_static_initializer(context: &Context, call: Node) -> bool {
    let mut at = parent(call);
    while let Some(node) = at {
        match node.kind() {
            "variable_declarator" => {
                if parent(node).is_some_and(|holder| matches!(holder.kind(), "field_declaration" | "constant_declaration") && static_final(holder)) {
                    return true;
                }
            }
            "enum_constant" => return true,
            "assignment_expression" if node.child_by_field_name("operator").is_some_and(|sign| context.text(sign) == "=") => {
                let target = node.child_by_field_name("left").and_then(|left| super::lookup::field_of(context, left));
                if target.is_some_and(|(owner, field)| field.flags & flag::FINAL != 0 && (field.flags & flag::STATIC != 0 || owner.flags & flag::ENUM != 0)) {
                    return true;
                }
            }
            _ => {}
        }
        at = parent(node);
    }
    false
}

pub fn inside_mockito_when(context: &Context, call: Node) -> bool {
    let Some(holder) = up(call).filter(|holder| holder.kind() == "method_invocation" && holder.child_by_field_name("object") != Some(call)) else { return false };
    holder.child_by_field_name("name").is_some_and(|name| context.text(name) == "when")
        && context.resolver.resolve_call(holder).is_some_and(|found| found.method.is_static && found.declaring == "org.mockito.Mockito")
}

/// The method around, as `enclosingMethod` sees it: none inside a lambda or an anonymous class.
fn caller(call: Node) -> Option<Node> {
    let mut at = parent(call);
    while let Some(node) = at {
        match node.kind() {
            "lambda_expression" | "object_creation_expression" => return None,
            "method_declaration" | "constructor_declaration" => return Some(node),
            _ => at = parent(node),
        }
    }
    None
}

fn tail_position(context: &Context, call: Node) -> Option<Change> {
    let mut at = parent(call);
    let lambda = loop {
        match at {
            Some(node) if node.kind() == "lambda_expression" => break node,
            Some(node) => at = parent(node),
            None => return unfixed(),
        }
    };
    let descriptor = context.resolver.lambda_target(lambda).and_then(|target| context.resolver.index.functional_method(&target.name()).map(|(_, method)| annotated(method)));
    if descriptor == Some(true) { None } else { unfixed() }
}

/// What javac makes of the path above a call: closed, no problem (`None`), or a problem with its fix.
pub fn closed(context: &Context, call: Node, names: &mut Names) -> Option<Change> {
    let method = caller(call);
    let mut prev = call;
    let mut at = up(call);
    while let Some(node) = at {
        match node.kind() {
            "return_statement" => {
                let Some(method) = method else { return tail_position(context, call) };
                if context.resolver.annotation_names(method).iter().any(|name| name == super::must_be_closed::ANNOTATION) {
                    return None;
                }
                return Some(Change { fix: Fix::new().insert(method.start_byte(), "@MustBeClosed\n").with_imports(), close_after: None });
            }
            "lambda_expression" => return tail_position(context, call),
            "ternary_expression" if node.child_by_field_name("consequence") == Some(prev) || node.child_by_field_name("alternative") == Some(prev) => {
                prev = node;
                at = up(node);
                continue;
            }
            "method_invocation" if node.child_by_field_name("object") == Some(prev) => {
                if stream_to_stream(context, node) {
                    prev = node;
                    at = up(node);
                    continue;
                }
            }
            "object_creation_expression" => match decorator(context, node, prev) {
                Some(true) => return None,
                Some(false) => {
                    prev = node;
                    at = up(node);
                    continue;
                }
                None => {}
            },
            "resource" if node.child_by_field_name("value") == Some(prev) => return None,
            "variable_declarator" if node.child_by_field_name("value") == Some(prev) => {
                if let Some(declaration) = parent(node) {
                    if declaration.kind() == "local_variable_declaration" && super::streams::closed_in_finally(context, declaration, node) {
                        return None;
                    }
                    if matches!(declaration.kind(), "field_declaration" | "constant_declaration") && static_final(declaration) {
                        return None;
                    }
                }
            }
            "assignment_expression" if node.child_by_field_name("operator").is_some_and(|sign| context.text(sign) == "=") => return unfixed(),
            _ => {}
        }
        return choose(context, call, names);
    }
    choose(context, call, names)
}

/// The call on a stream gives a stream again: the resource stays the same one.
fn stream_to_stream(context: &Context, outer: Node) -> bool {
    context.resolver.resolve_call(outer).is_some_and(|found| context.resolver.index.is_subtype(&found.declaring, "java.util.stream.Stream") && found.method.returns.name() == "java.util.stream.Stream")
}

/// For a creation that takes the resource first: `Some(true)` when the decorator is itself annotated, `Some(false)` when it
/// closes what it wraps, `None` when it is no such decorator.
fn decorator(context: &Context, creation: Node, resource: Node) -> Option<bool> {
    let arguments: Vec<Node> = creation.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    if arguments.first() != Some(&resource) {
        return None;
    }
    let resolved = context.resolver.resolve_constructor(creation)?;
    if !resolved.method.throws.is_empty() {
        return None;
    }
    let wrapped = resolved.method.parameters.first()?.name();
    let closes = DECORATORS.iter().find(|(key, _)| *key == wrapped).is_some_and(|(_, values)| values.iter().any(|value| context.resolver.index.is_subtype(&resolved.declaring, value)));
    if !closes {
        return None;
    }
    Some(annotated(&resolved.method))
}

/// The expression of a `case ... -> expression;` of a switch expression: javac sees a `yield` that starts at `case`.
fn yield_rule(node: Node) -> Option<Node> {
    let rule = parent(node).filter(|rule| node.kind() == "expression_statement" && rule.kind() == "switch_rule")?;
    let switch = parent(rule).and_then(parent)?;
    (!super::unused::switch_is_statement(switch)).then_some(rule)
}

fn statement_of(call: Node) -> Option<Node> {
    let mut at = parent(call);
    while let Some(node) = at {
        if let Some(rule) = yield_rule(node) {
            return Some(rule);
        }
        if node.kind().ends_with("_statement") || STATEMENT_HOLDERS.contains(&node.kind()) {
            return Some(node);
        }
        at = parent(node);
    }
    None
}

fn choose(context: &Context, call: Node, names: &mut Names) -> Option<Change> {
    if let Some(declarator) = parent(call).filter(|holder| holder.kind() == "variable_declarator" && holder.child_by_field_name("value") == Some(call)) {
        return wrap_variable_scope(context, call, declarator, names);
    }
    let statement = statement_of(call)?;
    match statement.kind() {
        "resource" => extract_to_resource(context, call, statement, names),
        "local_variable_declaration" | "field_declaration" | "constant_declaration" | "formal_parameter" | "spread_parameter" | "catch_formal_parameter" | "enum_constant" => {
            split_declaration(context, call, statement, names)
        }
        _ => single_statement(context, call, statement, names),
    }
}

fn wrap_variable_scope(context: &Context, call: Node, declarator: Node, _names: &mut Names) -> Option<Change> {
    let declaration = parent(declarator)?;
    let mut at = parent(call);
    let block = loop {
        match at {
            Some(node) if matches!(node.kind(), "block" | "constructor_body") => break node,
            Some(node) => at = parent(node),
            None => return None,
        }
    };
    let written = declaration.child_by_field_name("type").map_or("var", |kind| context.text(kind));
    let name = declarator.child_by_field_name("name").map_or("", |name| context.text(name));
    let text = format!("try ({written} {name} = {}) {{", context.text(call));
    let fix = Fix::new().delete(declaration.start_byte(), declaration.end_byte()).insert(declaration.start_byte(), text);
    Some(Change { fix, close_after: Some(block.end_byte()) })
}

fn single_statement(context: &Context, call: Node, statement: Node, names: &mut Names) -> Option<Change> {
    let name = names.suggest(context, call);
    let mut fix = Fix::new();
    if parent(call).is_some_and(|holder| holder.kind() == "expression_statement" && yield_rule(holder).is_none()) {
        fix = fix.delete(statement.start_byte(), statement.end_byte());
    } else {
        fix = fix.and(call.start_byte(), call.end_byte(), name.clone());
    }
    let fix = fix.insert(statement.start_byte(), format!("try (var {name} = {}) {{", context.text(call)));
    Some(Change { fix, close_after: Some(statement.end_byte()) })
}

fn extract_to_resource(context: &Context, call: Node, resource: Node, names: &mut Names) -> Option<Change> {
    let kind = context.resolver.type_of(call)?;
    let name = names.suggest(context, call);
    let written = qualify_type(context, call, &kind);
    let fix = Fix::new().insert(resource.start_byte(), format!("{written} {name} = {};", context.text(call))).and(call.start_byte(), call.end_byte(), name);
    Some(Change { fix, close_after: None })
}

fn split_declaration(context: &Context, call: Node, declaration: Node, names: &mut Names) -> Option<Change> {
    let declarator = crate::java::helpers::declarators(declaration).into_iter().find(|part| part.start_byte() <= call.start_byte() && call.end_byte() <= part.end_byte())?;
    let value = declarator.child_by_field_name("value")?;
    let declared = declaration.child_by_field_name("type")?;
    let variable = declarator.child_by_field_name("name").map_or("", |name| context.text(name));
    let (start, prefix) = if context.text(declared) == "var" {
        let kind = context.resolver.type_of(value)?;
        (declaration.start_byte(), qualify_type(context, call, &kind))
    } else {
        (declared.end_byte(), String::new())
    };
    let name = names.suggest(context, call);
    let text = format!("{prefix} {variable};\ntry (var {name} = {}) {{\n{variable} =", context.text(call));
    let fix = Fix::replace(start, value.start_byte(), text).and(call.start_byte(), call.end_byte(), name);
    Some(Change { fix, close_after: Some(declaration.end_byte()) })
}
