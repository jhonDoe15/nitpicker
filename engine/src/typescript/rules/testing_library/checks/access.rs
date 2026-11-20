//! no-node-access and no-manual-cleanup.
use super::super::Tools;
use super::super::nodes::{bindings, deepest_identifier, identifier, identifier_name, import_module_name, is_named, name, property_name};
use super::super::promises::{references_of, variable_references};
use super::super::resolve::resolve;
use super::super::utils::is_built_in_query_name;
use crate::typescript::rules::support::view::Node;

const ACCESS: &str = "testing-library/no-node-access";
const CLEANUP: &str = "testing-library/no-manual-cleanup";
const ACCESS_MESSAGE: &str = "Avoid direct Node access. Prefer using the methods from Testing Library.";
const CLEANUP_MESSAGE: &str = "`cleanup` is performed automatically by your test runner, you don't need manual cleanups.";
const RETURNING_NODES: [&str; 25] = [
    "activeElement", "children", "childElementCount", "firstChild", "firstElementChild", "fullscreenElement", "lastChild", "lastElementChild",
    "nextElementSibling", "nextSibling", "parentElement", "parentNode", "pointerLockElement", "previousElementSibling", "previousSibling",
    "rootNode", "scripts", "closest", "getElementById", "getElementsByClassName", "getElementsByName", "getElementsByTagName",
    "getElementsByTagNameNS", "querySelector", "querySelectorAll",
];
const CLEANUP_LIBRARIES: [&str; 5] =
    ["@testing-library/preact", "@testing-library/react", "@testing-library/svelte", "@testing-library/vue", "@marko/testing-library"];

pub fn event_on_query<'v>(node: Node<'v>, tools: &mut Tools<'_, '_, 'v>) {
    let Some(callee) = node.node("callee").filter(|callee| callee.is("MemberExpression")) else { return };
    if !property_name(callee).is_some_and(|method| matches!(method.as_str(), "click" | "select" | "submit")) {
        return;
    }
    if !deepest_identifier(callee.node("object")).is_some_and(|query| is_built_in_query_name(&name(query))) {
        return;
    }
    if resolve(node, tools.scopes, tools.detect.setting.as_deref()).is_some() {
        let property = callee.node("property");
        let place = property.filter(|property| property.is("Literal")).or_else(|| deepest_identifier(property)).unwrap_or(node);
        tools.report(ACCESS, place, ACCESS_MESSAGE.to_string());
    }
}

/// Runs once for an expression statement around the member expression and once for a variable declarator around it.
pub fn member(node: Node, tools: &mut Tools) {
    let times = ["ExpressionStatement", "VariableDeclarator"].iter().filter(|kind| node.ancestors().any(|ancestor| ancestor.is(kind))).count();
    if times == 0 || !tools.detect.imported(true) {
        return;
    }
    if node.parent().is_some_and(|parent| parent.is("MemberExpression") && parent.node("object") == Some(node)) {
        return;
    }
    let Some(property) = identifier(node.node("property")).filter(|property| RETURNING_NODES.contains(&name(*property).as_str())) else { return };
    if is_named(node.node("object"), "props") {
        return;
    }
    for _ in 0..times {
        tools.report(ACCESS, property, ACCESS_MESSAGE.to_string());
    }
}

fn report_cleanup_uses(references: Vec<Node>, tools: &mut Tools) {
    for reference in references {
        let usage = reference.parent().filter(|usage| usage.is("MemberExpression")).and_then(|usage| usage.node("property"));
        if let Some(property) = usage.filter(|property| is_named(Some(*property), "cleanup")) {
            tools.report(CLEANUP, property, CLEANUP_MESSAGE.to_string());
        }
    }
}

fn report_candidate<'v>(module: Node<'v>, tools: &mut Tools<'_, '_, 'v>) {
    if module.is("ImportDeclaration") {
        let specifiers = module.nodes("specifiers");
        if let Some(local) = specifiers.first().filter(|first| first.is("ImportDefaultSpecifier")).and_then(|first| first.node("local")) {
            report_cleanup_uses(references_of(tools.scopes, local), tools);
        }
        let named = specifiers.iter().find(|specifier| specifier.is("ImportSpecifier") && identifier_name(specifier.node("imported")).as_deref() == Some("cleanup"));
        if let Some(named) = named {
            tools.report(CLEANUP, *named, CLEANUP_MESSAGE.to_string());
        }
        return;
    }
    let Some(declarator) = module.parent() else { return };
    let Some(pattern) = declarator.node("id").filter(|id| id.is("ObjectPattern")) else {
        return report_cleanup_uses(variable_references(tools.scopes, declarator), tools);
    };
    let properties = pattern.nodes("properties");
    if let Some(property) = properties.iter().find(|property| property.is("Property") && is_named(property.node("key"), "cleanup")) {
        tools.report(CLEANUP, *property, CLEANUP_MESSAGE.to_string());
    }
}

pub fn cleanup(tools: &mut Tools) {
    let libraries = tools.detect.libraries.clone();
    for library in libraries {
        if import_module_name(library).is_some_and(|module| CLEANUP_LIBRARIES.iter().any(|wanted| module.contains(wanted))) {
            report_candidate(library, tools);
        }
    }
    if let Some(custom) = tools.detect.custom {
        report_candidate(custom, tools);
    }
}

/// The names a declarator binds: `getDeclaredVariables(declarator)`.
pub fn declared_names(declarator: Node) -> Vec<String> {
    bindings(declarator).into_iter().map(name).collect()
}
