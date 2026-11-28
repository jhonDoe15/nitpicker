//! Error prone rules about null checks.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::design::paths::{StablePath, other_operand};
use crate::java::pmd::coded::hit_saying;
use crate::java::types::model::Type;

const QUALIFIABLE: &[&str] = &["MethodCall", "FieldAccess", "ConstructorCall", "ArrayAccess", "MethodReference"];
const DEREFERENCE: &str = "Dereferencing the qualifier of this expression will throw a NullPointerException";
const UNBOXING: &str = "Unboxing this operand will throw a NullPointerException";

fn primitive(ctx: &Ctx, id: Option<u32>) -> bool {
    id.is_some_and(|id| matches!(ctx.type_of(id), Some(Type::Primitive(_))))
}

fn unboxes(ctx: &Ctx, infix: u32) -> bool {
    let operator = ctx.text(infix, "Operator");
    if operator == "instanceof" {
        return false;
    }
    let (left, right) = (primitive(ctx, ctx.nth(infix, 0)), primitive(ctx, ctx.nth(infix, 1)));
    left != right || (operator != "!=" && operator != "==")
}

fn npe_reason(ctx: &Ctx, expression: u32, path: &StablePath) -> Option<&'static str> {
    if QUALIFIABLE.contains(&ctx.name(expression)) && path.matches(ctx, ctx.qualifier(expression)) {
        return Some(DEREFERENCE);
    }
    let infix = ctx.parent(expression).filter(|parent| ctx.is(*parent, "InfixExpression"))?;
    (path.matches(ctx, Some(expression)) && unboxes(ctx, infix)).then_some(UNBOXING)
}

pub fn broken_null_check(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &conditional in ctx.all("InfixExpression") {
        let Some(left) = ctx.nth(conditional, 0).filter(|left| ctx.is(*left, "InfixExpression")) else {
            continue;
        };
        let (inner, outer) = (ctx.text(left, "Operator"), ctx.text(conditional, "Operator"));
        let harmless = (inner == "!=" && outer == "&&") || (inner == "==" && outer == "||");
        if !matches!(inner.as_str(), "==" | "!=") || harmless {
            continue;
        }
        let Some(null) = ctx.kid(left, "NullLiteral") else { continue };
        let Some(path) = other_operand(ctx, null).and_then(|other| StablePath::of(ctx, other)) else {
            continue;
        };
        let Some(right) = ctx.nth(conditional, 1) else { continue };
        let checked = std::iter::once(right).chain(ctx.descendants(right));
        for expression in checked.filter(|at| ctx.is_expression(*at)) {
            if let Some(reason) = npe_reason(ctx, expression, &path) {
                out.push(hit_saying(expression, reason.to_string()));
            }
        }
    }
}
