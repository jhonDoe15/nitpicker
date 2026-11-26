//! `retryScope`: a call that retries its first argument, with `p-retry`, `async-retry`, `exponential-backoff`
//! or a `cockatiel` policy's `execute`, and the label the findings name it by.
use super::imports::ImportedBinding;
use super::syntax::{constant_initializer, name_of};
use crate::typescript::rules::effects::packages::package_from_path;
use crate::typescript::rules::held_scopes::estree_calls::call_view;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::nodes::parse_handle;
use std::collections::HashMap;

pub type Bindings = HashMap<String, ImportedBinding>;

pub struct RetryScope<'v> {
    pub label: String,
    pub retried: Option<Node<'v>>,
}

const RETRY_FUNCTIONS: [(&str, &str); 3] = [("p-retry", "default"), ("async-retry", "default"), ("exponential-backoff", "backOff")];
const POLICY_MODULE: &str = "cockatiel";
const POLICY_TYPES: [&str; 3] = ["RetryPolicy", "IPolicy", "IMergedPolicy"];

fn is_retry_function(binding: Option<&ImportedBinding>) -> bool {
    binding.is_some_and(|binding| RETRY_FUNCTIONS.iter().any(|(module, name)| binding.module == *module && binding.name == *name))
}

fn policy_call<'v>(scopes: &Scopes<'_, 'v>, node: Node<'v>) -> Option<Node<'v>> {
    let value = if node.is("Identifier") { constant_initializer(scopes, node) } else { Some(node) };
    value.filter(|value| value.is("CallExpression"))
}

fn is_policy_type(types: &mut Types, node: Node) -> bool {
    let Some(symbol) = types.type_symbol_at(node.start(), node.end()) else { return false };
    let file = symbol.declarations.first().and_then(|declaration| parse_handle(declaration).map(|(_, _, path)| path.to_string()));
    file.is_some_and(|file| package_from_path(&file).as_deref() == Some(POLICY_MODULE)) && POLICY_TYPES.contains(&symbol.name.as_str())
}

fn is_policy_execute(types: &mut Types, scopes: &Scopes, callee: Node, bindings: &Bindings) -> bool {
    if !callee.is("MemberExpression") || name_of(callee.node("property")).as_deref() != Some("execute") {
        return false;
    }
    let Some(object) = callee.node("object") else { return false };
    let root = policy_call(scopes, object).and_then(call_view).and_then(|view| view.root);
    let built = root.and_then(|root| root.name()).is_some_and(|name| bindings.get(name.as_ref()).is_some_and(|binding| binding.module == POLICY_MODULE));
    built || is_policy_type(types, object)
}

pub fn retry_scope<'v>(types: &mut Types, scopes: &Scopes, call: Node<'v>, bindings: &Bindings) -> Option<RetryScope<'v>> {
    let callee = call.node("callee")?;
    let retries = (callee.is("Identifier") && is_retry_function(callee.name().and_then(|name| bindings.get(name.as_ref()))))
        || is_policy_execute(types, scopes, callee, bindings);
    if !retries {
        return None;
    }
    let label = call_view(call).map(|view| view.label).unwrap_or_default();
    Some(RetryScope { label: format!("`{label}`"), retried: call.nodes("arguments").first().copied() })
}
