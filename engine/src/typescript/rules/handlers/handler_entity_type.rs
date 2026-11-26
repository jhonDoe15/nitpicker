//! `handler-entity-type`: an ORM entity in the signature of a route handler (a Nest controller method, an exported
//! `GET`/`POST`/... of a Next `route` file) or in a response being sent (`response.json(entity)`,
//! `response.body = entity`).
use crate::typescript::rules::contracts::infrastructure::interpolate;
use super::orm_entities::entities_in;
use super::routes::{is_body_target, is_send, nest_route, signature_types};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use crate::typescript::types::server::Type;
use crate::typescript::types::tables::kind as k;
use std::collections::HashSet;

const RULE: &str = "handler-entity-type";
const MESSAGE: &str = "Take and return a plain record (DTO) in {{site}} and map {{entity}} to it in the service: {{entity}} is a {{orm}} entity, so the response serializes every column and loaded relation and ties the API to the database schema. An exception fits only when the entity is deliberately the API model, such as a read-only projection.";
const HTTP_VERBS: [&str; 7] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

struct Found {
    node: (u32, u32),
    messages: Vec<String>,
}

struct Scope<'t> {
    types: &'t std::cell::RefCell<Types>,
    route_file: bool,
    found: Vec<Found>,
}

fn is_route_file(path: &str) -> bool {
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    let Some(rest) = name.strip_prefix("route.") else { return false };
    let extension = rest.strip_prefix(['c', 'm']).unwrap_or(rest);
    matches!(extension, "ts" | "tsx" | "js" | "jsx")
}

fn describe(types: &mut Types, site: &str, kinds: &[Type]) -> Vec<String> {
    let mut reported = HashSet::new();
    let mut messages = Vec::new();
    for kind in kinds {
        for entity in entities_in(types, kind) {
            if reported.insert(entity.name.clone()) {
                messages.push(interpolate(MESSAGE, &[("site", site), ("entity", &entity.name), ("orm", entity.orm)]));
            }
        }
    }
    messages
}

impl Scope<'_> {
    fn report(&mut self, node: Node, site: &str, kinds: &[Type]) {
        let messages = describe(&mut self.types.borrow_mut(), site, kinds);
        self.found.push(Found { node: (node.start(), node.end()), messages });
    }

    fn method(&mut self, node: Node) {
        let compiler = match node.text("kind").as_deref() {
            Some("method") => k::METHOD_DECLARATION,
            Some("get") => k::GET_ACCESSOR,
            Some("set") => k::SET_ACCESSOR,
            _ => return,
        };
        let Some(key) = node.node("key") else { return };
        let mut types = self.types.borrow_mut();
        let Some(handle) = types.handle_at(Some(compiler), node.start(), node.end()) else {
            types.refuse("no compiler node for a method");
            return;
        };
        let Some(site) = nest_route(&mut types, &handle) else { return };
        let kinds = signature_types(&mut types, &handle);
        drop(types);
        self.report(key, &site, &kinds);
    }

    fn route_handler(&mut self, node: Node, id: Option<Node>, declaration: (u32, u32, u32)) {
        let exported = |node: Node| node.ancestors().take(2).any(|ancestor| ancestor.is("ExportNamedDeclaration"));
        let Some(id) = id.filter(|id| id.is("Identifier")) else { return };
        let name = id.name().unwrap_or_default();
        if !(self.route_file && exported(node) && HTTP_VERBS.contains(&name.as_ref())) {
            return;
        }
        let mut types = self.types.borrow_mut();
        let Some(handle) = types.handle_at(Some(declaration.0), declaration.1, declaration.2) else {
            types.refuse("no compiler node for a route handler");
            return;
        };
        let kinds = signature_types(&mut types, &handle);
        drop(types);
        self.report(id, &name, &kinds);
    }

    fn variable(&mut self, node: Node) {
        let Some(init) = node.node("init") else { return };
        let compiler = match init.kind() {
            "ArrowFunctionExpression" => k::ARROW_FUNCTION,
            "FunctionExpression" => k::FUNCTION_EXPRESSION,
            _ => return,
        };
        self.route_handler(node, node.node("id"), (compiler, init.start(), init.end()));
    }

    fn call(&mut self, node: Node) {
        let Some(first) = node.nodes("arguments").first().copied() else { return };
        let mut types = self.types.borrow_mut();
        let Some(handle) = types.handle_at(Some(k::CALL_EXPRESSION), node.start(), node.end()) else {
            types.refuse("no compiler node for a call");
            return;
        };
        let Some(callee) = is_send(&mut types, &handle) else { return };
        let kinds: Vec<Type> = types.type_at(first.start(), first.end()).into_iter().collect();
        drop(types);
        self.report(first, &format!("{callee}(...)"), &kinds);
    }

    fn assignment(&mut self, node: Node) {
        let (Some(left), Some(right)) = (node.node("left"), node.node("right")) else { return };
        let mut types = self.types.borrow_mut();
        let Some(target) = types.handle_at(None, left.start(), left.end()) else {
            types.refuse("no compiler node for an assignment target");
            return;
        };
        let Some(text) = is_body_target(&mut types, &target) else { return };
        let kinds: Vec<Type> = types.type_at(right.start(), right.end()).into_iter().collect();
        drop(types);
        self.report(right, &format!("{text} ="), &kinds);
    }
}

pub fn check(context: &mut Context) {
    let (Some((view, _)), Some(types)) = (context.estree, context.types) else { return };
    let mut scope = Scope { types, route_file: is_route_file(context.file.path), found: Vec::new() };
    for node in view.nodes() {
        match node.kind() {
            "MethodDefinition" => scope.method(node),
            "FunctionDeclaration" => scope.route_handler(node, node.node("id"), (k::FUNCTION_DECLARATION, node.start(), node.end())),
            "VariableDeclarator" => scope.variable(node),
            "CallExpression" => scope.call(node),
            "AssignmentExpression" => scope.assignment(node),
            _ => {}
        }
        if types.borrow().refused.is_some() {
            return;
        }
    }
    for found in scope.found {
        for message in found.messages {
            context.report_range(RULE, found.node.0, Some(found.node.1), message);
        }
    }
}
