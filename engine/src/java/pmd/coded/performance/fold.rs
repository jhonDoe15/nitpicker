//! PMD's `ConstantFolder` for numbers, characters and booleans, with Java's arithmetic.
use crate::java::pmd::coded::ctx::Ctx;
use crate::java::pmd::tree::Value;
pub use crate::java::types::constant::{Constant, Folded, Thrown, cast, infix, unary};
use Constant::{Bool, Char, Double, Float, Int, Long};

pub(in crate::java::pmd::coded) fn literal(ctx: &Ctx, id: u32) -> Option<Constant> {
    let whole = |name| match ctx.attribute(id, name) {
        Some(Value::Whole(value)) => Some(value),
        _ => None,
    };
    let real = match ctx.attribute(id, "ValueAsDouble") {
        Some(Value::Real(value)) => value,
        _ => return None,
    };
    Some(if ctx.flag(id, "IntLiteral") {
        Int(whole("ValueAsInt")? as i32)
    } else if ctx.flag(id, "LongLiteral") {
        Long(whole("ValueAsLong")?)
    } else if ctx.flag(id, "FloatLiteral") {
        Float(real as f32)
    } else {
        Double(real)
    })
}

pub fn fold(ctx: &Ctx, id: u32) -> Folded {
    let operand = |at: usize| match ctx.nth(id, at) {
        Some(kid) => fold(ctx, kid),
        None => Ok(None),
    };
    Ok(match ctx.name(id) {
        "NumericLiteral" => literal(ctx, id),
        "CharLiteral" => super::fields::char_value(&ctx.text(id, "Image")).map(|code| Char(code as u16)),
        "BooleanLiteral" => Some(Bool(ctx.flag(id, "True"))),
        "UnaryExpression" => operand(0)?.and_then(|value| unary(&ctx.text(id, "Operator"), value)),
        "CastExpression" => {
            let kind = ctx.nth(id, 0).filter(|kind| ctx.is(*kind, "PrimitiveType"));
            let value = operand(1)?;
            kind.zip(value)
                .and_then(|(kind, value)| cast(&ctx.text(kind, "Kind"), value))
        }
        "InfixExpression" => match (operand(0)?, operand(1)?) {
            (Some(left), Some(right)) => infix(&ctx.text(id, "Operator"), left, right)?,
            _ => None,
        },
        "ConditionalExpression" => match operand(0)? {
            Some(condition) => {
                let (then, otherwise) = (operand(1)?, operand(2)?);
                match (then, otherwise) {
                    (Some(then), Some(otherwise)) => Some(if condition == Bool(true) { then } else { otherwise }),
                    _ => None,
                }
            }
            None => None,
        },
        _ => None,
    })
}
