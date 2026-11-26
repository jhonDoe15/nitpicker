//! `variableOf`, `libraryBinding` and `calleeChain`: which package an identifier was taken from, and the dotted
//! names a callee reads through.
use crate::typescript::rules::support::scope::{Def, DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::testing_library::nodes::string_literal;

pub struct Binding {
    pub source: String,
    pub name: Option<String>,
}

pub fn property_name(node: Node) -> Option<String> {
    if !node.is("MemberExpression") {
        return None;
    }
    let property = node.node("property")?;
    if !node.flag("computed") && property.is("Identifier") {
        return property.name().map(|name| name.into_owned());
    }
    string_literal(Some(property))
}

/// `variableOf(...)?.defs`: the declarations of the name an identifier stands for, looked up along the scopes.
pub fn definitions<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>) -> Option<Vec<Def<'s>>> {
    let name = identifier.name()?;
    scopes.variable_by_name(&name, identifier.start()).map(|symbol| scopes.defs(symbol))
}

fn is_from_packages(source: &str, packages: &[&str]) -> bool {
    packages.iter().any(|name| source == *name || source.strip_prefix(name).is_some_and(|rest| rest.starts_with('/')))
}

fn require_source(init: Option<Node>) -> Option<String> {
    let init = init?;
    let call = if init.is("AwaitExpression") { init.node("argument")? } else { init };
    if !call.is("CallExpression") {
        return None;
    }
    call.node("callee").filter(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("require"))?;
    string_literal(call.nodes("arguments").first().copied())
}

fn key_name(property: Node) -> Option<String> {
    let key = property.node("key")?;
    if key.is("Identifier") {
        return key.name().map(|name| name.into_owned());
    }
    string_literal(Some(key))
}

fn same(left: Node, right: Node) -> bool {
    left == right || (left.is("Identifier") && right.is("Identifier") && left.start() == right.start() && left.end() == right.end())
}

fn destructured_property<'v>(pattern: Node<'v>, name: Node<'v>) -> Option<Node<'v>> {
    pattern.nodes("properties").into_iter().filter(|property| property.is("Property")).find(|property| {
        let Some(value) = property.node("value") else { return false };
        same(value, name) || (value.is("AssignmentPattern") && value.node("left").is_some_and(|left| same(left, name)))
    })
}

fn of_definition(definition: &Def) -> Option<Binding> {
    let node = definition.node;
    if definition.kind == DefKind::ImportBinding {
        if node.is("TSImportEqualsDeclaration") {
            let reference = node.node("moduleReference").filter(|reference| reference.is("TSExternalModuleReference"));
            let source = reference.and_then(|reference| reference.node("expression")).and_then(|expression| string_literal(Some(expression)));
            return source.map(|source| Binding { source, name: None });
        }
        let source = string_literal(node.parent()?.node("source"))?;
        let imported = node.node("imported").filter(|imported| node.is("ImportSpecifier") && imported.is("Identifier"));
        return Some(Binding { source, name: imported.and_then(|imported| imported.name()).map(|name| name.into_owned()) });
    }
    if definition.kind != DefKind::Variable {
        return None;
    }
    let source = require_source(node.node("init"))?;
    let id = node.node("id").filter(|id| id.is("ObjectPattern"));
    let property = id.and_then(|id| destructured_property(id, definition.name));
    Some(Binding { source, name: property.and_then(key_name) })
}

/// `libraryBinding`: the first declaration of the variable that comes from one of the packages (or a subpath).
pub fn library_binding<'s>(scopes: &Scopes<'_, 's>, identifier: Node<'s>, packages: &[&str]) -> Option<Binding> {
    let definitions = definitions(scopes, identifier)?;
    definitions.iter().filter_map(of_definition).find(|binding| is_from_packages(&binding.source, packages))
}

/// `calleeChain`: the root of a chain of member accesses and the names read from it, outermost last.
pub fn callee_chain(callee: Node) -> Option<(Node, Vec<String>)> {
    let mut nodes = vec![callee];
    while let Some(next) = nodes.last().filter(|node| node.is("MemberExpression")).and_then(|node| node.node("object")) {
        nodes.push(next);
    }
    let root = *nodes.last()?;
    let mut names = Vec::new();
    for member in nodes[..nodes.len() - 1].iter().rev() {
        names.push(property_name(*member)?);
    }
    Some((root, names))
}

fn exported_name(binding: &Binding) -> String {
    if let Some(name) = &binding.name {
        return name.clone();
    }
    let skip = if binding.source.starts_with('@') { 2 } else { 1 };
    let last = binding.source.split('/').skip(skip).last();
    match last {
        Some(last) if last != "fp" => last.to_string(),
        _ => String::new(),
    }
}

/// `bindingOf`: the library binding of an identifier node.
pub fn binding_of<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>, packages: &[&str]) -> Option<Binding> {
    if node.is("Identifier") { library_binding(scopes, node, packages) } else { None }
}

/// `libraryPath`: the dotted path of a callee, from the name the library exports it under.
pub fn library_path<'s>(scopes: &Scopes<'_, 's>, callee: Node<'s>, packages: &[&str]) -> Option<String> {
    let (root, names) = callee_chain(callee)?;
    let binding = binding_of(scopes, root, packages)?;
    let owner = exported_name(&binding);
    let mut path: Vec<String> = if owner.is_empty() { Vec::new() } else { vec![owner] };
    path.extend(names);
    Some(path.join("."))
}
