use super::caught::{Catch, ERROR_FIELD, has_caught_argument, has_error_field, is_caught_value, is_logger_call, references_caught};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use oxc_ast::AstKind;
use oxc_semantic::SymbolId;
use std::collections::HashMap;

const RULE: &str = "structured-catch-logging";
const ERROR_MESSAGE: &str = "Log a caught value as logger.<level>({ err: error, ...context }, message).";
const VALUE_MESSAGE: &str = "Pass the caught value itself to the logger, for example logger.error('message', error), not its message or a template string.";
const EITHER_MESSAGE: &str = "Log a caught value as logger.<level>({ err: error, ...context }, message), or pass the caught value itself, for example logger.error('message', error).";

/// The shapes the project logger reads, from the per-file fact; the JS default (`err-field`) when it is missing or empty.
fn shapes(context: &Context) -> Vec<String> {
    let mut found: Vec<String> = Vec::new();
    for shape in context.setting("structured-catch-logging.logger-shapes").unwrap_or("").split(',').filter(|shape| !shape.is_empty()) {
        if !found.iter().any(|kept| kept == shape) {
            found.push(shape.to_string());
        }
    }
    if found.is_empty() {
        found.push(ERROR_FIELD.to_string());
    }
    found
}

fn declared(context: &Context) -> HashMap<u32, Vec<SymbolId>> {
    let mut found = HashMap::new();
    for node in context.semantic.nodes().iter() {
        match node.kind() {
            AstKind::CatchClause(clause) => {
                let symbols = clause.param.iter().flat_map(|param| param.pattern.get_binding_identifiers());
                found.insert(clause.span.start, symbols.filter_map(|binding| binding.symbol_id.get()).collect());
            }
            AstKind::VariableDeclarator(declarator) => {
                let symbols = declarator.id.get_binding_identifiers().into_iter().filter_map(|binding| binding.symbol_id.get());
                found.insert(declarator.span.start, symbols.collect());
            }
            _ => {}
        }
    }
    found
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let shapes = shapes(context);
    let message = match (shapes.len(), shapes[0].as_str()) {
        (1, ERROR_FIELD) => ERROR_MESSAGE,
        (1, _) => VALUE_MESSAGE,
        _ => EITHER_MESSAGE,
    };
    let declared = declared(context);
    let mut stack: Vec<(Node, Catch)> = Vec::new();
    let mut reports: Vec<(u32, u32)> = Vec::new();
    for node in view.nodes() {
        while stack.last().is_some_and(|(clause, _)| !clause.contains(node)) {
            stack.pop();
        }
        match node.kind() {
            "CatchClause" => {
                let variables = declared.get(&node.start()).cloned().unwrap_or_default();
                stack.push((node, Catch { caught: variables.clone(), variables, initializers: HashMap::new() }));
            }
            "VariableDeclarator" => {
                let Some((_, state)) = stack.last_mut() else { continue };
                let init = node.node("init");
                let id = node.node("id").filter(|id| id.is("Identifier"));
                if let (Some(id), Some(init)) = (id, init) {
                    state.initializers.insert(id.name().unwrap_or_default().to_string(), init);
                }
                let symbols = declared.get(&node.start()).cloned().unwrap_or_default();
                if init.is_some_and(|init| references_caught(scopes, init, &state.variables)) {
                    state.variables.extend(symbols.iter().copied());
                }
                if is_caught_value(scopes, init, &state.caught) {
                    state.caught.extend(symbols);
                }
            }
            "CallExpression" => {
                let Some((_, state)) = stack.last() else { continue };
                if !is_logger_call(node) || !references_caught(scopes, node, &state.variables) {
                    continue;
                }
                let accepted = shapes.iter().any(|shape| {
                    if shape == ERROR_FIELD { has_error_field(scopes, node, state) } else { has_caught_argument(scopes, node, &state.caught) }
                });
                if !accepted {
                    reports.push((node.start(), node.end()));
                }
            }
            _ => {}
        }
    }
    for (start, end) in reports {
        context.report_range(RULE, start, Some(end), message.to_string());
    }
}
