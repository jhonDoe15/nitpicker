//! Which names a file binds to a server module, and whether an expression is a server made from one of them.
use crate::typescript::rules::Context;
use crate::typescript::rules::support::estree::{literal_text, parent, symbol_of};
use oxc_ast::AstKind;
use oxc_ast::ast::{Argument, BindingPattern, Expression, ImportDeclarationSpecifier};
use regex::Regex;
use std::collections::HashSet;
use std::sync::LazyLock;

static SERVER_MODULES: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^(?:node:)?(?:https?|net|http2)$|^(?:express|koa|connect|polka|restify)$").expect("pattern"));
const FACTORIES: [&str; 2] = ["createServer", "createSecureServer"];
const CONSTRUCTORS: [&str; 2] = ["Koa", "Server"];
const CHAINED: [&str; 8] = ["use", "get", "post", "put", "delete", "set", "on", "once"];
const MAX_DEPTH: usize = 4;

#[derive(Default)]
pub struct Bindings {
    pub modules: HashSet<String>,
    pub names: HashSet<String>,
}

fn local_name<'a>(specifier: &ImportDeclarationSpecifier<'a>) -> &'a str {
    match specifier {
        ImportDeclarationSpecifier::ImportSpecifier(named) => named.local.name.as_str(),
        ImportDeclarationSpecifier::ImportDefaultSpecifier(default) => default.local.name.as_str(),
        ImportDeclarationSpecifier::ImportNamespaceSpecifier(namespace) => namespace.local.name.as_str(),
    }
}

fn literal_argument(first: Option<&Argument>) -> Option<String> {
    match first?.as_expression()?.without_parentheses() {
        Expression::RegExpLiteral(_) | Expression::BigIntLiteral(_) => Some(String::new()),
        literal => literal_text(literal),
    }
}

pub fn server_bindings(context: &Context) -> Bindings {
    let mut bindings = Bindings::default();
    for node in context.semantic.nodes().iter() {
        match node.kind() {
            AstKind::ImportDeclaration(import) => {
                let Some(source) = import.source.value.as_str() else { continue };
                bindings.modules.insert(source.to_string());
                if SERVER_MODULES.is_match(source) {
                    bindings.names.extend(import.specifiers.iter().flatten().map(|specifier| local_name(specifier).to_string()));
                }
            }
            AstKind::CallExpression(call) if matches!(call.callee.without_parentheses(), Expression::Identifier(callee) if callee.name == "require") => {
                let Some(source) = literal_argument(call.arguments.first()) else { continue };
                if let AstKind::VariableDeclarator(declarator) = parent(context, node.id()).kind()
                    && let BindingPattern::BindingIdentifier(name) = &declarator.id
                    && SERVER_MODULES.is_match(&source)
                {
                    bindings.names.insert(name.name.to_string());
                }
                bindings.modules.insert(source);
            }
            _ => {}
        }
    }
    bindings
}

fn object_of<'a>(expression: &'a Expression<'a>) -> Option<&'a Expression<'a>> {
    match expression {
        Expression::StaticMemberExpression(member) => Some(&member.object),
        Expression::ComputedMemberExpression(member) => Some(&member.object),
        Expression::PrivateFieldExpression(member) => Some(&member.object),
        _ => None,
    }
}

/// `calleeNameOf` of the ESLint helpers: the identifier, or the name after the dot.
pub fn callee_name<'a>(callee: &Expression<'a>) -> Option<&'a str> {
    match callee {
        Expression::Identifier(identifier) => Some(identifier.name.as_str()),
        Expression::StaticMemberExpression(member) => Some(member.property.name.as_str()),
        Expression::PrivateFieldExpression(member) => Some(member.field.name.as_str()),
        _ => None,
    }
}

fn is_bound(callee: &Expression, names: &HashSet<String>) -> bool {
    let named = |expression: &Expression| matches!(expression, Expression::Identifier(identifier) if names.contains(identifier.name.as_str()));
    named(callee) || object_of(callee).is_some_and(|object| named(object.without_parentheses()))
}

enum Step<'a> {
    Server(bool),
    Follow(&'a Expression<'a>),
}

fn initializer<'a>(context: &Context<'a, '_>, identifier: &Expression<'a>) -> Step<'a> {
    let scoping = context.semantic.scoping();
    let init = symbol_of(context, identifier).filter(|symbol| scoping.symbol_redeclarations(*symbol).is_empty()).and_then(|symbol| {
        match context.semantic.nodes().kind(scoping.symbol_declaration(symbol)) {
            AstKind::VariableDeclarator(declarator) => declarator.init.as_ref(),
            _ => None,
        }
    });
    init.map_or(Step::Server(false), Step::Follow)
}

fn next_step<'a>(context: &Context<'a, '_>, expression: &'a Expression<'a>, names: &HashSet<String>) -> Step<'a> {
    match expression {
        Expression::NewExpression(created) => {
            let callee = created.callee.without_parentheses();
            Step::Server(is_bound(callee, names) && callee_name(callee).is_some_and(|name| CONSTRUCTORS.contains(&name)))
        }
        Expression::CallExpression(call) => {
            let callee = call.callee.without_parentheses();
            let name = callee_name(callee).unwrap_or("");
            if is_bound(callee, names) && (matches!(callee, Expression::Identifier(_)) || FACTORIES.contains(&name)) {
                return Step::Server(true);
            }
            match object_of(callee) {
                Some(object) if CHAINED.contains(&name) => Step::Follow(object),
                _ => Step::Server(false),
            }
        }
        Expression::AwaitExpression(awaited) => Step::Follow(&awaited.argument),
        Expression::Identifier(_) => initializer(context, expression),
        _ => Step::Server(false),
    }
}

pub fn is_server<'a>(context: &Context<'a, '_>, start: &'a Expression<'a>, names: &HashSet<String>) -> bool {
    let mut current = start.without_parentheses();
    for _ in 0..=MAX_DEPTH {
        match next_step(context, current, names) {
            Step::Server(found) => return found,
            Step::Follow(next) => current = next.without_parentheses(),
        }
    }
    false
}

/// The call or `new` that made the receiver, directly or through its first definition.
pub fn creation_arguments<'a>(context: &Context<'a, '_>, receiver: &'a Expression<'a>) -> &'a [Argument<'a>] {
    let made = match receiver {
        Expression::Identifier(_) => symbol_of(context, receiver).and_then(|symbol| {
            match context.semantic.nodes().kind(context.semantic.scoping().symbol_declaration(symbol)) {
                AstKind::VariableDeclarator(declarator) => declarator.init.as_ref().map(Expression::without_parentheses),
                _ => None,
            }
        }),
        other => Some(other),
    };
    match made {
        Some(Expression::CallExpression(call)) => &call.arguments,
        Some(Expression::NewExpression(created)) => &created.arguments,
        _ => &[],
    }
}
