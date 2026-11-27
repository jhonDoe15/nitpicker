//! `nest-facts.mts`: the route handlers of the Nest controllers in a file and the auth decorators each has, its
//! own and its class's.
use super::shapes::{DecoratorInfo, decorator_info};
use crate::typescript::rules::support::view::{Node, View};
use crate::typescript::rules::writes::imports::ImportedBinding;
use std::collections::HashMap;

const VERBS: [&str; 8] = ["Get", "Post", "Put", "Patch", "Delete", "All", "Options", "Head"];
const NEST_COMMON: &str = "@nestjs/common";

/// `NestHandler`: the route method and what its decorators say.
pub struct Handler<'v> {
    pub node: Node<'v>,
    pub shapes: Vec<String>,
    pub is_auth: bool,
    pub is_public: bool,
}

fn is_nest_decorator(decorator: Node, name: &str, bindings: &HashMap<String, ImportedBinding>) -> bool {
    let Some(expression) = decorator.node("expression") else { return false };
    let target = if expression.is("CallExpression") { expression.node("callee") } else { Some(expression) };
    target.is_some_and(|target| target.is("Identifier") && target.name().as_deref() == Some(name)) && bindings.get(name).is_some_and(|binding| binding.module == NEST_COMMON)
}

fn describe<'v>(method: Node<'v>, class_decorators: &[Node<'v>]) -> Handler<'v> {
    let decorators: Vec<DecoratorInfo> = method.nodes("decorators").into_iter().chain(class_decorators.iter().copied()).map(decorator_info).collect();
    Handler {
        node: method,
        shapes: decorators.iter().filter(|each| each.is_auth).map(|each| each.shape.clone()).collect(),
        is_auth: decorators.iter().any(|each| each.is_auth),
        is_public: decorators.iter().any(|each| each.is_public),
    }
}

fn controller_handlers<'v>(class: Node<'v>, bindings: &HashMap<String, ImportedBinding>) -> Vec<Handler<'v>> {
    let decorators = class.nodes("decorators");
    if !decorators.iter().any(|each| is_nest_decorator(*each, "Controller", bindings)) {
        return Vec::new();
    }
    let members = class.node("body").map(|body| body.nodes("body")).unwrap_or_default();
    members
        .into_iter()
        .filter(|member| member.is("MethodDefinition"))
        .filter(|member| member.nodes("decorators").into_iter().any(|each| VERBS.iter().any(|verb| is_nest_decorator(each, verb, bindings))))
        .map(|member| describe(member, &decorators))
        .collect()
}

/// `nestFacts(program).handlers`.
pub fn nest_handlers<'v>(view: &'v View, bindings: &HashMap<String, ImportedBinding>) -> Vec<Handler<'v>> {
    view.nodes().filter(|node| node.is("ClassDeclaration") || node.is("ClassExpression")).flat_map(|class| controller_handlers(class, bindings)).collect()
}
