//! `nodes.mts` of the unowned-async rule: the assertion calls of a test file, the bindings of the modules it imports
//! and the walk over a subtree in visiting order.
use crate::typescript::rules::security_values::string_value;
use crate::typescript::rules::support::scope::{Def, Scopes};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_quality::test_calls::chain_of;
use std::collections::{HashMap, HashSet};

const ASSERTION_ROOTS: &[&str] = &["expect", "assert", "should"];
const NOT_ASSERTIONS: &[&str] = &[
    "any", "anything", "objectContaining", "arrayContaining", "stringContaining", "stringMatching", "closeTo", "extend",
    "addSnapshotSerializer", "addEqualityTesters", "getState", "setState", "assertions", "hasAssertions", "use", "should",
];
const CHAINED_ASSERTION_PROPERTIES: &[&str] = &["assert", "should", "expect"];

#[derive(Default)]
pub struct ModuleBindings {
    pub named: HashMap<String, String>,
    pub namespaces: HashSet<String>,
}

pub struct FileBindings {
    pub assertion_names: HashSet<String>,
    pub expects: ModuleBindings,
    pub timers: ModuleBindings,
    pub callbacks: ModuleBindings,
    pub asserts: ModuleBindings,
    pub node_test: ModuleBindings,
    pub rx: ModuleBindings,
}

pub struct Env<'e, 'a, 's> {
    pub scopes: &'e Scopes<'a, 's>,
    pub bindings: &'e FileBindings,
    pub program: Node<'s>,
}

pub fn name(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn imported_name(specifier: Node) -> Option<String> {
    let imported = specifier.node("imported")?;
    if imported.is("Identifier") { name(Some(imported)) } else { imported.text("value").map(|value| value.into_owned()) }
}

fn add_import(statement: Node, bindings: &mut ModuleBindings) {
    if statement.text("importKind").as_deref() == Some("type") {
        return;
    }
    for specifier in statement.nodes("specifiers") {
        let Some(local) = name(specifier.node("local")) else { continue };
        if specifier.is("ImportSpecifier") {
            if let Some(imported) = imported_name(specifier) {
                bindings.named.insert(local, imported);
            }
        } else {
            bindings.namespaces.insert(local);
        }
    }
}

fn is_require_of(init: Option<Node>, modules: &[&str]) -> bool {
    let Some(init) = init.filter(|init| init.is("CallExpression")) else { return false };
    let callee = init.node("callee").filter(|callee| callee.is("Identifier"));
    let source = string_value(init.list("arguments").first().copied().flatten());
    callee.is_some_and(|callee| callee.name().as_deref() == Some("require")) && source.is_some_and(|source| modules.contains(&source.as_str()))
}

fn add_require(pattern: Node, bindings: &mut ModuleBindings) {
    if pattern.is("Identifier") {
        bindings.namespaces.extend(name(Some(pattern)));
    }
    if !pattern.is("ObjectPattern") {
        return;
    }
    for property in pattern.nodes("properties").into_iter().filter(|property| property.is("Property")) {
        let key = property.node("key").filter(|key| key.is("Identifier"));
        let value = property.node("value").filter(|value| value.is("Identifier"));
        if let (Some(key), Some(value)) = (name(key), name(value)) {
            bindings.named.insert(value, key);
        }
    }
}

/// `moduleBindings`: what the file imports or requires from the modules, by local name.
pub fn module_bindings(program: Node, modules: &[&str]) -> ModuleBindings {
    let mut bindings = ModuleBindings::default();
    for statement in program.nodes("body") {
        let source = statement.node("source").and_then(|source| source.text("value"));
        if statement.is("ImportDeclaration") && source.is_some_and(|source| modules.contains(&source.as_ref())) {
            add_import(statement, &mut bindings);
        }
        if !statement.is("VariableDeclaration") {
            continue;
        }
        for declarator in statement.nodes("declarations") {
            if is_require_of(declarator.node("init"), modules)
                && let Some(id) = declarator.node("id")
            {
                add_require(id, &mut bindings);
            }
        }
    }
    bindings
}

/// `importedCalleeName`.
pub fn imported_callee_name(callee: Node, bindings: &ModuleBindings) -> Option<String> {
    if callee.is("Identifier") {
        return bindings.named.get(&name(Some(callee))?).cloned();
    }
    let object = callee.node("object").filter(|object| object.is("Identifier"))?;
    let property = callee.node("property").filter(|property| property.is("Identifier"))?;
    let namespaced = callee.is("MemberExpression") && !callee.flag("computed") && bindings.namespaces.contains(&name(Some(object))?);
    if namespaced { name(Some(property)) } else { None }
}

pub fn in_set(set: &[&str], name: Option<&str>) -> bool {
    name.is_some_and(|name| set.contains(&name))
}

/// `propertyName`: the property of a member, a string literal when it is computed.
pub fn property_name(node: Option<Node>) -> Option<String> {
    let node = node.filter(|node| node.is("MemberExpression"))?;
    let property = node.node("property")?;
    if !node.flag("computed") {
        return if property.is("Identifier") { name(Some(property)) } else { None };
    }
    let text = property.is("Literal") && matches!(property.get("value"), Value::Text(..));
    if text { property.text("value").map(|value| value.into_owned()) } else { None }
}

fn callee_links(callee: Node) -> Vec<Node> {
    chain_of(Some(callee), |current| match current.kind() {
        "CallExpression" => current.node("callee"),
        "MemberExpression" => current.node("object"),
        _ => None,
    })
}

pub fn root_name(node: Node) -> Option<String> {
    let root = *callee_links(node).last()?;
    if root.is("ThisExpression") {
        return Some("this".into());
    }
    if root.is("Identifier") { name(Some(root)) } else { None }
}

fn direct_members(links: &[Node]) -> Vec<Option<String>> {
    let after_root: Vec<Node> = links.iter().rev().skip(1).copied().collect();
    let direct = match after_root.iter().position(|link| link.is("CallExpression")) {
        Some(first_call) => &after_root[..first_call],
        None => &after_root[..],
    };
    direct.iter().map(|link| property_name(Some(*link))).collect()
}

fn is_assert_root(name: &str, bindings: &FileBindings) -> bool {
    ASSERTION_ROOTS.contains(&name)
        || bindings.expects.named.get(name).is_some_and(|imported| ASSERTION_ROOTS.contains(&imported.as_str()))
        || bindings.assertion_names.contains(name)
        || bindings.asserts.named.contains_key(name)
        || bindings.asserts.namespaces.contains(name)
}

/// `isAssertion`.
pub fn is_assertion(node: Node, bindings: &FileBindings) -> bool {
    if !node.is("CallExpression") {
        return false;
    }
    let Some(callee) = node.node("callee") else { return false };
    let links = callee_links(callee);
    let Some(root) = links.last().copied().filter(|root| root.is("Identifier")) else { return false };
    let root_name = name(Some(root)).unwrap_or_default();
    if root_name == "console" {
        return false;
    }
    if is_assert_root(&root_name, bindings) {
        return !direct_members(&links).iter().any(|member| in_set(NOT_ASSERTIONS, member.as_deref()));
    }
    links.iter().any(|link| in_set(CHAINED_ASSERTION_PROPERTIES, property_name(Some(*link)).as_deref()))
}

/// `countsAsAssertion`: an assertion that is not the callee chain of another one.
pub fn counts_as_assertion(node: Node, bindings: &FileBindings) -> bool {
    is_assertion(node, bindings)
        && !node.node("callee").is_some_and(|callee| callee_links(callee).iter().any(|link| link.is("CallExpression") && is_assertion(*link, bindings)))
}

/// `nodesIn`: the root and every node under it that `enter` lets in, breadth first.
pub fn nodes_in<'v>(root: Option<Node<'v>>, enter: impl Fn(Node<'v>) -> bool) -> Vec<Node<'v>> {
    let mut pending: Vec<Node> = root.filter(|root| enter(*root)).into_iter().collect();
    let mut index = 0;
    while index < pending.len() {
        let children = pending[index].children();
        pending.extend(children.into_iter().filter(|child| enter(*child)));
        index += 1;
    }
    pending
}

pub fn all_nodes(root: Option<Node>) -> Vec<Node> {
    nodes_in(root, |_| true)
}

/// `variable.references` without the initializing write, as identifiers.
pub fn uses<'s>(scopes: &Scopes<'_, 's>, symbol: oxc_semantic::SymbolId) -> Vec<Node<'s>> {
    let names: Vec<Node> = scopes.defs(symbol).iter().map(|definition: &Def| definition.name).collect();
    scopes.references(symbol).into_iter().filter(|reference| !(reference.write && !reference.read && names.contains(&reference.identifier))).map(|reference| reference.identifier).collect()
}

/// `findVariable` then its uses.
pub fn uses_of<'s>(scopes: &Scopes<'_, 's>, identifier: Option<Node<'s>>) -> Vec<Node<'s>> {
    let Some(identifier) = identifier.filter(|identifier| identifier.is("Identifier")) else { return Vec::new() };
    let Some(name) = identifier.name() else { return Vec::new() };
    scopes.variable_by_name(&name, identifier.start()).map(|symbol| uses(scopes, symbol)).unwrap_or_default()
}
