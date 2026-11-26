//! RedundantOverride: an override whose body only calls the method it overrides through `super` with its own
//! parameters, with nothing else changed (modifiers, annotations, doc comment, comments in the body).
use super::Context;
use super::fixes::Fix;
use super::hierarchy::{declared_method, formals, super_methods};
use crate::engine::source::{children, named_children};
use crate::java::types::model::target;
use tree_sitter::Node;

/// Modifier bits javac's `getModifiers` gives: public, private, protected, static, final, synchronized, native, abstract, strictfp.
const MODIFIERS: u16 = 0x0d3f;

pub fn redundant_override(context: &Context, node: Node) {
    if node.kind() != "method_declaration" {
        return;
    }
    let Some(body) = node.child_by_field_name("body") else { return };
    let statements: Vec<Node> = named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    if statements.len() != 1 {
        return;
    }
    let Some(call) = single_call(statements[0]) else { return };
    if call.child_by_field_name("object").is_none_or(|receiver| receiver.kind() != "super") {
        return;
    }
    let Some((origin, declared)) = declared_method(context, node) else { return };
    let index = context.resolver.index;
    let Some((declaring, overridden)) = super_methods(index, origin, declared).into_iter().find(|(declaring, _)| !declaring.is_interface) else { return };
    let parameters = formals(node);
    let arguments: Vec<Node> = call.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let name = call.child_by_field_name("name").map(|name| context.text(name));
    if name != Some(overridden.name.as_str()) || arguments.len() != overridden.parameters.len() || arguments.len() != parameters.len() {
        return;
    }
    if documented(context, node) || declared.detail.access & MODIFIERS != overridden.detail.access & MODIFIERS {
        return;
    }
    if declared.detail.access & 4 != 0 && declaring.package != origin.package {
        return;
    }
    let own = declaration_annotations(context, &declared.detail.annotations, "METHOD");
    let theirs = declaration_annotations(context, &overridden.detail.annotations, "METHOD");
    let differs = own.iter().filter(|name| !theirs.contains(name)).chain(theirs.iter().filter(|name| !own.contains(name)));
    if differs.into_iter().any(|name| name != "java.lang.Override") {
        return;
    }
    for (at, (parameter, argument)) in parameters.iter().zip(&arguments).enumerate() {
        let named = parameter_name(context, *parameter);
        if argument.kind() != "identifier" || named != Some(context.text(*argument)) {
            return;
        }
        let own = declaration_annotations(context, declared.detail.parameter_annotations.get(at).map_or(&[][..], Vec::as_slice), "PARAMETER");
        let theirs = declaration_annotations(context, overridden.detail.parameter_annotations.get(at).map_or(&[][..], Vec::as_slice), "PARAMETER");
        if !(own.iter().all(|name| theirs.contains(name)) && theirs.iter().all(|name| own.contains(name))) {
            return;
        }
    }
    if body_has_comment(body) {
        return;
    }
    let at = node.child_by_field_name("name").map_or(node.start_byte(), |name| name.start_byte());
    let fix = Fix::replace(node.start_byte(), node.end_byte(), "");
    context.report_fixed("RedundantOverride", node, at, "This overriding method is redundant, and can be removed.", &[fix]);
}

/// `return call(...);` or `call(...);`, where the call is the whole expression.
fn single_call(statement: Node) -> Option<Node> {
    let expression = match statement.kind() {
        "return_statement" | "expression_statement" => named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment"))?,
        _ => return None,
    };
    (expression.kind() == "method_invocation").then_some(expression)
}

fn parameter_name<'f>(context: &'f Context, parameter: Node) -> Option<&'f str> {
    let name = match parameter.kind() {
        "spread_parameter" => children(parameter).into_iter().find(|part| part.kind() == "variable_declarator")?.child_by_field_name("name")?,
        _ => parameter.child_by_field_name("name")?,
    };
    Some(context.text(name))
}

/// The annotations javac keeps on the symbol: an annotation type that may only be used on types is left out.
fn declaration_annotations(context: &Context, names: &[String], element: &str) -> Vec<String> {
    let index = context.resolver.index;
    let mut out: Vec<String> = Vec::new();
    for name in names {
        let typed_only = index.get(name).and_then(|info| info.targets).is_some_and(|bits| bits & target::bit("TYPE_USE") != 0 && bits & target::bit(element) == 0);
        if !typed_only && !out.contains(name) {
            out.push(name.clone());
        }
    }
    out
}

fn documented(context: &Context, method: Node) -> bool {
    let mut current = method.prev_sibling();
    while let Some(at) = current.filter(|at| matches!(at.kind(), "block_comment" | "line_comment")) {
        if context.text(at).starts_with("/**") {
            return true;
        }
        current = at.prev_sibling();
    }
    false
}

fn body_has_comment(body: Node) -> bool {
    let mut found = false;
    crate::engine::source::walk(body, |part| found |= matches!(part.kind(), "block_comment" | "line_comment"));
    found
}
