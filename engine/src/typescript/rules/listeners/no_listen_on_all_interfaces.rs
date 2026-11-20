use super::server_origins::{creation_arguments, is_server, server_bindings};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::estree::parent;
use oxc_ast::AstKind;
use oxc_ast::ast::{Argument, BindingPattern, CallExpression, Expression, ObjectPropertyKind, PropertyKey};
use oxc_semantic::NodeId;
use oxc_span::{GetSpan, Span};
use regex::Regex;
use std::sync::LazyLock;

const MESSAGE: &str = "`listen` without a host binds every network interface, so this local server and what it receives (a sign-in code, a local API) is reachable from the network. Pass the loopback host: `server.listen(port, '127.0.0.1', callback)`.";
static LOCAL_PATH: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?:^|/)(?:cli|electron|desktop|extension)(?:/|\.)").expect("pattern"));
static LOCAL_HELPER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new("(?i)oauth|redirect|authori[sz]|loopback|login|auth_?code|openbrowser|callbackserver|callbackport|callbackurl|authcallback").expect("pattern")
});
static OPTIONS_NAME: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?i)opt|config|setting|arg|param|address|bind").expect("pattern"));

/// `(?:^|[^A-Za-z])sso(?![a-z])|Sso(?![a-z])|(?<![A-Z])SSO(?![A-Z])` without look-around.
fn mentions_sso(text: &str) -> bool {
    let bytes = text.as_bytes();
    (0..bytes.len().saturating_sub(2)).any(|at| {
        let before = at.checked_sub(1).map(|index| bytes[index]);
        let after = bytes.get(at + 3).copied();
        match &bytes[at..at + 3] {
            b"sso" => !before.is_some_and(|byte| byte.is_ascii_alphabetic()) && !after.is_some_and(|byte| byte.is_ascii_lowercase()),
            b"Sso" => !after.is_some_and(|byte| byte.is_ascii_lowercase()),
            b"SSO" => !before.is_some_and(|byte| byte.is_ascii_uppercase()) && !after.is_some_and(|byte| byte.is_ascii_uppercase()),
            _ => false,
        }
    })
}

fn expression_of<'a>(argument: &'a Argument<'a>) -> Option<&'a Expression<'a>> {
    argument.as_expression().map(Expression::without_parentheses)
}

fn is_function(expression: &Expression) -> bool {
    matches!(expression, Expression::FunctionExpression(_) | Expression::ArrowFunctionExpression(_))
}

fn has_host(expression: &Expression) -> bool {
    let Expression::ObjectExpression(object) = expression else { return false };
    object.properties.iter().any(|property| match property {
        ObjectPropertyKind::SpreadProperty(_) => true,
        ObjectPropertyKind::ObjectProperty(property) => {
            property.computed || matches!(&property.key, PropertyKey::StaticIdentifier(key) if matches!(key.name.as_str(), "host" | "hostname" | "path"))
        }
    })
}

fn listens_without_host(call: &CallExpression) -> bool {
    let Some(first) = call.arguments.first().and_then(expression_of) else { return false };
    match first {
        Expression::ObjectExpression(_) => !has_host(first),
        Expression::StringLiteral(_) => false,
        _ => call.arguments.len() < 3 && call.arguments.get(1).is_none_or(|second| expression_of(second).is_some_and(is_function)),
    }
}

fn is_probe_or_options(context: &Context, call: &CallExpression) -> bool {
    match call.arguments.first().and_then(expression_of) {
        Some(Expression::NumericLiteral(port)) if port.value == 0.0 => return true,
        Some(Expression::Identifier(name)) if OPTIONS_NAME.is_match(&name.name) => return true,
        _ => {}
    }
    call.arguments.iter().filter_map(expression_of).any(|argument| is_function(argument) && context.text(argument.span()).contains(".close("))
}

fn owner_names(context: &Context, call: NodeId) -> Vec<String> {
    let nodes = context.semantic.nodes();
    let owner = nodes.ancestors(call).find(|node| match node.kind() {
        AstKind::Function(function) => function.is_declaration() || function.is_expression(),
        AstKind::ArrowFunctionExpression(_) => true,
        _ => false,
    });
    let Some(owner) = owner else { return Vec::new() };
    let mut names = Vec::new();
    if let AstKind::Function(function) = owner.kind() {
        names.extend(function.id.iter().map(|id| id.name.to_string()));
    }
    match parent(context, owner.id()).kind() {
        AstKind::VariableDeclarator(declarator) => {
            if let BindingPattern::BindingIdentifier(id) = &declarator.id {
                names.push(id.name.to_string());
            }
        }
        AstKind::MethodDefinition(method) => {
            if let PropertyKey::StaticIdentifier(key) = &method.key && !method.computed {
                names.push(key.name.to_string());
            }
        }
        _ => {}
    }
    names
}

fn mentions_local_helper<'a>(context: &Context<'a, '_>, id: NodeId, call: &'a CallExpression<'a>, receiver: &'a Expression<'a>) -> bool {
    let mut texts = owner_names(context, id);
    if let Expression::Identifier(name) = receiver {
        texts.push(name.name.to_string());
    }
    let path = context.file.path.replace('\\', "/");
    texts.push(path.rsplit('/').next().unwrap_or("").to_string());
    let handlers = creation_arguments(context, receiver).iter().filter_map(expression_of).filter(|made| is_function(made) || matches!(made, Expression::Identifier(_)));
    let callbacks = call.arguments.iter().filter_map(expression_of).filter(|argument| is_function(argument));
    texts.extend(handlers.chain(callbacks).map(|argument| context.text(argument.span()).to_string()));
    texts.iter().any(|text| LOCAL_HELPER.is_match(text) || mentions_sso(text))
}

pub fn check(context: &mut Context) {
    let bindings = server_bindings(context);
    if bindings.names.is_empty() {
        return;
    }
    let local = bindings.modules.contains("electron") || bindings.modules.contains("vscode") || LOCAL_PATH.is_match(&context.file.path.replace('\\', "/"));
    let mut found: Vec<Span> = Vec::new();
    for node in context.semantic.nodes().iter() {
        let AstKind::CallExpression(call) = node.kind() else { continue };
        let Expression::StaticMemberExpression(callee) = call.callee.without_parentheses() else { continue };
        let receiver = callee.object.without_parentheses();
        if callee.property.name == "listen"
            && listens_without_host(call)
            && !is_probe_or_options(context, call)
            && is_server(context, receiver, &bindings.names)
            && (local || mentions_local_helper(context, node.id(), call, receiver))
        {
            found.push(call.span);
        }
    }
    for span in found {
        context.report("no-listen-on-all-interfaces", span, MESSAGE.to_string());
    }
}
