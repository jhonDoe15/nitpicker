use crate::typescript::rules::Context;
use oxc_ast::AstKind;
use oxc_ast::ast::{CatchClause, Expression, Statement};

const MESSAGE: &str = "This catch discards the failure. Return a failure result (`return { kind: 'malformed-json' }`), or rethrow an Error subclass with `{ cause: error }`. An exception fits only when dropping it is intended.";

fn returns_failure_result(clause: &CatchClause) -> bool {
    clause.body.body.iter().any(|statement| {
        matches!(statement, Statement::ReturnStatement(returned)
            if matches!(returned.argument.as_ref().map(Expression::without_parentheses), Some(Expression::ObjectExpression(_))))
    })
}

fn uses_caught_value(context: &Context, clause: &CatchClause) -> bool {
    let scoping = context.semantic.scoping();
    clause.param.iter().flat_map(|param| param.pattern.get_binding_identifiers()).any(|binding| {
        binding.symbol_id.get().is_some_and(|symbol| !scoping.get_resolved_reference_ids(symbol).is_empty())
    })
}

pub fn check(context: &mut Context) {
    let silent: Vec<_> = context
        .semantic
        .nodes()
        .iter()
        .filter_map(|node| match node.kind() {
            AstKind::CatchClause(clause) if !(uses_caught_value(context, clause) || returns_failure_result(clause)) => Some(clause.span),
            _ => None,
        })
        .collect();
    for span in silent {
        context.report("no-silent-catch", span, MESSAGE.to_string());
    }
}
