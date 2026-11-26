//! PMD CloseResourceRule `getFirstReassigningStatementBeforeBeingClosed`: a resource variable assigned again before
//! the instance it holds was closed.
use super::close::{closing_call, refers_to};
use super::types::{Settings, initializer};
use crate::java::pmd::coded::ctx::Ctx;
use crate::java::pmd::coded::design::paths::{StablePath, Symbol, null_check};
use crate::java::pmd::coded::errorprone::expressions::same_variable;

fn call_on(ctx: &Ctx, expression: Option<u32>, variable: u32) -> bool {
    expression.is_some_and(|at| ctx.is(at, "MethodCall") && refers_to(ctx, ctx.qualifier(at), variable))
}

pub fn reassigned_before_closed(ctx: &Ctx, settings: &Settings, variable: u32, method: u32) -> Option<u32> {
    let mut closed = false;
    let value = initializer(ctx, variable);
    let mut initialized = !value.is_some_and(|value| ctx.is(value, "NullLiteral"));
    let mut initializing = value;
    for statement in ctx.descendants(method).into_iter().filter(|at| ctx.is(*at, "ExpressionStatement")) {
        let expression = ctx.nth(statement, 0);
        if expression.is_some_and(|at| closing_call(ctx, settings, at, variable)) || call_on(ctx, expression, variable) {
            closed = true;
        }
        let Some(assignment) = expression.filter(|at| ctx.is(*at, "AssignmentExpression")) else { continue };
        if !refers_to(ctx, ctx.nth(assignment, 0), variable) {
            continue;
        }
        if initialized
            && !closed
            && initializing.is_some_and(|initializing| !same_if(ctx, statement, initializing))
            && !in_null_check(ctx, statement, variable)
            && !self_assignment(ctx, assignment)
        {
            return Some(statement);
        }
        closed = false;
        if !initialized {
            initialized = true;
            initializing = Some(assignment);
        }
    }
    None
}

fn same_if(ctx: &Ctx, one: u32, other: u32) -> bool {
    let ifs: Vec<u32> = ctx.ancestors(other).filter(|at| ctx.is(*at, "IfStatement")).collect();
    ctx.ancestors(one).any(|at| ctx.is(at, "IfStatement") && ifs.contains(&at))
}

fn in_null_check(ctx: &Ctx, statement: u32, variable: u32) -> bool {
    let Some(grandparent) = ctx.ancestors(statement).nth(1).filter(|at| ctx.is(*at, "IfStatement")) else {
        return false;
    };
    null_check(ctx, ctx.nth(grandparent, 0), &StablePath::variable(Symbol::Declared(variable)))
}

fn self_assignment(ctx: &Ctx, assignment: u32) -> bool {
    let (Some(left), Some(right)) = (ctx.nth(assignment, 0), ctx.nth(assignment, 1)) else { return false };
    std::iter::once(right)
        .chain(ctx.descendants(right))
        .any(|at| ctx.is(at, "VariableAccess") && same_variable(ctx, at, left))
}
