//! Rules about what a function does with the values its callers pass in.
mod aliases;
mod copies;
mod mutations;
pub mod no_parameter_mutation;
mod owners;

use super::support::scope::Scopes;
use super::support::view::Node;
use super::typed::types::Types;
use regex::Regex;
use std::cell::RefCell;
use std::sync::LazyLock;

/// The file as the rule asks about it: its tree, its scopes, the compiler's answers and its text.
pub struct Scope<'c, 'a, 's> {
    pub scopes: &'c Scopes<'a, 's>,
    pub types: &'c RefCell<Types>,
    pub text: &'a str,
}

impl<'v> Scope<'_, '_, 'v> {
    pub fn source(&self, node: Node) -> &str {
        &self.text[node.start() as usize..node.end() as usize]
    }

    /// `textOf`: the source of a node with every run of white space made one space.
    pub fn flat(&self, node: Node) -> String {
        static SPACES: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"\s+").expect("pattern"));
        SPACES.replace_all(self.source(node), " ").into_owned()
    }
}

pub const ASSERTIONS: &[&str] = &["TSAsExpression", "TSSatisfiesExpression", "TSTypeAssertion", "TSNonNullExpression"];
pub const ASSERTION_FORMS: &[&str] = &["TSAsExpression", "TSSatisfiesExpression", "TSNonNullExpression"];
const FUNCTIONS: &[&str] = &["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];

pub fn wrapped<'v>(node: Node<'v>, kinds: &[&str]) -> Option<Node<'v>> {
    kinds.contains(&node.kind()).then(|| node.node("expression")).flatten()
}

pub fn unwrap<'v>(mut node: Node<'v>, kinds: &[&str]) -> Node<'v> {
    while let Some(inner) = wrapped(node, kinds) {
        node = inner;
    }
    node
}

pub fn is_function(node: Node) -> bool {
    FUNCTIONS.contains(&node.kind())
}

pub fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

/// `calleeNameOf`: a called name, or the property of a plain member callee.
pub fn callee_name(call: Node) -> Option<String> {
    let callee = call.node("callee")?;
    if callee.is("Identifier") {
        return name_of(Some(callee));
    }
    (callee.is("MemberExpression") && !callee.flag("computed")).then(|| name_of(callee.node("property"))).flatten()
}

/// `staticMemberName`: `method` of `Object.method(…)` for a call on the named object.
pub fn static_member_name(call: Node, object: &str) -> Option<String> {
    let callee = call.node("callee")?;
    let owner = callee.node("object")?;
    let property = callee.node("property")?;
    let plain = callee.is("MemberExpression") && !callee.flag("computed") && owner.is("Identifier") && property.is("Identifier");
    (plain && owner.name().as_deref() == Some(object)).then(|| name_of(Some(property))).flatten()
}
