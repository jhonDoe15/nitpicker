//! Design, code style and multithreading rules about conditions and shared formatters.
use super::paths::{StablePath, null_check, other_operand, symbol};
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit;

fn infix(ctx: &Ctx, id: u32, operator: &str) -> bool {
    ctx.is(id, "InfixExpression") && ctx.text(id, "Operator") == operator
}

fn confusing(ctx: &Ctx, id: Option<u32>) -> bool {
    let Some(id) = id else { return false };
    if ctx.is(id, "UnaryExpression") && ctx.text(id, "Operator") == "!" {
        return true;
    }
    if infix(ctx, id, "!=") {
        return ctx.kids(id).iter().all(|operand| !ctx.is(*operand, "NullLiteral"));
    }
    (infix(ctx, id, "&&") || infix(ctx, id, "||")) && confusing(ctx, ctx.nth(id, 0)) && confusing(ctx, ctx.nth(id, 1))
}

pub fn confusing_ternary(ctx: &Ctx, out: &mut Vec<Hit>) {
    let ignore_else_if = ctx.property_flag("ignoreElseIf", false);
    let mut found = Vec::new();
    for &statement in ctx.all("IfStatement") {
        if ctx.kids(statement).len() != 3 || !confusing(ctx, ctx.nth(statement, 0)) {
            continue;
        }
        let else_if = ctx.nth(statement, 2).is_some_and(|branch| ctx.is(branch, "IfStatement"));
        let nested = ctx.parent(statement).is_some_and(|parent| ctx.is(parent, "IfStatement"));
        if !ignore_else_if || (!else_if && !nested) {
            found.push(statement);
        }
    }
    for &ternary in ctx.all("ConditionalExpression") {
        if confusing(ctx, ctx.nth(ternary, 0)) {
            found.push(ternary);
        }
    }
    found.sort_unstable();
    out.extend(found.into_iter().map(hit));
}

fn this_field(ctx: &Ctx, id: u32) -> bool {
    let plain_this = |this: u32| ctx.is(this, "ThisExpression") && ctx.kids(this).is_empty();
    ctx.is(id, "FieldAccess") && ctx.qualifier(id).is_some_and(plain_this)
}

/// PMD's `JavaAstUtils.isReferenceToSameVar`.
pub fn same_variable(ctx: &Ctx, one: Option<u32>, other: Option<u32>) -> bool {
    let (Some(one), Some(other)) = (one, other) else { return false };
    let named = |id: u32| matches!(ctx.name(id), "VariableAccess" | "FieldAccess");
    if named(one) && named(other) {
        if ctx.text(one, "Name") != ctx.text(other, "Name") {
            return false;
        }
        let first = symbol(ctx, one);
        if first.is_none() || first != symbol(ctx, other) {
            return false;
        }
        if ctx.name(one) != ctx.name(other) {
            return this_field(ctx, one) || this_field(ctx, other);
        }
        if ctx.is(one, "FieldAccess") {
            return same_variable(ctx, ctx.qualifier(one), ctx.qualifier(other));
        }
        return true;
    }
    if ctx.is(one, "ThisExpression") || ctx.is(other, "ThisExpression") {
        return ctx.name(one) == ctx.name(other);
    }
    false
}

pub fn unsynchronized_static_formatter(ctx: &Ctx, out: &mut Vec<Hit>) {
    let method_sync = ctx.property_flag("allowMethodLevelSynchronization", false);
    for &declaration in ctx.all("FieldDeclaration") {
        if !ctx.has_modifier(declaration, "static") {
            continue;
        }
        let Some(written) = ctx.kid(declaration, "ClassType") else { continue };
        if !ctx.type_is(written, "java.text.Format") {
            continue;
        }
        let Some(variable) = ctx.kid(declaration, "VariableDeclarator").and_then(|at| ctx.kid(at, "VariableId")) else {
            continue;
        };
        if ctx.type_is(variable, "org.apache.commons.lang3.time.FastDateFormat") {
            continue;
        }
        for &usage in ctx.usages().of_variable(variable) {
            let Some(call) = ctx.parent(usage).filter(|parent| ctx.is(*parent, "MethodCall")) else { continue };
            let lock = ctx.enclosing(usage, &["SynchronizedStatement"]).and_then(|statement| ctx.nth(statement, 0));
            if lock.is_some() && same_variable(ctx, lock, ctx.qualifier(call)) {
                continue;
            }
            let method = ctx.enclosing(usage, &["MethodDeclaration"]);
            let synchronized = method
                .is_some_and(|method| ctx.has_modifier(method, "synchronized") && ctx.has_modifier(method, "static"));
            if method_sync && synchronized {
                continue;
            }
            if ctx.ancestors(usage).any(|at| ctx.is(at, "Initializer") && ctx.flag(at, "Static")) {
                continue;
            }
            out.push(hit(usage));
        }
    }
}

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
