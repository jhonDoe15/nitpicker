//! Rules about what fields and constructor arguments are initialized with.
use super::fold::{Thrown, fold};
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit;

pub use crate::java::types::constant::char_value;

fn default_value(ctx: &Ctx, primitive: Option<&str>, value: u32) -> Result<bool, Thrown> {
    Ok(match primitive {
        Some("boolean") => ctx.is(value, "BooleanLiteral") && !ctx.flag(value, "True"),
        Some(_) => fold(ctx, value)?.is_some_and(|constant| constant.is_zero()),
        None => ctx.is(value, "NullLiteral"),
    })
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
            match default_value(ctx, primitive, value) {
                Ok(true) => out.push(hit(variable)),
                Ok(false) => {}
                Err(Thrown) => break,
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
