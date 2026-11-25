//! Which expressions are the global object or Node's `process`, followed through constants and type wrappers.
use super::estree::{member_of, single_initializer, string_value, symbol_of};
use crate::typescript::rules::Context;
use oxc_ast::AstKind;
use oxc_ast::ast::{Argument, Expression};

const PROCESS: &str = "process";
const GLOBAL_OBJECTS: [&str; 4] = ["globalThis", "global", "window", "self"];
const MAX_CHAIN_LENGTH: usize = 8;

pub fn is_process_module(source: &str) -> bool {
    source == PROCESS || source == "node:process"
}

fn next_in_chain<'a>(context: &Context<'a, '_>, step: &'a Expression<'a>) -> Option<&'a Expression<'a>> {
    match step {
        Expression::TSAsExpression(wrapper) => Some(&wrapper.expression),
        Expression::TSTypeAssertion(wrapper) => Some(&wrapper.expression),
        Expression::TSNonNullExpression(wrapper) => Some(&wrapper.expression),
        Expression::TSSatisfiesExpression(wrapper) => Some(&wrapper.expression),
        Expression::AwaitExpression(awaited) => Some(&awaited.argument),
        other => symbol_of(context, other).and_then(|symbol| single_initializer(context, symbol)),
    }
}

fn value_chain<'a>(context: &Context<'a, '_>, start: &'a Expression<'a>) -> Vec<&'a Expression<'a>> {
    let mut chain = vec![start.without_parentheses()];
    let mut index = 0;
    while index < chain.len() {
        if chain.len() < MAX_CHAIN_LENGTH && let Some(following) = next_in_chain(context, chain[index]) {
            chain.push(following.without_parentheses());
        }
        index += 1;
    }
    chain
}

fn is_global_named(context: &Context, step: &Expression, names: &[&str]) -> bool {
    matches!(step, Expression::Identifier(identifier) if names.contains(&identifier.name.as_str())) && symbol_of(context, step).is_none()
}

pub fn is_global_object<'a>(context: &Context<'a, '_>, expression: &'a Expression<'a>) -> bool {
    value_chain(context, expression).into_iter().any(|step| is_global_named(context, step, &GLOBAL_OBJECTS))
}

fn is_process_import(context: &Context, step: &Expression) -> bool {
    let Some(symbol) = symbol_of(context, step) else { return false };
    let nodes = context.semantic.nodes();
    let declared = context.semantic.scoping().symbol_declaration(symbol);
    if !matches!(nodes.kind(declared), AstKind::ImportDefaultSpecifier(_) | AstKind::ImportNamespaceSpecifier(_)) {
        return false;
    }
    matches!(nodes.parent_kind(declared), AstKind::ImportDeclaration(import) if !import.import_kind.is_type() && import.source.value.as_str().is_some_and(is_process_module))
}

fn is_module_load(step: &Expression) -> bool {
    match step {
        Expression::CallExpression(call) => {
            matches!(call.callee.without_parentheses(), Expression::Identifier(callee) if callee.name == "require")
                && call.arguments.first().and_then(Argument::as_expression).and_then(|first| string_value(first.without_parentheses())).is_some_and(|source| is_process_module(&source))
        }
        Expression::ImportExpression(import) => string_value(import.source.without_parentheses()).is_some_and(|source| is_process_module(&source)),
        _ => false,
    }
}

fn is_process_step<'a>(context: &Context<'a, '_>, step: &'a Expression<'a>) -> bool {
    if matches!(step, Expression::Identifier(_)) {
        return is_global_named(context, step, &[PROCESS]) || is_process_import(context, step);
    }
    match member_of(step) {
        Some(member) => member.name.as_deref() == Some(PROCESS) && is_global_object(context, member.object),
        None => is_module_load(step),
    }
}

pub fn is_process_value<'a>(context: &Context<'a, '_>, expression: &'a Expression<'a>) -> bool {
    value_chain(context, expression).into_iter().any(|step| is_process_step(context, step))
}
