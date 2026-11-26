//! Rules about what fields and constructor arguments are initialized with.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit;

enum Constant {
    Number(f64),
    Char(u32),
}

fn constant(ctx: &Ctx, id: u32) -> Option<Constant> {
    match ctx.name(id) {
        "NumericLiteral" => match ctx.attribute(id, "ValueAsDouble") {
            Some(crate::java::pmd::tree::Value::Real(value)) => Some(Constant::Number(value)),
            _ => None,
        },
        "CharLiteral" => char_value(&ctx.text(id, "Image")).map(Constant::Char),
        "UnaryExpression" => {
            let inner = constant(ctx, ctx.nth(id, 0)?)?;
            let value = match inner {
                Constant::Number(value) => value,
                Constant::Char(value) => f64::from(value),
            };
            match ctx.text(id, "Operator").as_str() {
                "-" => Some(Constant::Number(-value)),
                "+" => Some(Constant::Number(value)),
                _ => None,
            }
        }
        "CastExpression" => {
            let kind = ctx.text(ctx.nth(id, 0)?, "Kind");
            let value = match constant(ctx, ctx.nth(id, 1)?)? {
                Constant::Number(value) => value,
                Constant::Char(value) => f64::from(value),
            };
            match kind.as_str() {
                "char" => Some(Constant::Char(value as u32)),
                "double" | "float" => Some(Constant::Number(value)),
                "" | "boolean" => None,
                _ => Some(Constant::Number(value.trunc())),
            }
        }
        "InfixExpression" => {
            let number = |kid: Option<u32>| match constant(ctx, kid?)? {
                Constant::Number(value) => Some((value, whole(ctx, kid?))),
                Constant::Char(value) => Some((f64::from(value), true)),
            };
            let ((left, whole_left), (right, whole_right)) = (number(ctx.nth(id, 0))?, number(ctx.nth(id, 1))?);
            let integral = whole_left && whole_right;
            let value = match ctx.text(id, "Operator").as_str() {
                "+" => left + right,
                "-" => left - right,
                "*" => left * right,
                "/" if integral && right != 0.0 => (left / right).trunc(),
                "/" => left / right,
                "%" => left % right,
                _ => return None,
            };
            Some(Constant::Number(value))
        }
        _ => None,
    }
}

/// Whether an expression of numbers has a whole number type.
fn whole(ctx: &Ctx, id: u32) -> bool {
    match ctx.name(id) {
        "NumericLiteral" => ctx.flag(id, "IntLiteral") || ctx.flag(id, "LongLiteral"),
        "CharLiteral" => true,
        "CastExpression" => ctx
            .nth(id, 0)
            .is_some_and(|kind| !matches!(ctx.text(kind, "Kind").as_str(), "double" | "float")),
        _ => ctx.kids(id).iter().all(|kid| whole(ctx, *kid)),
    }
}

/// The value of a character literal from its image, where unicode escapes are already replaced.
fn char_value(image: &str) -> Option<u32> {
    let inner = image.strip_prefix('\'')?.strip_suffix('\'')?;
    let Some(escape) = inner.strip_prefix('\\') else {
        return inner.chars().next().map(|value| value as u32);
    };
    Some(match escape.chars().next()? {
        'n' => 10,
        't' => 9,
        'r' => 13,
        'b' => 8,
        'f' => 12,
        's' => 32,
        digit if digit.is_digit(8) => u32::from_str_radix(escape, 8).ok()?,
        other => other as u32,
    })
}

fn default_value(ctx: &Ctx, primitive: Option<&str>, value: u32) -> bool {
    match primitive {
        Some("boolean") => ctx.is(value, "BooleanLiteral") && !ctx.flag(value, "True"),
        Some(_) => match constant(ctx, value) {
            Some(Constant::Number(number)) => number == 0.0,
            Some(Constant::Char(code)) => code == 0,
            None => false,
        },
        None => ctx.is(value, "NullLiteral"),
    }
}

pub fn redundant_field_initializer(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &field in ctx.all("FieldDeclaration") {
        if ctx.has_modifier(field, "final") {
            continue;
        }
        if ctx
            .enclosing_type(field)
            .is_some_and(|owner| ctx.annotation_present(owner, "lombok.Value"))
        {
            continue;
        }
        let written = ctx
            .kids(field)
            .iter()
            .copied()
            .find(|kid| !matches!(ctx.name(*kid), "ModifierList" | "VariableDeclarator"));
        let primitive = written
            .filter(|kind| ctx.is(*kind, "PrimitiveType"))
            .map(|kind| ctx.text(kind, "Kind"));
        for declarator in ctx.kids_named(field, "VariableDeclarator") {
            let (Some(variable), Some(value)) = (ctx.kid(declarator, "VariableId"), ctx.nth(declarator, 1)) else {
                continue;
            };
            let reads = std::iter::once(value).chain(ctx.descendants(value));
            if reads
                .into_iter()
                .any(|at| matches!(ctx.name(at), "VariableAccess" | "FieldAccess"))
            {
                continue;
            }
            let primitive = primitive
                .as_deref()
                .filter(|_| ctx.kid(variable, "ArrayDimensions").is_none());
            if default_value(ctx, primitive, value) {
                out.push(hit(variable));
            }
        }
    }
}

fn hard_coded(ctx: &Ctx, class: &str, out: &mut Vec<Hit>) {
    for &call in ctx.all("ConstructorCall") {
        if ctx.type_is(call, class)
            && let Some(first) = ctx.arguments(call).first()
        {
            key_argument(ctx, Some(*first), out, 0);
        }
    }
}

fn key_argument(ctx: &Ctx, argument: Option<u32>, out: &mut Vec<Hit>, depth: usize) {
    let Some(argument) = argument.filter(|_| depth < 64) else {
        return;
    };
    let access = match ctx.name(argument) {
        "MethodCall" => ctx.qualifier(argument).filter(|on| ctx.is(*on, "VariableAccess")),
        "VariableAccess" => Some(argument),
        _ => None,
    };
    if let Some(variable) = access.and_then(|access| ctx.usages().declaration(access)) {
        let declarator = ctx
            .parent(variable)
            .filter(|parent| ctx.is(*parent, "VariableDeclarator"));
        key_argument(
            ctx,
            declarator.and_then(|declarator| ctx.nth(declarator, 1)),
            out,
            depth + 1,
        );
        for usage in ctx.usages().of_variable(variable) {
            let assignment = ctx
                .parent(*usage)
                .filter(|parent| ctx.is(*parent, "AssignmentExpression"));
            if ctx.text(*usage, "AccessType") == "WRITE"
                && let Some(assignment) = assignment
            {
                key_argument(ctx, ctx.nth(assignment, 1), out, depth + 1);
            }
        }
    } else if access.is_some_and(|access| ctx.resolves(access)) {
        return;
    } else if ctx.is(argument, "ArrayAllocation") {
        if let Some(initializer) = ctx.kid(argument, "ArrayInitializer") {
            out.push(hit(initializer));
        }
    } else if let Some(literal) = std::iter::once(argument)
        .chain(ctx.descendants(argument))
        .find(|at| ctx.is(*at, "StringLiteral"))
    {
        out.push(hit(literal));
    }
}

pub fn hard_coded_crypto_key(ctx: &Ctx, out: &mut Vec<Hit>) {
    hard_coded(ctx, "javax.crypto.spec.SecretKeySpec", out);
}

pub fn insecure_crypto_iv(ctx: &Ctx, out: &mut Vec<Hit>) {
    hard_coded(ctx, "javax.crypto.spec.IvParameterSpec", out);
}
