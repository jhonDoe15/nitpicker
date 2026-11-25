//! The variables that hold a component wrapper of enzyme or react-test-renderer.
use super::member_name;
use crate::typescript::rules::support::view::{Node, View};
use crate::typescript::rules::testing_library::nodes::string_literal;
use std::collections::HashSet;

const FACTORIES: &[(&str, &[&str])] = &[("enzyme", &["mount", "shallow", "render"]), ("react-test-renderer", &["create"])];

#[derive(Default)]
pub struct Wrappers {
    functions: HashSet<String>,
    namespaces: HashSet<String>,
    names: HashSet<String>,
}

fn local(specifier: Node) -> Option<String> {
    specifier.node("local").and_then(|local| local.name()).map(|name| name.into_owned())
}

impl Wrappers {
    pub fn of(view: &View) -> Wrappers {
        let mut wrappers = Wrappers::default();
        for statement in view.program().nodes("body").into_iter().filter(|statement| statement.is("ImportDeclaration")) {
            let source = string_literal(statement.node("source"));
            let Some((_, factories)) = FACTORIES.iter().find(|(module, _)| source.as_deref() == Some(*module)) else { continue };
            for specifier in statement.nodes("specifiers") {
                if !specifier.is("ImportSpecifier") {
                    wrappers.namespaces.extend(local(specifier));
                } else if specifier.node("imported").and_then(|imported| imported.name()).is_some_and(|name| factories.contains(&name.as_ref())) {
                    wrappers.functions.extend(local(specifier));
                }
            }
        }
        for node in view.nodes() {
            let (target, value) = match node.kind() {
                "VariableDeclarator" => (node.node("id"), node.node("init")),
                "AssignmentExpression" => (node.node("left"), node.node("right")),
                _ => continue,
            };
            let name = target.filter(|target| target.is("Identifier")).and_then(|target| target.name());
            if let Some(name) = name.filter(|_| wrappers.is_factory_call(value)) {
                wrappers.names.insert(name.into_owned());
            }
        }
        wrappers
    }

    fn is_factory_call(&self, node: Option<Node>) -> bool {
        let call = node.map(|node| if node.is("AwaitExpression") { node.node("argument") } else { Some(node) });
        let callee = call.flatten().filter(|call| matches!(call.kind(), "CallExpression" | "NewExpression")).and_then(|call| call.node("callee"));
        let Some(callee) = callee else { return false };
        if callee.is("Identifier") {
            return callee.name().is_some_and(|name| self.functions.contains(name.as_ref()));
        }
        let namespace = callee.node("object").filter(|object| callee.is("MemberExpression") && object.is("Identifier")).and_then(|object| object.name());
        let factory = member_name(callee).is_some_and(|name| FACTORIES.iter().any(|(_, names)| names.contains(&name.as_str())));
        namespace.is_some_and(|namespace| self.namespaces.contains(namespace.as_ref())) && callee.is("MemberExpression") && factory
    }

    /// Whether the receiver of a state call is a wrapper: a variable set to one, or the call that makes one.
    pub fn holds(&self, receiver: Node) -> bool {
        (receiver.is("Identifier") && receiver.name().is_some_and(|name| self.names.contains(name.as_ref()))) || self.is_factory_call(Some(receiver))
    }
}
