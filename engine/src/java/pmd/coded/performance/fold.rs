//! PMD's `ConstantFolder` for numbers, characters and booleans, with Java's arithmetic.
use crate::java::pmd::coded::ctx::Ctx;
use crate::java::pmd::tree::Value;

#[derive(Clone, Copy, PartialEq)]
pub enum Constant {
    Int(i32),
    Long(i64),
    Float(f32),
    Double(f64),
    Char(u16),
    Bool(bool),
}

use Constant::{Bool, Char, Double, Float, Int, Long};

/// Integer division by zero, which makes PMD give up the rule for the rest of the file.
pub struct Thrown;

type Folded = Result<Option<Constant>, Thrown>;

impl Constant {
    pub fn is_zero(self) -> bool {
        match self {
            Int(value) => value == 0,
            Long(value) => value == 0,
            Float(value) => value == 0.0,
            Double(value) => value == 0.0,
            Char(value) => value == 0,
            Bool(_) => false,
        }
    }

    fn promoted(self) -> Option<Constant> {
        match self {
            Char(value) => Some(Int(i32::from(value))),
            Bool(_) => None,
            other => Some(other),
        }
    }

    fn int(self) -> i32 {
        match self {
            Int(value) => value,
            Long(value) => value as i32,
            Float(value) => value as i32,
            Double(value) => value as i32,
            Char(value) => i32::from(value),
            Bool(_) => 0,
        }
    }

    fn long(self) -> i64 {
        match self {
            Int(value) => i64::from(value),
            Long(value) => value,
            Float(value) => value as i64,
            Double(value) => value as i64,
            Char(value) => i64::from(value),
            Bool(_) => 0,
        }
    }

    fn float(self) -> f32 {
        match self {
            Float(value) => value,
            Double(value) => value as f32,
            other => other.long() as f32,
        }
    }

    fn double(self) -> f64 {
        match self {
            Float(value) => f64::from(value),
            Double(value) => value,
            other => other.long() as f64,
        }
    }
}

fn binary(left: Constant, right: Constant) -> Option<(Constant, Constant)> {
    let (left, right) = (left.promoted()?, right.promoted()?);
    Some(match (left, right) {
        (Double(_), _) | (_, Double(_)) => (Double(left.double()), Double(right.double())),
        (Float(_), _) | (_, Float(_)) => (Float(left.float()), Float(right.float())),
        (Long(_), _) | (_, Long(_)) => (Long(left.long()), Long(right.long())),
        _ => (Int(left.int()), Int(right.int())),
    })
}

fn arithmetic(operator: &str, left: Constant, right: Constant) -> Folded {
    let Some(pair) = binary(left, right) else {
        return Ok(None);
    };
    Ok(Some(match (operator, pair) {
        ("/" | "%", (Int(_), Int(0)) | (Long(_), Long(0))) => return Err(Thrown),
        ("+", (Int(a), Int(b))) => Int(a.wrapping_add(b)),
        ("-", (Int(a), Int(b))) => Int(a.wrapping_sub(b)),
        ("*", (Int(a), Int(b))) => Int(a.wrapping_mul(b)),
        ("/", (Int(a), Int(b))) => Int(a.wrapping_div(b)),
        ("%", (Int(a), Int(b))) => Int(a.wrapping_rem(b)),
        ("+", (Long(a), Long(b))) => Long(a.wrapping_add(b)),
        ("-", (Long(a), Long(b))) => Long(a.wrapping_sub(b)),
        ("*", (Long(a), Long(b))) => Long(a.wrapping_mul(b)),
        ("/", (Long(a), Long(b))) => Long(a.wrapping_div(b)),
        ("%", (Long(a), Long(b))) => Long(a.wrapping_rem(b)),
        ("+", (Float(a), Float(b))) => Float(a + b),
        ("-", (Float(a), Float(b))) => Float(a - b),
        ("*", (Float(a), Float(b))) => Float(a * b),
        ("/", (Float(a), Float(b))) => Float(a / b),
        ("%", (Float(a), Float(b))) => Float(a % b),
        ("+", (Double(a), Double(b))) => Double(a + b),
        ("-", (Double(a), Double(b))) => Double(a - b),
        ("*", (Double(a), Double(b))) => Double(a * b),
        ("/", (Double(a), Double(b))) => Double(a / b),
        ("%", (Double(a), Double(b))) => Double(a % b),
        _ => return Ok(None),
    }))
}

fn bitwise(operator: &str, left: Constant, right: Constant) -> Option<Constant> {
    let pair = match (left, right) {
        (Bool(a), Bool(b)) => {
            return Some(Bool(match operator {
                "&" => a & b,
                "|" => a | b,
                _ => a ^ b,
            }));
        }
        (Bool(_), _) | (_, Bool(_)) => return None,
        _ => binary(left, right)?,
    };
    Some(match pair {
        (Int(a), Int(b)) => Int(match operator {
            "&" => a & b,
            "|" => a | b,
            _ => a ^ b,
        }),
        (Long(a), Long(b)) => Long(match operator {
            "&" => a & b,
            "|" => a | b,
            _ => a ^ b,
        }),
        _ => return None,
    })
}

fn shift(operator: &str, left: Constant, right: Constant) -> Option<Constant> {
    let (left, right) = (left.promoted()?, right.promoted()?);
    if !matches!(right, Int(_) | Long(_)) {
        return None;
    }
    let distance = right.int() as u32;
    Some(match (operator, left) {
        ("<<", Int(a)) => Int(a.wrapping_shl(distance)),
        (">>", Int(a)) => Int(a.wrapping_shr(distance)),
        (">>>", Int(a)) => Int((a as u32).wrapping_shr(distance) as i32),
        ("<<", Long(a)) => Long(a.wrapping_shl(distance)),
        (">>", Long(a)) => Long(a.wrapping_shr(distance)),
        (">>>", Long(a)) => Long((a as u64).wrapping_shr(distance) as i64),
        _ => return None,
    })
}

fn compare(operator: &str, left: Constant, right: Constant) -> Option<Constant> {
    let ordering = match binary(left, right)? {
        (Int(a), Int(b)) => a.partial_cmp(&b),
        (Long(a), Long(b)) => a.partial_cmp(&b),
        (Float(a), Float(b)) => a.partial_cmp(&b),
        (Double(a), Double(b)) => a.partial_cmp(&b),
        _ => return None,
    };
    let equal = match binary(left, right)? {
        (Float(a), Float(b)) => a.to_bits() == b.to_bits(),
        (Double(a), Double(b)) => a.to_bits() == b.to_bits(),
        (a, b) => a == b,
    };
    use std::cmp::Ordering::{Greater, Less};
    Some(Bool(match operator {
        "==" => equal,
        "!=" => !equal,
        "<" => ordering == Some(Less),
        ">=" => ordering != Some(Less),
        "<=" => matches!(ordering, Some(Less) | Some(std::cmp::Ordering::Equal)),
        _ => !matches!(ordering, Some(Less) | Some(std::cmp::Ordering::Equal)),
    }))
}

fn infix(operator: &str, left: Constant, right: Constant) -> Folded {
    Ok(match operator {
        "||" | "&&" => match (left, right) {
            (Bool(a), Bool(b)) => Some(Bool(if operator == "||" { a || b } else { a && b })),
            _ => None,
        },
        "&" | "|" | "^" => bitwise(operator, left, right),
        "<<" | ">>" | ">>>" => shift(operator, left, right),
        "==" | "!=" | "<" | "<=" | ">" | ">=" => compare(operator, left, right),
        _ => return arithmetic(operator, left, right),
    })
}

fn cast(kind: &str, value: Constant) -> Option<Constant> {
    let value = value.promoted()?;
    Some(match kind {
        "char" => Char(value.int() as u16),
        "byte" => Int(i32::from(value.int() as i8)),
        "short" => Int(i32::from(value.int() as i16)),
        "int" => Int(value.int()),
        "long" => Long(value.long()),
        "float" => Float(value.float()),
        "double" => Double(value.double()),
        _ => return None,
    })
}

fn unary(operator: &str, value: Constant) -> Option<Constant> {
    if operator == "!" {
        return match value {
            Bool(value) => Some(Bool(!value)),
            _ => None,
        };
    }
    Some(match (operator, value.promoted()?) {
        ("+", promoted) => promoted,
        ("-", Int(a)) => Int(a.wrapping_neg()),
        ("-", Long(a)) => Long(a.wrapping_neg()),
        ("-", Float(a)) => Float(-a),
        ("-", Double(a)) => Double(-a),
        ("~", Int(a)) => Int(!a),
        ("~", Long(a)) => Long(!a),
        _ => return None,
    })
}

fn literal(ctx: &Ctx, id: u32) -> Option<Constant> {
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
