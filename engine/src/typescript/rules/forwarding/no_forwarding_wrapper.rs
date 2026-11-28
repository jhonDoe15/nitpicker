//! `no-forwarding-wrapper`: a module-level function that only passes its parameters to another function with
//! the same parameter and return types.
use super::callee::{has_same_function_signature, is_async_callee};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::{ScopeKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::tables::kind;

const RULE: &str = "no-forwarding-wrapper";

struct Candidate<'v> {
    function: Node<'v>,
    name: String,
    statement: Node<'v>,
    report: Node<'v>,
}

fn is_component_name(name: &str) -> bool {
    let mut characters = name.chars();
    characters.next().is_some_and(|first| first.is_ascii_uppercase()) && characters.all(|rest| rest.is_ascii_alphanumeric())
}

fn forwarded_call(function: Node) -> Option<Node> {
    let body = function.node("body")?;
    let value = if body.is("BlockStatement") {
        let statements = body.nodes("body");
        let [only] = statements.as_slice() else { return None };
        only.is("ReturnStatement").then(|| only.node("argument")).flatten()?
    } else {
        body
    };
    if function.flag("async") && value.is("AwaitExpression") { value.node("argument") } else { Some(value) }
}

fn identifier_name(node: Node) -> Option<String> {
    let named = if node.is("RestElement") || node.is("SpreadElement") { node.node("argument").filter(|argument| argument.is("Identifier"))? } else { node };
    named.is("Identifier").then(|| named.name().map(|name| name.into_owned())).flatten()
}

fn forwards_own_parameters(function: Node, call: Node) -> bool {
    let (parameters, arguments) = (function.nodes("params"), call.nodes("arguments"));
    let same_shape = parameters.iter().enumerate().all(|(index, parameter)| parameter.is("RestElement") == arguments.get(index).is_some_and(|argument| argument.is("SpreadElement")));
    let names: Vec<Option<String>> = parameters.iter().map(|parameter| identifier_name(*parameter)).collect();
    !names.is_empty() && names.len() == arguments.len() && same_shape && names.iter().zip(&arguments).all(|(name, argument)| name.is_some() && *name == identifier_name(*argument))
}

fn is_module_level(statement: Node) -> bool {
    let Some(parent) = statement.parent() else { return false };
    let owner = if matches!(parent.kind(), "ExportNamedDeclaration" | "ExportDefaultDeclaration") { parent } else { statement };
    owner.parent().is_some_and(|program| program.is("Program"))
}

fn exports_of(node: Node, name: &str) -> Option<String> {
    if node.is("ExportDefaultDeclaration") {
        return node.node("declaration").filter(|declaration| declaration.is("Identifier") && declaration.name().as_deref() == Some(name)).map(|_| "default".to_string());
    }
    if !node.is("ExportNamedDeclaration") || node.node("source").is_some() {
        return None;
    }
    let specifier = node.nodes("specifiers").into_iter().find(|specifier| specifier.node("local").and_then(|local| local.name()).as_deref() == Some(name))?;
    let exported = specifier.node("exported")?;
    exported.name().or_else(|| exported.text("value")).map(|text| text.into_owned())
}

fn exported_name(statement: Node, name: &str) -> Option<String> {
    let parent = statement.parent()?;
    match parent.kind() {
        "ExportNamedDeclaration" => Some(name.to_string()),
        "ExportDefaultDeclaration" => Some("default".to_string()),
        "Program" => parent.nodes("body").into_iter().find_map(|node| exports_of(node, name)),
        _ => None,
    }
}

fn is_importable(scopes: &Scopes, callee: Node) -> bool {
    let Some(symbol) = scopes.variable_named(callee) else { return false };
    !scopes.defs(symbol).is_empty() && scopes.scope_of(symbol).is_some_and(|(scope, _)| matches!(scope, ScopeKind::Module | ScopeKind::Global))
}

fn has_overloads(scopes: &Scopes, function: Node) -> bool {
    function.node("id").and_then(|id| scopes.variable_named(id)).is_some_and(|symbol| scopes.defs(symbol).len() > 1)
}

fn function_kind(function: Node) -> u32 {
    match function.kind() {
        "FunctionDeclaration" => kind::FUNCTION_DECLARATION,
        "ArrowFunctionExpression" => kind::ARROW_FUNCTION,
        _ => kind::FUNCTION_EXPRESSION,
    }
}

fn forwarded_target<'v>(scopes: &Scopes, types: &mut Types, candidate: &Candidate<'v>) -> Option<Node<'v>> {
    let function = candidate.function;
    let call = forwarded_call(function)?;
    let callee = call.node("callee")?;
    let simple = !function.flag("generator") && function.node("typeParameters").is_none() && !is_component_name(&candidate.name);
    let plain_call = call.is("CallExpression") && !call.flag("optional") && call.node("typeArguments").is_none() && call.node("typeParameters").is_none();
    if !simple || !is_module_level(candidate.statement) || !plain_call || !callee.is("Identifier") || !is_importable(scopes, callee) {
        return None;
    }
    if callee.name().as_deref() == Some(candidate.name.as_str()) || !forwards_own_parameters(function, call) || has_overloads(scopes, function) {
        return None;
    }
    let callee_handle = types.handle_at(Some(kind::IDENTIFIER), callee.start(), callee.end())?;
    if function.flag("async") && !is_async_callee(types, &callee_handle) {
        return None;
    }
    let wrapper = types.handle_at(Some(function_kind(function)), function.start(), function.end())?;
    has_same_function_signature(types, &wrapper, &callee_handle).then_some(callee)
}

fn message(name: &str, target: &str, exported: Option<&str>) -> String {
    let advice = match exported {
        Some(exported) => format!("Delete it and export `{target}` in its place with `export {{ {target} as {exported} }}`, or call `{target}` directly."),
        None => format!("Call `{target}` directly where `{name}` is used and delete the wrapper."),
    };
    format!("`{name}` only forwards its parameters to `{target}` and has the same parameter and return types. {advice}")
}

fn candidates<'v>(view: &'v crate::typescript::rules::support::view::View) -> Vec<Candidate<'v>> {
    let mut found = Vec::new();
    for node in view.nodes() {
        if node.is("FunctionDeclaration") {
            if let Some(name) = node.node("id").and_then(|id| id.name()) {
                found.push(Candidate { function: node, name: name.into_owned(), statement: node, report: node });
            }
        } else if node.is("VariableDeclarator") {
            let init = node.node("init").filter(|init| init.is("ArrowFunctionExpression") || init.is("FunctionExpression"));
            let id = node.node("id").filter(|id| id.is("Identifier") && id.node("typeAnnotation").is_none());
            if let (Some(function), Some(id), Some(statement)) = (init, id, node.parent()) {
                found.push(Candidate { function, name: id.name().map(|name| name.into_owned()).unwrap_or_default(), statement, report: node });
            }
        }
    }
    found
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let mut found = Vec::new();
    for candidate in candidates(view) {
        let mut types = types.borrow_mut();
        let target = forwarded_target(scopes, &mut types, &candidate);
        if types.refused.is_some() {
            return;
        }
        if let Some(target) = target {
            let exported = exported_name(candidate.statement, &candidate.name);
            let target_name = target.name().map(|name| name.into_owned()).unwrap_or_default();
            found.push((candidate.report.start(), candidate.report.end(), message(&candidate.name, &target_name, exported.as_deref())));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
