//! `moduleBindings` and `importedCalleeName` for the modules whose `*Sync` calls do observable work.
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::testing_library::nodes::string_literal;
use std::collections::{HashMap, HashSet};

const SYNC_MODULES: [&str; 11] = [
    "fs", "node:fs", "graceful-fs", "fs-extra", "child_process", "node:child_process", "crypto", "node:crypto", "zlib", "node:zlib",
    "execa",
];

#[derive(Default)]
pub struct Bindings {
    named: HashMap<String, String>,
    namespaces: HashSet<String>,
}

fn text(node: Node, key: &str) -> Option<String> {
    node.text(key).map(|text| text.into_owned())
}

fn imported_name(specifier: Node) -> Option<String> {
    let imported = specifier.node("imported")?;
    if imported.is("Identifier") { text(imported, "name") } else { text(imported, "value") }
}

fn add_import(statement: Node, bindings: &mut Bindings) {
    if text(statement, "importKind").as_deref() == Some("type") {
        return;
    }
    for specifier in statement.nodes("specifiers") {
        let Some(local) = specifier.node("local").and_then(|local| text(local, "name")) else { continue };
        if specifier.is("ImportSpecifier") {
            if let Some(imported) = imported_name(specifier) {
                bindings.named.insert(local, imported);
            }
        } else {
            bindings.namespaces.insert(local);
        }
    }
}

fn string_value(node: Option<Node>) -> Option<String> {
    let node = node?;
    if node.is("TemplateLiteral") {
        let quasis = node.nodes("quasis");
        return match (node.nodes("expressions").is_empty(), quasis.first()) {
            (true, Some(first)) => match first.get("value") {
                crate::typescript::rules::support::view::Value::Node(index) => text(node.view.at(index), "cooked"),
                _ => None,
            },
            _ => None,
        };
    }
    string_literal(Some(node))
}

fn is_require_of(init: Option<Node>) -> bool {
    let Some(init) = init.filter(|init| init.is("CallExpression")) else { return false };
    let callee = init.node("callee");
    let source = string_value(init.nodes("arguments").first().copied());
    callee.is_some_and(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("require"))
        && source.is_some_and(|source| SYNC_MODULES.contains(&source.as_str()))
}

fn add_require(pattern: Node, bindings: &mut Bindings) {
    if pattern.is("Identifier") {
        if let Some(name) = text(pattern, "name") {
            bindings.namespaces.insert(name);
        }
    }
    if !pattern.is("ObjectPattern") {
        return;
    }
    for property in pattern.nodes("properties") {
        let (key, value) = (property.node("key"), property.node("value"));
        if property.is("Property")
            && let (Some(key), Some(value)) = (key, value)
            && key.is("Identifier")
            && value.is("Identifier")
            && let (Some(key), Some(value)) = (text(key, "name"), text(value, "name"))
        {
            bindings.named.insert(value, key);
        }
    }
}

pub fn module_bindings(program: Node) -> Bindings {
    let mut bindings = Bindings::default();
    for statement in program.nodes("body") {
        if statement.is("ImportDeclaration") && string_literal(statement.node("source")).is_some_and(|source| SYNC_MODULES.contains(&source.as_str())) {
            add_import(statement, &mut bindings);
        }
        if statement.is("VariableDeclaration") {
            for declarator in statement.nodes("declarations") {
                if is_require_of(declarator.node("init"))
                    && let Some(id) = declarator.node("id")
                {
                    add_require(id, &mut bindings);
                }
            }
        }
    }
    bindings
}

/// `importedCalleeName`: the imported function a callee names, by binding name alone.
pub fn imported_callee_name(callee: Node, bindings: &Bindings) -> Option<String> {
    if callee.is("Identifier") {
        return bindings.named.get(callee.name()?.as_ref()).cloned();
    }
    if callee.is("MemberExpression") && !callee.flag("computed") {
        let object = callee.node("object").filter(|object| object.is("Identifier"))?;
        let property = callee.node("property").filter(|property| property.is("Identifier"))?;
        if bindings.namespaces.contains(object.name()?.as_ref()) {
            return property.name().map(|name| name.into_owned());
        }
    }
    None
}
