//! PMD's `getConstValue`: the value an expression folds to, following final variables to their initializers and
//! joining strings.
use super::ctx::Ctx;
use super::performance::fields::char_value;
use super::performance::fold::{Constant, Thrown, cast, infix, literal, unary};

#[derive(Clone, PartialEq)]
pub enum Const {
    Number(Constant),
    Text(String),
}

pub type Value = Result<Option<Const>, Thrown>;
type Folded = Result<Option<(Const, bool)>, Thrown>;

const DEPTH: usize = 32;

/// PMD's `getConstValue`: the value of a compile-time constant expression.
pub fn const_value(ctx: &Ctx, id: u32) -> Value {
    Ok(value(ctx, id, DEPTH)?.filter(|(_, constant)| *constant).map(|(found, _)| found))
}

/// PMD's `getConstFoldingResult().getValue()`: also follows final locals and instance fields.
pub fn folded_value(ctx: &Ctx, id: u32) -> Value {
    Ok(value(ctx, id, DEPTH)?.map(|(found, _)| found))
}

/// The value as Java's `String.valueOf` writes it, when the engine can write it the way Java does.
pub fn written(value: &Const) -> Option<String> {
    Some(match value {
        Const::Text(text) => text.clone(),
        Const::Number(Constant::Int(value)) => value.to_string(),
        Const::Number(Constant::Long(value)) => value.to_string(),
        Const::Number(Constant::Bool(value)) => value.to_string(),
        Const::Number(Constant::Char(value)) => String::from_utf16(&[*value]).ok()?,
        Const::Number(Constant::Double(value)) => real(*value, value.abs(), value.is_nan()),
        Const::Number(Constant::Float(value)) => real(*value, f64::from(value.abs()), value.is_nan()),
    })
}

fn real<T: std::fmt::Display + std::fmt::LowerExp>(value: T, size: f64, nan: bool) -> String {
    if nan {
        return "NaN".to_string();
    }
    if size.is_infinite() {
        return format!("{value}").replace("inf", "Infinity");
    }
    if size == 0.0 || (1e-3..1e7).contains(&size) {
        let text = format!("{value}");
        return if text.contains('.') { text } else { text + ".0" };
    }
    let text = format!("{value:e}");
    let (digits, exponent) = text.split_once('e').unwrap_or((&text, "0"));
    let digits = if digits.contains('.') { digits.to_string() } else { format!("{digits}.0") };
    format!("{digits}E{exponent}")
}

fn number(found: Option<(Const, bool)>) -> Option<(Constant, bool)> {
    match found {
        Some((Const::Number(number), constant)) => Some((number, constant)),
        _ => None,
    }
}

fn value(ctx: &Ctx, id: u32, depth: usize) -> Folded {
    if depth == 0 {
        return Ok(None);
    }
    let operand = |at: usize| match ctx.nth(id, at) {
        Some(kid) => value(ctx, kid, depth - 1),
        None => Ok(None),
    };
    let literal_value = |found: Option<Const>| found.map(|found| (found, true));
    Ok(match ctx.name(id) {
        "StringLiteral" => literal_value(Some(Const::Text(ctx.text(id, "ConstValue")))),
        "NumericLiteral" => literal_value(literal(ctx, id).map(Const::Number)),
        "CharLiteral" => literal_value(
            char_value(&ctx.text(id, "Image")).map(|code| Const::Number(Constant::Char(code as u16))),
        ),
        "BooleanLiteral" => literal_value(Some(Const::Number(Constant::Bool(ctx.flag(id, "True"))))),
        "VariableAccess" => return variable(ctx, id, depth),
        "FieldAccess" => return field(ctx, id, depth),
        "UnaryExpression" => number(operand(0)?).and_then(|(found, constant)| {
            unary(&ctx.text(id, "Operator"), found).map(|found| (Const::Number(found), constant))
        }),
        "CastExpression" => {
            let Some((found, constant)) = operand(1)? else { return Ok(None) };
            let Some(kind) = ctx.nth(id, 0) else { return Ok(None) };
            let cast_value = if ctx.is(kind, "PrimitiveType") {
                number(Some((found, constant)))
                    .and_then(|(found, _)| cast(&ctx.text(kind, "Kind"), found))
                    .map(Const::Number)
            } else if ctx.type_is_exactly(kind, "java.lang.String") {
                written(&found).map(Const::Text)
            } else {
                None
            };
            cast_value.map(|found| (found, constant))
        }
        "InfixExpression" => match (operand(0)?, operand(1)?) {
            (Some((left, one)), Some((right, other))) => {
                joined(&ctx.text(id, "Operator"), left, right)?.map(|found| (found, one && other))
            }
            _ => None,
        },
        "ConditionalExpression" => match operand(0)? {
            Some((condition, first)) => match (operand(1)?, operand(2)?) {
                (Some((then, second)), Some((otherwise, third))) => {
                    let constant = first && second && third;
                    Some(match condition {
                        Const::Number(Constant::Bool(true)) => (then, constant),
                        _ => (otherwise, constant),
                    })
                }
                _ => None,
            },
            None => None,
        },
        _ => None,
    })
}

fn joined(operator: &str, left: Const, right: Const) -> Value {
    Ok(match (left, right) {
        (Const::Number(left), Const::Number(right)) => infix(operator, left, right)?.map(Const::Number),
        (left, right) if operator == "+" => match (written(&left), written(&right)) {
            (Some(left), Some(right)) => Some(Const::Text(left + &right)),
            _ => None,
        },
        _ => None,
    })
}

fn variable(ctx: &Ctx, access: u32, depth: usize) -> Folded {
    let Some(variable) = ctx.usages().declaration(access) else {
        return Ok(outside(ctx, access));
    };
    if !ctx.flag(variable, "Final") {
        return Ok(None);
    }
    let initializer = ctx
        .parent(variable)
        .filter(|declarator| ctx.is(*declarator, "VariableDeclarator"))
        .and_then(|declarator| ctx.nth(declarator, 1));
    let Some(initializer) = initializer else { return Ok(None) };
    let constant_field = ctx.flag(variable, "Field") && ctx.flag(variable, "Static");
    Ok(value(ctx, initializer, depth - 1)?.map(|(found, constant)| (found, constant && constant_field)))
}

fn field(ctx: &Ctx, access: u32, depth: usize) -> Folded {
    let Some(variable) = ctx.usages().declaration(access) else {
        return Ok(outside(ctx, access));
    };
    if !ctx.flag(variable, "Final") || !ctx.flag(variable, "Static") {
        return Ok(None);
    }
    let initializer = ctx
        .parent(variable)
        .filter(|declarator| ctx.is(*declarator, "VariableDeclarator"))
        .and_then(|declarator| ctx.nth(declarator, 1));
    let Some(initializer) = initializer else { return Ok(None) };
    Ok(value(ctx, initializer, depth - 1)?.filter(|(_, constant)| *constant))
}

fn outside(ctx: &Ctx, access: u32) -> Option<(Const, bool)> {
    use crate::java::types::expr::Binding;
    let source = ctx.tree.nodes[access as usize].source?;
    let resolver = ctx.machine.resolver;
    let name = ctx.text(access, "Name");
    let field = match ctx.name(access) {
        "VariableAccess" => match resolver.binding(source, &name)? {
            Binding::Field(_, _, field) => field,
            Binding::Local(_) => return None,
        },
        _ => {
            let owner = ctx.type_of(ctx.nth(access, 0)?)?;
            resolver.index.field(&owner.erased().name(), &name)?.1
        }
    };
    use crate::java::types::model::Type;
    let found = match (&field.constant, field.number, &field.kind) {
        (Some(text), _, _) => Const::Text(text.clone()),
        (None, Some(number), Type::Primitive(kind)) => Const::Number(match *kind {
            "int" | "short" | "byte" | "char" | "boolean" => Constant::Int(number as i32),
            "long" => Constant::Long(number),
            "float" => Constant::Float(f32::from_bits(number as u32)),
            "double" => Constant::Double(f64::from_bits(number as u64)),
            _ => return None,
        }),
        _ => return None,
    };
    Some((found, true))
}
