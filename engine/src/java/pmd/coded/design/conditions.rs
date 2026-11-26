//! Design rules about conditions.
use super::paths::{StablePath, null_check, other_operand};
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit;

fn infix_with(ctx: &Ctx, id: Option<u32>, operator: &str) -> bool {
    id.is_some_and(|id| ctx.is(id, "InfixExpression") && ctx.text(id, "Operator") == operator)
}

fn negation(ctx: &Ctx, id: Option<u32>) -> bool {
    id.is_some_and(|id| ctx.is(id, "UnaryExpression") && ctx.text(id, "Operator") == "!")
}

pub fn simplify_conditional(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &check in ctx.all("InfixExpression") {
        if ctx.text(check, "Operator") != "instanceof" {
            continue;
        }
        let Some(subject) = ctx.nth(check, 0).and_then(|left| StablePath::of(ctx, left)) else {
            continue;
        };
        let parent = ctx.parent(check);
        let (negated, null_expression) = if infix_with(ctx, parent, "&&") {
            (false, other_operand(ctx, check))
        } else if negation(ctx, parent) && infix_with(ctx, parent.and_then(|unary| ctx.parent(unary)), "||") {
            (true, parent.and_then(|unary| other_operand(ctx, unary)))
        } else {
            continue;
        };
        if !null_check(ctx, null_expression, &subject) {
            continue;
        }
        if let Some(found) = null_expression.filter(|_| negated != infix_with(ctx, null_expression, "!=")) {
            out.push(hit(found));
        }
    }
}
