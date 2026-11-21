//! `resolveToTestingLibraryFn`: whether the head of a call chain was imported from a Testing Library module.
use super::detect::is_testing_library_module;
use super::nodes::{accessor, identifier, is_kind, is_named, name, string_literal, string_node};
use crate::typescript::rules::support::scope::{Def, DefKind, Scopes};
use crate::typescript::rules::support::view::Node;

pub struct Imported {
    pub original: Option<String>,
    pub local: String,
}

struct Details {
    source: String,
    imported: Option<String>,
    local: String,
}

fn import_details(definition: &Def) -> Option<Details> {
    let specifier = definition.node;
    let declaration = specifier.parent()?;
    let source = || string_literal(declaration.node("source"));
    let local = || specifier.node("local").map(name);
    match specifier.kind() {
        "ImportDefaultSpecifier" => Some(Details { source: source()?, imported: None, local: local()? }),
        "ImportSpecifier" if declaration.text("importKind").as_deref() != Some("type") => {
            let imported = specifier.node("imported")?;
            let original = imported.name().or_else(|| imported.text("value"))?.into_owned();
            Some(Details { source: source()?, imported: Some(original), local: local()? })
        }
        _ => None,
    }
}

fn variable_details(definition: &Def) -> Option<Details> {
    let init = definition.node.node("init")?;
    let source = if init.is("CallExpression") && is_named(init.node("callee"), "require") {
        init.nodes("arguments").first().copied()
    } else if init.is("AwaitExpression") && is_kind(init.node("argument"), "ImportExpression") {
        init.node("argument").and_then(|import| import.node("source"))
    } else {
        None
    };
    let source = string_node(source)?;
    let property = definition.name.parent().filter(|parent| parent.is("Property"))?;
    Some(Details { source, imported: Some(accessor(property.node("key"))?), local: name(definition.name) })
}

fn chain_head(node: Node) -> Option<Node> {
    if accessor(Some(node)).is_some() {
        return Some(node);
    }
    match node.kind() {
        "MemberExpression" => {
            let head = chain_head(node.node("object")?)?;
            chain_head(node.node("property")?).map(|_| head)
        }
        "CallExpression" => chain_head(node.node("callee")?),
        _ => None,
    }
}

pub fn resolve(node: Node, scopes: &Scopes, setting: Option<&str>) -> Option<Imported> {
    let head = identifier(chain_head(node))?;
    let definitions = scopes.defs(scopes.variable_named(head)?);
    let last = definitions.last()?;
    let details = match last.kind {
        DefKind::Variable => variable_details(last),
        DefKind::ImportBinding => import_details(last),
        _ => None,
    }?;
    (details.local == name(head) && is_testing_library_module(&details.source, setting))
        .then_some(Imported { original: details.imported, local: details.local })
}
