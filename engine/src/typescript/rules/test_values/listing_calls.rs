//! `listing-calls.mts` of `no-listing-order-in-assertions`: the directory listing and glob calls of `fs`, `glob`,
//! `fast-glob` and `globby` a file imports or requires, and the mocks that replace them.
use crate::typescript::rules::support::scope::{ScopeKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_quality::test_calls::chain_of;
use std::collections::HashMap;

#[derive(Clone, Copy, PartialEq, Debug)]
enum Kind {
    Fs,
    FsPromises,
    Glob,
    FastGlob,
    Globby,
}

pub struct ListingBindings {
    named: HashMap<String, String>,
    namespaces: HashMap<String, Kind>,
}

pub const MOCKING_MODULES: [&str; 3] = ["memfs", "mock-fs", "memfs/lib/volume"];
const MOCK_METHODS: [&str; 3] = ["mock", "doMock", "unstable_mockModule"];
const SPIES: [&str; 3] = ["spyOn", "stub", "replace"];
const NAMESPACE: &str = "*";

fn module_kind(source: &str) -> Option<Kind> {
    match source {
        "fs" | "node:fs" | "fs-extra" | "graceful-fs" | "fs-extra/esm" => Some(Kind::Fs),
        "fs/promises" | "node:fs/promises" => Some(Kind::FsPromises),
        "glob" => Some(Kind::Glob),
        "fast-glob" => Some(Kind::FastGlob),
        "globby" | "tinyglobby" => Some(Kind::Globby),
        _ => None,
    }
}

fn listing_names(kind: Kind) -> &'static [&'static str] {
    match kind {
        Kind::Fs => &["readdir", "readdirSync"],
        Kind::FsPromises => &["readdir"],
        Kind::Glob => &["glob", "globSync"],
        Kind::FastGlob => &["glob", "globSync", "sync", "async"],
        Kind::Globby => &["glob", "globSync", "globby", "globbySync"],
    }
}

fn lists(kind: Kind, name: Option<&str>) -> bool {
    name.is_some_and(|name| listing_names(kind).contains(&name))
}

pub fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn add_import(bindings: &mut ListingBindings, statement: Node) {
    let source = statement.node("source").and_then(|source| source.text("value")).unwrap_or_default();
    let Some(kind) = module_kind(&source).filter(|_| statement.text("importKind").as_deref() != Some("type")) else { return };
    for specifier in statement.nodes("specifiers") {
        let Some(local) = name_of(specifier.node("local")) else { continue };
        if specifier.is("ImportSpecifier") {
            let imported = name_of(specifier.node("imported")).unwrap_or_default();
            if lists(kind, Some(&imported)) {
                bindings.named.insert(local, imported);
            }
            continue;
        }
        bindings.namespaces.insert(local.clone(), kind);
        if specifier.is("ImportDefaultSpecifier") && matches!(kind, Kind::FastGlob | Kind::Globby) {
            bindings.named.insert(local, NAMESPACE.to_string());
        }
    }
}

fn required_module(init: Option<Node>) -> Option<String> {
    let call = init.and_then(|init| if init.is("AwaitExpression") { init.node("argument") } else { Some(init) });
    let call = call.filter(|call| call.is("CallExpression"))?;
    call.node("callee").filter(|callee| callee.is("Identifier") && callee.name().as_deref() == Some("require"))?;
    let first = call.list("arguments").first().copied().flatten().filter(|first| first.is("Literal"))?;
    matches!(first.get("value"), Value::Text(..)).then(|| first.text("value").map(|value| value.into_owned())).flatten()
}

fn add_require(bindings: &mut ListingBindings, declarator: Node) {
    let Some(kind) = required_module(declarator.node("init")).and_then(|source| module_kind(&source)) else { return };
    let Some(id) = declarator.node("id") else { return };
    if id.is("Identifier") {
        bindings.namespaces.extend(name_of(Some(id)).map(|name| (name, kind)));
        return;
    }
    if !id.is("ObjectPattern") {
        return;
    }
    for property in id.nodes("properties").into_iter().filter(|property| property.is("Property")) {
        if let (Some(imported), Some(local)) = (name_of(property.node("key")), name_of(property.node("value")))
            && lists(kind, Some(&imported))
        {
            bindings.named.insert(local, imported);
        }
    }
}

fn string_argument(node: Option<Node>) -> Option<String> {
    let node = node.filter(|node| node.is("Literal") && matches!(node.get("value"), Value::Text(..)))?;
    node.text("value").map(|value| value.into_owned())
}

/// `mocksListing`.
pub fn mocks_listing(call: Node) -> bool {
    let callee = call.node("callee");
    let method = callee.filter(|callee| callee.is("MemberExpression")).and_then(|callee| name_of(callee.node("property"))).unwrap_or_default();
    let arguments = call.list("arguments");
    let (first, second) = (arguments.first().copied().flatten(), arguments.get(1).copied().flatten());
    if MOCK_METHODS.contains(&method.as_str()) {
        let mocked = string_argument(first).unwrap_or_default();
        return module_kind(&mocked).is_some() || MOCKING_MODULES.contains(&mocked.as_str());
    }
    let listed = [Kind::Fs, Kind::FsPromises, Kind::Glob, Kind::FastGlob, Kind::Globby];
    SPIES.contains(&method.as_str()) && string_argument(second).is_some_and(|name| listed.iter().any(|kind| lists(*kind, Some(&name))))
}

/// `listingBindings`.
pub fn listing_bindings(program: Node) -> ListingBindings {
    let mut bindings = ListingBindings { named: HashMap::new(), namespaces: HashMap::new() };
    for statement in program.nodes("body") {
        if statement.is("ImportDeclaration") {
            add_import(&mut bindings, statement);
        }
        if statement.is("VariableDeclaration") {
            for declarator in statement.nodes("declarations") {
                add_require(&mut bindings, declarator);
            }
        }
    }
    bindings
}

fn namespace_kind(bindings: &ListingBindings, node: Node) -> Option<Kind> {
    if node.is("Identifier") {
        return bindings.namespaces.get(name_of(Some(node))?.as_str()).copied();
    }
    let object = node.node("object").filter(|object| node.is("MemberExpression") && object.is("Identifier"));
    let promises = name_of(node.node("property")).as_deref() == Some("promises")
        && object.and_then(|object| name_of(Some(object))).is_some_and(|name| bindings.namespaces.get(&name) == Some(&Kind::Fs));
    promises.then_some(Kind::FsPromises)
}

fn is_top_level(scopes: &Scopes, node: Node) -> bool {
    let symbol = if node.is("Identifier") { super::find_variable(scopes, node) } else { None };
    symbol.and_then(|symbol| scopes.scope_of(symbol)).is_some_and(|(kind, _)| matches!(kind, ScopeKind::Module | ScopeKind::Global))
}

/// `isListingCall`.
pub fn is_listing_call(scopes: &Scopes, bindings: &ListingBindings, node: Node) -> bool {
    let Some(callee) = node.node("callee").filter(|_| node.is("CallExpression")) else { return false };
    if callee.is("Identifier") {
        return is_top_level(scopes, callee) && name_of(Some(callee)).is_some_and(|name| bindings.named.contains_key(&name));
    }
    if !callee.is("MemberExpression") {
        return false;
    }
    let root = chain_of(Some(callee), |link| if link.is("MemberExpression") { link.node("object") } else { None }).last().copied().unwrap_or(callee);
    let kind = callee.node("object").and_then(|object| namespace_kind(bindings, object));
    is_top_level(scopes, root) && kind.is_some_and(|kind| lists(kind, name_of(callee.node("property")).as_deref()))
}
