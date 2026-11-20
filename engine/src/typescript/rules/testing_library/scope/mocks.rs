//! The modules a test file replaces at its top level, by the mocking call of each test runner and mocking library.
use super::super::nodes::{identifier_name, string_literal};
use crate::typescript::rules::support::view::Node;
use std::collections::HashMap;

const DEFAULT: &str = "default";
const WHOLE_MODULE: &[&str] = &[DEFAULT, "*"];

const SINON_FUNCTIONS: &[&str] = &["useFakeTimers", "createSandbox", "restore", "stub", "spy", "replace", "replaceGetter", "replaceSetter"];
const TIMER_FUNCTIONS: &[&str] = &["install", "createClock", "withGlobal"];

/// Module, the imported names that are the API object, and the kind of that object.
const IMPORTS: &[(&str, &[&str], &str)] = &[
    ("vitest", &["vi", "vitest"], "vitest"),
    ("@jest/globals", &["jest"], "jest"),
    ("node:test", &["mock"], "node"),
    ("mock-require", &[DEFAULT], "mockRequire"),
    ("testdouble", WHOLE_MODULE, "testdouble"),
    ("quibble", &[DEFAULT], "quibble"),
    ("sinon", WHOLE_MODULE, "sinon"),
    ("@sinonjs/fake-timers", WHOLE_MODULE, "fakeTimers"),
    ("proxyquire", &[DEFAULT], "proxyquire"),
    ("esmock", &[DEFAULT], "esmock"),
];

fn spec_for(source: &str) -> Option<(&'static [&'static str], &'static str)> {
    if source.starts_with("@testing-library/") {
        return Some((&["waitFor"], "waitFor"));
    }
    IMPORTS.iter().find(|(module, _, _)| *module == source).map(|(_, names, kind)| (*names, *kind))
}

fn module_mocks(kind: &str) -> &'static [&'static str] {
    match kind {
        "vitest" => &["mock", "doMock"],
        "jest" => &["mock", "doMock", "unstable_mockModule", "setMock"],
        "node" => &["module"],
        "testdouble" => &["replace"],
        "quibble" => &["esm"],
        _ => &[],
    }
}

fn loader_mocks(kind: &str) -> Option<&'static [&'static str]> {
    match kind {
        "proxyquire" => Some(&["load"]),
        "esmock" => Some(&["strict", "strictest", "partial", "p"]),
        _ => None,
    }
}

/// `requiredLiteral`: the module of a direct `require('module')`.
pub fn required(node: Option<Node>) -> Option<String> {
    let call = node.filter(|node| node.is("CallExpression"))?;
    identifier_name(call.node("callee")).filter(|name| name == "require")?;
    string_literal(call.list("arguments").first().copied().flatten())
}

fn chained_require(init: Option<Node>) -> Option<Node> {
    let mut current = init.filter(|node| node.is("CallExpression"))?;
    while let Some(object) = current.node("callee").filter(|callee| current.is("CallExpression") && callee.is("MemberExpression")).and_then(|callee| callee.node("object")) {
        current = object;
    }
    Some(current)
}

pub fn member_name(node: Node) -> Option<String> {
    let property = node.filter_kind("MemberExpression")?.node("property")?;
    if node.flag("computed") { string_literal(Some(property)) } else { identifier_name(Some(property)) }
}

trait Kinded<'v> {
    fn filter_kind(self, kind: &str) -> Option<Node<'v>>;
}

impl<'v> Kinded<'v> for Node<'v> {
    fn filter_kind(self, kind: &str) -> Option<Node<'v>> {
        Some(self).filter(|node| node.is(kind))
    }
}

/// `runnerApisOf`: the names that stand for a runner or mocking API in this file.
pub struct Apis(HashMap<String, &'static str>, HashMap<String, (&'static str, String)>);

/// A module a call replaces: its name when the call spells it out, and what replaces it.
pub struct Mocked<'v> {
    pub name: Option<String>,
    pub replacement: Option<Node<'v>>,
}

fn functions_of(kind: &str) -> &'static [&'static str] {
    match kind {
        "sinon" => SINON_FUNCTIONS,
        "fakeTimers" => TIMER_FUNCTIONS,
        _ => &[],
    }
}

fn produced(kind: &str, method: &str) -> Option<&'static str> {
    match (kind, method) {
        ("sinon", "createSandbox") => Some("sinon"),
        ("sinon", "useFakeTimers") | ("fakeTimers", "install" | "createClock") => Some("clock"),
        _ => None,
    }
}

impl Apis {
    pub fn of(program: Node) -> Apis {
        let globals = HashMap::from([("vi".to_string(), "vitest"), ("vitest".to_string(), "vitest"), ("jest".to_string(), "jest"), ("sinon".to_string(), "sinon")]);
        let mut apis = Apis(globals, HashMap::new());
        let body = program.nodes("body");
        for import in body.iter().filter(|statement| statement.is("ImportDeclaration") && statement.text("importKind").as_deref() != Some("type")) {
            apis.import(*import);
        }
        for declarator in body.iter().filter(|statement| statement.is("VariableDeclaration")).flat_map(|statement| statement.nodes("declarations")) {
            apis.declarator(declarator);
        }
        apis
    }

    fn import(&mut self, node: Node) {
        let Some((names, kind)) = node.node("source").and_then(|source| string_literal(Some(source))).and_then(|source| spec_for(&source)) else { return };
        for specifier in node.nodes("specifiers") {
            let imported = match specifier.kind() {
                "ImportDefaultSpecifier" => Some(DEFAULT.to_string()),
                "ImportNamespaceSpecifier" => Some("*".to_string()),
                _ => specifier.node("imported").and_then(|imported| imported.name().map(|name| name.into_owned()).or_else(|| string_literal(Some(imported)))),
            };
            if let (Some(imported), Some(local)) = (imported, identifier_name(specifier.node("local"))) {
                self.bind(names, kind, imported, local);
            }
        }
    }

    fn bind(&mut self, names: &[&str], kind: &'static str, name: String, local: String) {
        if names.contains(&name.as_str()) {
            self.0.insert(local, kind);
        } else if functions_of(kind).contains(&name.as_str()) {
            self.1.insert(local, (kind, name));
        }
    }

    fn declarator(&mut self, node: Node) {
        self.required_bindings(node);
        let made = node.node("init").filter(|init| init.is("CallExpression")).and_then(|init| init.node("callee")).and_then(|callee| self.called(callee));
        let kind = made.and_then(|(kind, method)| produced(kind?, &method.unwrap_or_default()));
        if let (Some(local), Some(kind)) = (identifier_name(node.node("id")), kind) {
            self.0.insert(local, kind);
        }
    }

    /// `calledMethod`: the API a callee belongs to and the method it names.
    pub fn called(&self, callee: Node) -> Option<(Option<&'static str>, Option<String>)> {
        if let Some((kind, method)) = callee.name().filter(|_| callee.is("Identifier")).and_then(|name| self.1.get(name.as_ref())) {
            return Some((Some(*kind), Some(method.clone())));
        }
        let object = callee.filter_kind("MemberExpression")?.node("object")?;
        Some((self.kind_of_object(object), member_name(callee)))
    }

    fn required_bindings(&mut self, node: Node) {
        let init = node.node("init");
        let direct = required(init).and_then(|source| spec_for(&source));
        let chained = || required(chained_require(init)).and_then(|source| spec_for(&source)).filter(|(_, kind)| *kind == "proxyquire");
        let Some((names, kind)) = direct.or_else(chained) else { return };
        let Some(id) = node.node("id") else { return };
        if id.is("ObjectPattern") {
            for property in id.nodes("properties").into_iter().filter(|property| property.is("Property")) {
                if let (Some(key), Some(value)) = (identifier_name(property.node("key")), identifier_name(property.node("value"))) {
                    self.bind(names, kind, key, value);
                }
            }
        } else if let Some(local) = identifier_name(Some(id)).filter(|_| names.contains(&DEFAULT)) {
            self.0.insert(local, kind);
        }
    }

    fn kind_of_object(&self, node: Node) -> Option<&'static str> {
        if node.is("CallExpression") {
            return None;
        }
        if node.is("Identifier") {
            return self.0.get(node.name()?.as_ref()).copied();
        }
        (member_name(node).as_deref() == Some("mock")).then_some("node")
    }

    /// `moduleMocks`: the names of the modules this call replaces; a name the call does not spell out is `None`.
    pub fn mocked<'v>(&self, call: Node<'v>) -> Vec<Mocked<'v>> {
        let Some(callee) = call.node("callee") else { return Vec::new() };
        let direct = callee.is("Identifier");
        let method = if direct { None } else { member_name(callee) };
        let kind = if direct {
            callee.name().and_then(|name| self.0.get(name.as_ref()).copied())
        } else {
            method.as_ref().and_then(|_| callee.node("object")).and_then(|object| self.kind_of_object(object))
        }
        .unwrap_or_default();
        let method = method.unwrap_or_default();
        let arguments = call.list("arguments");
        if loader_mocks(kind).is_some_and(|methods| direct || methods.contains(&method.as_str())) {
            return arguments.iter().skip(1).take(2).flatten().filter(|argument| argument.is("ObjectExpression")).flat_map(|argument| argument.nodes("properties")).map(loader_mock).collect();
        }
        let mocks = if direct { matches!(kind, "mockRequire" | "quibble") } else { module_mocks(kind).contains(&method.as_str()) };
        match arguments.first() {
            Some(source) if mocks => vec![Mocked { name: mocked_name(*source), replacement: arguments.get(1).copied().flatten() }],
            _ => Vec::new(),
        }
    }
}

fn mocked_name(node: Option<Node>) -> Option<String> {
    let node = node?;
    string_literal(if node.is("ImportExpression") { node.node("source") } else { Some(node) })
}

fn loader_mock(property: Node) -> Mocked {
    let replacement = if property.is("Property") { property.node("value") } else { property.node("argument") };
    Mocked { name: key_name(property), replacement }
}

fn key_name(property: Node) -> Option<String> {
    let key = property.filter_kind("Property")?.node("key")?;
    if key.is("Identifier") && !property.flag("computed") { identifier_name(Some(key)) } else { mocked_name(Some(key)) }
}
