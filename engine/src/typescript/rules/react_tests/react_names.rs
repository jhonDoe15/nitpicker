//! The names that stand for the React module in a file, and the expressions that load it.
use super::static_name;
use crate::typescript::rules::support::view::{Node, View};
use crate::typescript::rules::testing_library::nodes::string_literal;
use std::collections::HashSet;

const REACT: &str = "react";
const LOADERS: &[&str] = &["require", "importActual", "requireActual"];
const WRAPPERS: &[&str] = &["ChainExpression", "TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression", "TSTypeAssertion"];

fn inner(node: Node) -> Option<Node> {
    if node.is("AwaitExpression") {
        return node.node("argument");
    }
    if WRAPPERS.contains(&node.kind()) {
        return node.node("expression");
    }
    let default = node.is("MemberExpression") && !node.flag("computed") && node.node("property").and_then(|property| property.name()).as_deref() == Some("default");
    if default { node.node("object") } else { None }
}

fn is_react_literal(node: Option<Node>) -> bool {
    string_literal(node).as_deref() == Some(REACT)
}

fn loads_react(node: Node) -> bool {
    if node.is("ImportExpression") {
        return is_react_literal(node.node("source"));
    }
    if !node.is("CallExpression") {
        return false;
    }
    let Some(callee) = node.node("callee") else { return false };
    let name = if callee.is("Identifier") {
        callee.name()
    } else if callee.is("MemberExpression") && !callee.flag("computed") {
        callee.node("property").and_then(|property| property.name())
    } else {
        None
    };
    name.is_some_and(|name| LOADERS.contains(&name.as_ref())) && is_react_literal(node.list("arguments").first().copied().flatten())
}

pub fn is_react_expression(node: Option<Node>, names: &HashSet<String>) -> bool {
    let Some(mut core) = node else { return false };
    while let Some(next) = inner(core) {
        core = next;
    }
    if core.is("Identifier") {
        return core.name().is_some_and(|name| names.contains(name.as_ref()));
    }
    loads_react(core)
}

fn imported_names(statement: Node) -> Vec<String> {
    let local = |node: Node| node.node("local").and_then(|local| local.name()).map(|name| name.into_owned());
    if statement.is("TSImportEqualsDeclaration") {
        let reference = statement.node("moduleReference").filter(|reference| reference.is("TSExternalModuleReference"));
        let react = is_react_literal(reference.and_then(|reference| reference.node("expression")));
        return statement.node("id").and_then(|id| id.name()).filter(|_| react).map(|name| name.into_owned()).into_iter().collect();
    }
    if !statement.is("ImportDeclaration") || !is_react_literal(statement.node("source")) {
        return Vec::new();
    }
    let whole = |specifier: &Node| !specifier.is("ImportSpecifier") || specifier.node("imported").and_then(|imported| imported.name()).as_deref() == Some("default");
    statement.nodes("specifiers").into_iter().filter(whole).filter_map(local).collect()
}

/// `reactBindingNames`: the seed, what the file imports as React, and every variable set to one of those.
pub fn binding_names(view: &View, seed: &[&str]) -> HashSet<String> {
    let mut names: HashSet<String> = seed.iter().map(|name| name.to_string()).collect();
    names.extend(view.nodes().flat_map(imported_names));
    let mut declarators: Vec<Node> = view.nodes().filter(|node| node.is("VariableDeclarator") && node.node("id").is_some_and(|id| id.is("Identifier"))).collect();
    declarators.sort_by_key(|declarator| declarator.start());
    for declarator in declarators {
        if is_react_expression(declarator.node("init"), &names) {
            names.extend(declarator.node("id").and_then(|id| id.name()).map(|name| name.into_owned()));
        }
    }
    names
}

pub fn spied_hook_name(property: Node) -> Option<String> {
    static_name(property).filter(|name| super::is_hook_name(name))
}
