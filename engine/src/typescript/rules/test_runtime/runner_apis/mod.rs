//! The runner and mocking-library APIs a test file refers to, tracked as the ESLint `runner-apis` helpers do: each
//! import, `require` and assignment updates the state in source order, and a rule reads it at the node it is on.
mod doubles;
mod mocks;

pub use doubles::{TimerChange, fake_timer_change, sets_fake_clock, spied_member, spied_pair, wait_kind};
pub use mocks::module_mocks;

use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::testing_library::nodes::{identifier_name, string_literal};
use std::collections::HashMap;

const DEFAULT: &str = "default";
const WHOLE_MODULE: &[&str] = &[DEFAULT, "*"];

#[derive(Clone, Copy)]
struct Spec {
    names: &'static [&'static str],
    kind: &'static str,
    functions: &'static [&'static str],
}

struct Binding {
    local: String,
    kind: &'static str,
    method: Option<&'static str>,
}

/// `calledMethod`: the API a callee belongs to and the method it names.
pub struct Called {
    pub kind: Option<&'static str>,
    pub method: Option<String>,
}

fn spec_for(source: &str) -> Option<Spec> {
    let spec = |names: &'static [&'static str], kind: &'static str, functions: &'static [&'static str]| Some(Spec { names, kind, functions });
    match source {
        "vitest" => spec(&["vi", "vitest"], "vitest", &[]),
        "@jest/globals" => spec(&["jest"], "jest", &[]),
        "node:test" => spec(&["mock"], "node", &[]),
        "mock-require" => spec(&[DEFAULT], "mockRequire", &[]),
        "testdouble" => spec(WHOLE_MODULE, "testdouble", &[]),
        "quibble" => spec(&[DEFAULT], "quibble", &[]),
        "sinon" => spec(
            WHOLE_MODULE,
            "sinon",
            &["useFakeTimers", "createSandbox", "restore", "stub", "spy", "replace", "replaceGetter", "replaceSetter"],
        ),
        "@sinonjs/fake-timers" => spec(WHOLE_MODULE, "fakeTimers", &["install", "createClock", "withGlobal"]),
        "proxyquire" => spec(&[DEFAULT], "proxyquire", &[]),
        "esmock" => spec(&[DEFAULT], "esmock", &[]),
        _ if source.starts_with("@testing-library/") => spec(&["waitFor"], "waitFor", &[]),
        _ => None,
    }
}

fn produced(kind: &str, method: &str) -> Option<&'static str> {
    match (kind, method) {
        ("sinon", "createSandbox") => Some("sinon"),
        ("sinon", "useFakeTimers") | ("fakeTimers", "install" | "createClock") => Some("clock"),
        _ => None,
    }
}

/// `memberName`: the property of a member access, a string literal when it is computed.
pub fn member_name(node: Node) -> Option<String> {
    if !node.is("MemberExpression") {
        return None;
    }
    let property = node.node("property");
    if node.flag("computed") { string_literal(property) } else { identifier_name(property) }
}


/// `requiredLiteral`: the module of a direct `require('module')`.
fn required(node: Option<Node>) -> Option<String> {
    let call = node.filter(|node| node.is("CallExpression"))?;
    identifier_name(call.node("callee")).filter(|name| name == "require")?;
    string_literal(call.list("arguments").first().copied().flatten())
}

fn chained_require(init: Option<Node>) -> Option<Node> {
    let mut current = init.filter(|node| node.is("CallExpression"))?;
    while let Some(object) = Some(current)
        .filter(|node| node.is("CallExpression"))
        .and_then(|node| node.node("callee"))
        .filter(|callee| callee.is("MemberExpression"))
        .and_then(|callee| callee.node("object"))
    {
        current = object;
    }
    Some(current)
}

fn required_spec(init: Option<Node>) -> Option<Spec> {
    required(init).and_then(|source| spec_for(&source)).or_else(|| {
        required(chained_require(init)).and_then(|source| spec_for(&source)).filter(|spec| spec.kind == "proxyquire")
    })
}

fn binding_of(spec: Spec, name: &str, local: String) -> Option<Binding> {
    if spec.names.contains(&name) {
        return Some(Binding { local, kind: spec.kind, method: None });
    }
    spec.functions.iter().find(|function| **function == name).map(|method| Binding { local, kind: spec.kind, method: Some(method) })
}

/// `bindingKey`: the name a value is kept under, `this.name` for a member of `this`.
fn binding_key(node: Option<Node>) -> Option<String> {
    let node = node?;
    if node.is("Identifier") {
        return node.name().map(|name| name.into_owned());
    }
    let on_this = node.is("MemberExpression") && node.node("object").is_some_and(|object| object.is("ThisExpression"));
    on_this.then(|| member_name(node)).flatten().map(|name| format!("this.{name}"))
}

#[derive(Default)]
pub struct Apis {
    kinds: HashMap<String, &'static str>,
    functions: HashMap<String, (&'static str, &'static str)>,
}

impl Apis {
    pub fn new() -> Apis {
        let kinds = [("vi", "vitest"), ("vitest", "vitest"), ("jest", "jest"), ("sinon", "sinon")];
        Apis { kinds: kinds.iter().map(|(name, kind)| (name.to_string(), *kind)).collect(), functions: HashMap::new() }
    }

    /// `runnerApiVisitors`: the state change a node of these three kinds makes when ESLint enters it.
    pub fn observe(&mut self, node: Node) {
        match node.kind() {
            "ImportDeclaration" => self.import(node),
            "VariableDeclarator" => {
                if let Some(spec) = required_spec(node.node("init")) {
                    self.remember_required(node, spec);
                }
                self.remember_produced(node.node("id"), node.node("init"));
            }
            "AssignmentExpression" => self.remember_produced(node.node("left"), node.node("right")),
            _ => {}
        }
    }

    fn import(&mut self, node: Node) {
        let Some(spec) = string_literal(node.node("source")).and_then(|source| spec_for(&source)) else { return };
        if node.text("importKind").as_deref() == Some("type") {
            return;
        }
        for specifier in node.nodes("specifiers") {
            let imported = match specifier.kind() {
                "ImportDefaultSpecifier" => Some(DEFAULT.to_string()),
                "ImportNamespaceSpecifier" => Some("*".to_string()),
                _ => specifier.node("imported").and_then(|imported| imported.name().map(|name| name.into_owned()).or_else(|| string_literal(Some(imported)))),
            };
            if let (Some(imported), Some(local)) = (imported, identifier_name(specifier.node("local"))) {
                self.remember(binding_of(spec, &imported, local));
            }
        }
    }

    fn remember_required(&mut self, declarator: Node, spec: Spec) {
        let Some(id) = declarator.node("id") else { return };
        if id.is("ObjectPattern") {
            for property in id.nodes("properties").into_iter().filter(|property| property.is("Property")) {
                if let (Some(key), Some(value)) = (identifier_name(property.node("key")), identifier_name(property.node("value"))) {
                    self.remember(binding_of(spec, &key, value));
                }
            }
        } else if let Some(local) = identifier_name(Some(id)).filter(|_| spec.names.contains(&DEFAULT)) {
            self.kinds.insert(local, spec.kind);
        }
    }

    fn remember(&mut self, binding: Option<Binding>) {
        let Some(Binding { local, kind, method }) = binding else { return };
        match method {
            None => self.kinds.insert(local, kind).map(|_| ()),
            Some(method) => self.functions.insert(local, (kind, method)).map(|_| ()),
        };
    }

    fn remember_produced(&mut self, target: Option<Node>, value: Option<Node>) {
        let Some(key) = binding_key(target) else { return };
        let called = value.filter(|value| value.is("CallExpression")).and_then(|call| call.node("callee")).and_then(|callee| self.called(callee));
        if let Some(kind) = called.and_then(|called| produced(called.kind?, called.method.as_deref().unwrap_or(""))) {
            self.kinds.insert(key, kind);
        }
    }

    pub fn kind_named(&self, name: &str) -> Option<&'static str> {
        self.kinds.get(name).copied()
    }

    fn imported_function(&self, callee: Node) -> Option<(&'static str, &'static str)> {
        if !callee.is("Identifier") {
            return None;
        }
        self.functions.get(callee.name()?.as_ref()).copied()
    }

    pub fn called(&self, callee: Node) -> Option<Called> {
        if let Some((kind, method)) = self.imported_function(callee) {
            return Some(Called { kind: Some(kind), method: Some(method.to_string()) });
        }
        if !callee.is("MemberExpression") {
            return None;
        }
        Some(Called { kind: callee.node("object").and_then(|object| self.kind_of_object(object)), method: member_name(callee) })
    }

    fn produced_object_kind(&self, call: Node) -> Option<&'static str> {
        let callee = call.node("callee")?;
        let with_global = match self.imported_function(callee) {
            Some((kind, method)) => kind == "fakeTimers" && method == "withGlobal",
            None => {
                member_name(callee).as_deref() == Some("withGlobal")
                    && callee.is("MemberExpression")
                    && binding_key(callee.node("object")).and_then(|key| self.kind_named(&key)) == Some("fakeTimers")
            }
        };
        with_global.then_some("fakeTimers")
    }

    pub fn kind_of_object(&self, node: Node) -> Option<&'static str> {
        if node.is("CallExpression") {
            return self.produced_object_kind(node);
        }
        let kind = binding_key(Some(node)).and_then(|key| self.kind_named(&key));
        if kind.is_some() || node.is("Identifier") {
            return kind;
        }
        (member_name(node).as_deref() == Some("mock")).then_some("node")
    }
}

