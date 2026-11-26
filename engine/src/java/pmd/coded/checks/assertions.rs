//! Assertions that a more specific assertion method states more plainly.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit_with;
use crate::java::types::model::Type;

const ASSERT_CONTAINERS: &[&str] = &[
    "org.junit.Assert",
    "org.junit.jupiter.api.Assertions",
    "org.hamcrest.MatcherAssert",
    "org.testng.Assert",
    "junit.framework.Assert",
    "junit.framework.TestCase",
];
const OBJECT_EQUALS: &str = "_#equals(java.lang.Object)";

fn assertion(ctx: &Ctx, call: u32, name: &str) -> bool {
    if ctx.method_name(call) != name {
        return false;
    }
    let Some((resolved, _)) = ctx.resolved(call) else { return false };
    let index = ctx.machine.resolver.index;
    ASSERT_CONTAINERS.contains(&resolved.declaring.as_str()) || index.is_subtype(&resolved.declaring, "junit.framework.Assert")
}

fn equality(ctx: &Ctx, expression: Option<u32>) -> Option<u32> {
    expression.filter(|at| ctx.is(*at, "InfixExpression") && matches!(ctx.text(*at, "Operator").as_str(), "==" | "!="))
}

fn negated(ctx: &Ctx, expression: Option<u32>) -> Option<u32> {
    let negation = expression.filter(|at| ctx.is(*at, "UnaryExpression") && ctx.text(*at, "Operator") == "!")?;
    ctx.nth(negation, 0)
}

fn equals_call(ctx: &Ctx, expression: Option<u32>) -> bool {
    expression.is_some_and(|at| ctx.is(at, "MethodCall") && ctx.matches_sig(at, OBJECT_EQUALS))
}

fn primitive(ctx: &Ctx, expression: Option<u32>) -> bool {
    expression.and_then(|at| ctx.type_of(at)).is_some_and(|kind| matches!(kind, Type::Primitive(_)))
}

fn truth(ctx: &Ctx, call: u32, positive: bool, out: &mut Vec<Hit>) {
    let last = ctx.arguments(call).last().copied();
    if let Some(equality) = equality(ctx, last) {
        let positive = (ctx.text(equality, "Operator") == "==") == positive;
        let (left, right) = (ctx.nth(equality, 0), ctx.nth(equality, 1));
        let null = |side: Option<u32>| side.is_some_and(|at| ctx.is(at, "NullLiteral"));
        let suggestion = match (null(left) || null(right), primitive(ctx, left) || primitive(ctx, right), positive) {
            (true, _, true) => "assertNull",
            (true, _, false) => "assertNonNull",
            (false, true, true) => "assertEquals",
            (false, true, false) => "assertNotEquals",
            (false, false, true) => "assertSame",
            (false, false, false) => "assertNotSame",
        };
        out.push(hit_with(call, &[suggestion]));
        return;
    }
    let operand = negated(ctx, last);
    let suggestion = if equals_call(ctx, operand) {
        if positive { "assertNotEquals" } else { "assertEquals" }
    } else if operand.is_some() {
        if positive { "assertFalse" } else { "assertTrue" }
    } else if equals_call(ctx, last) {
        if positive { "assertEquals" } else { "assertNotEquals" }
    } else {
        return;
    };
    out.push(hit_with(call, &[suggestion]));
}

pub fn simplifiable_test_assertion(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &call in ctx.all("MethodCall") {
        let is_true = assertion(ctx, call, "assertTrue");
        if is_true || assertion(ctx, call, "assertFalse") {
            truth(ctx, call, is_true, out);
        }
        let equals = assertion(ctx, call, "assertEquals");
        if !equals && !assertion(ctx, call, "assertNotEquals") {
            continue;
        }
        let arguments = ctx.arguments(call);
        if arguments.len() < 2 {
            continue;
        }
        let (mut first, mut second) = (arguments[arguments.len() - 1], arguments[arguments.len() - 2]);
        let literal = |at: u32| ctx.is(at, "BooleanLiteral");
        if literal(first) == literal(second) {
            continue;
        }
        if literal(second) {
            std::mem::swap(&mut first, &mut second);
        }
        if ctx.type_of(second).is_some_and(|kind| kind == Type::Primitive("boolean")) {
            let suggestion = if ctx.flag(first, "True") == equals { "assertTrue" } else { "assertFalse" };
            out.push(hit_with(call, &[suggestion]));
        }
    }
}
