//! CatchFail: `catch` blocks that only call `fail()` and ignore the exception.
use super::Context;
use super::call_match::static_on_class;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::junit_tests::is_test_case;
use super::annotation_args::annotation_value;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::javac::locals::{Found, Scopes, declaration};
use crate::java::types::model::Type;
use tree_sitter::Node;

const NAME: &str = "CatchFail";
const MESSAGE: &str = "Ignoring exceptions and calling fail() is unnecessary, and makes test output less useful";
const FAIL_CLASSES: [&str; 3] = ["org.junit.Assert", "junit.framework.Assert", "junit.framework.TestCase"];

fn statements<'t>(block: Node<'t>) -> Vec<Node<'t>> {
    named_children(block).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn fail_statement(context: &Context, statement: Node) -> bool {
    if statement.kind() != "expression_statement" {
        return false;
    }
    let Some(call) = named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")) else { return false };
    FAIL_CLASSES.iter().any(|owner| static_on_class(context, call, owner, &["fail"]))
}

fn parameter_of<'t>(catch: Node<'t>) -> Option<Node<'t>> {
    children(catch).into_iter().find(|part| part.kind() == "catch_formal_parameter")
}

fn variable_used(context: &Context, catch: Node, block: Node) -> bool {
    let Some(name) = parameter_of(catch).and_then(|parameter| parameter.child_by_field_name("name")) else { return true };
    let scopes = Scopes::of(context.file, context.file.tree.root_node());
    let text = context.text(name);
    let mut found = false;
    walk(block, |node| {
        if !found && node.kind() == "identifier" && context.text(node) == text {
            found = matches!(declaration(context.resolver, &scopes, node, text), Some(Found::Local(declared)) if declared.end_byte() == name.end_byte());
        }
    });
    found
}

fn message_or_format(context: &Context, call: Node) -> String {
    let arguments = super::positions::arguments(call);
    if arguments.len() > 1 {
        let first = arguments[0];
        let last = arguments[arguments.len() - 1];
        return format!("String.format({})", &context.file.text[first.start_byte()..last.end_byte()]);
    }
    context.text(arguments[0]).to_string()
}

fn rethrow_fix(context: &Context, blocks: &[Node]) -> Option<Fix> {
    let mut fix = Fix::new();
    for catch in blocks {
        let statement = statements(catch.child_by_field_name("body")?)[0];
        let call = named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment"))?;
        if super::positions::arguments(call).is_empty() {
            continue;
        }
        let name = context.text(parameter_of(*catch)?.child_by_field_name("name")?);
        let text = format!("throw new AssertionError({}, {name});", message_or_format(context, call));
        fix = fix.and(statement.start_byte(), statement.end_byte(), text);
    }
    (!fix.is_empty()).then_some(fix)
}

fn enclosing_method<'t>(node: Node<'t>) -> Option<Node<'t>> {
    let mut current = parent(node);
    while let Some(at) = current {
        match at.kind() {
            "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => return Some(at),
            "lambda_expression" | "class_body" | "interface_body" | "enum_body" | "annotation_type_body" | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration" => return None,
            _ => {}
        }
        current = parent(at);
    }
    None
}

fn expected_exception_test(context: &Context, method: Node) -> bool {
    if !context.resolver.annotation_names(method).iter().any(|name| name == "org.junit.Test") {
        return false;
    }
    let Some(modifiers) = children(method).into_iter().find(|part| part.kind() == "modifiers") else { return false };
    children(modifiers).into_iter().any(|annotation| {
        matches!(annotation.kind(), "annotation" | "marker_annotation")
            && annotation.child_by_field_name("name").is_some_and(|part| matches!(context.text(part), "Test" | "org.junit.Test"))
            && annotation_value(&context.file.text, annotation, "expected").is_some()
    })
}

fn caught_types(context: &Context, catch: Node) -> Vec<Type> {
    let Some(kinds) = parameter_of(catch).and_then(|parameter| children(parameter).into_iter().find(|part| part.kind() == "catch_type")) else { return Vec::new() };
    named_children(kinds).into_iter().filter_map(|kind| context.resolver.type_node(kind)).collect()
}

fn delete_fix(context: &Context, tree: Node, blocks: &[Node], catches: usize, has_finally: bool) -> Option<Fix> {
    let mut fix = Fix::new();
    if has_finally || blocks.len() < catches {
        for catch in blocks {
            fix = fix.delete(catch.start_byte(), catch.end_byte());
        }
    } else {
        let body = statements(tree.child_by_field_name("body")?);
        if body.is_empty() {
            return Some(fix.delete(tree.start_byte(), tree.end_byte()));
        }
        let (first, last) = (body[0], body[body.len() - 1]);
        fix = fix.and(tree.start_byte(), tree.end_byte(), &context.file.text[first.start_byte()..last.end_byte()]);
    }
    let method = enclosing_method(tree)?;
    if expected_exception_test(context, method) {
        return None;
    }
    let throws = children(method).into_iter().find(|part| part.kind() == "throws");
    let thrown: Vec<Type> = throws.map(|list| named_children(list).into_iter().filter_map(|kind| context.resolver.type_node(kind)).collect()).unwrap_or_default();
    let to_throw: Vec<Type> = blocks
        .iter()
        .flat_map(|catch| caught_types(context, *catch))
        .filter(|kind| !thrown.iter().any(|above| context.resolver.index.is_subtype(&kind.name(), &above.name())))
        .collect();
    if !to_throw.is_empty() {
        if !is_test_case(context, method) {
            return None;
        }
        let mut names: Vec<String> = Vec::new();
        for kind in &to_throw {
            let shown = qualify_type(context, tree, &kind.name(), &mut fix);
            if !names.contains(&shown) {
                names.push(shown);
            }
        }
        let list = names.join(", ");
        match throws.and_then(|list| named_children(list).into_iter().last()) {
            Some(last) => fix = fix.insert(last.end_byte(), format!(", {list}")),
            None => {
                let body = method.child_by_field_name("body")?;
                fix = fix.insert(body.start_byte(), format!("throws {list}"));
            }
        }
    }
    Some(fix)
}

pub fn catch_fail(context: &Context, tree: Node) {
    if !matches!(tree.kind(), "try_statement" | "try_with_resources_statement") {
        return;
    }
    let catches: Vec<Node> = children(tree).into_iter().filter(|part| part.kind() == "catch_clause").collect();
    if catches.is_empty() {
        return;
    }
    let blocks: Vec<Node> = catches
        .iter()
        .copied()
        .filter(|catch| {
            let Some(body) = catch.child_by_field_name("body") else { return false };
            let inside = statements(body);
            inside.len() == 1 && fail_statement(context, inside[0]) && !variable_used(context, *catch, body)
        })
        .collect();
    if blocks.is_empty() {
        return;
    }
    let has_finally = children(tree).into_iter().any(|part| part.kind() == "finally_clause");
    let mut fixes = Vec::new();
    fixes.extend(rethrow_fix(context, &blocks));
    fixes.extend(delete_fix(context, tree, &blocks, catches.len(), has_finally));
    context.report_fixed(NAME, tree, tree.start_byte(), MESSAGE, &fixes);
}
