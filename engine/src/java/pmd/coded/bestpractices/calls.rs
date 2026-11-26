//! Best practices rules about method and constructor calls.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::{hit, hit_with};
use crate::java::types::model::{Type, flag};

pub fn literal_int(ctx: &Ctx, id: u32, value: i64) -> bool {
    ctx.is(id, "NumericLiteral")
        && (ctx.flag(id, "IntLiteral") || ctx.flag(id, "LongLiteral"))
        && ctx.whole(id, "ValueAsInt") == Some(value)
}

/// PMD's `JavaRuleUtil.isZeroChecked`.
pub fn zero_checked(ctx: &Ctx, expression: u32) -> bool {
    let Some(parent) = ctx
        .parent(expression)
        .filter(|parent| ctx.is(*parent, "InfixExpression"))
    else {
        return false;
    };
    let at = ctx.kids(parent).iter().position(|kid| *kid == expression).unwrap_or(0) as i64;
    let other = 1 - at;
    let expected = match ctx.text(parent, "Operator").as_str() {
        "==" | "!=" => 0,
        "<" | ">=" => other,
        ">" | "<=" => 1 - other,
        _ => return false,
    };
    ctx.nth(parent, other as usize)
        .is_some_and(|comparand| literal_int(ctx, comparand, expected))
}

pub fn use_collection_is_empty(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &call in ctx.all("MethodCall") {
        if ctx.method_name(call) != "size" || !ctx.arguments(call).is_empty() {
            continue;
        }
        let collection = ctx
            .qualifier(call)
            .is_some_and(|on| ctx.type_is(on, "java.util.Collection") || ctx.type_is(on, "java.util.Map"));
        if collection && zero_checked(ctx, call) {
            out.push(hit(call));
        }
    }
}

pub fn check_result_set(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &call in ctx.all("MethodCall") {
        if !matches!(ctx.method_name(call).as_str(), "next" | "previous" | "last" | "first") {
            continue;
        }
        if ctx
            .ancestors(call)
            .any(|at| matches!(ctx.name(at), "WhileStatement" | "ReturnStatement" | "IfStatement"))
        {
            continue;
        }
        if ctx.declaring(call).as_deref() == Some("java.sql.ResultSet") {
            out.push(hit(call));
        }
    }
}

pub fn use_enum_collections(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &call in ctx.all("ConstructorCall") {
        let Some(Type::Class(name, arguments)) = ctx.type_of(call) else {
            continue;
        };
        let replacement = match name.as_str() {
            "java.util.HashMap" => "EnumMap",
            "java.util.HashSet" => "EnumSet",
            _ => continue,
        };
        let Some(Type::Class(key, _)) = arguments.first() else {
            continue;
        };
        let index = ctx.machine.resolver.index;
        if index.get(key).is_some_and(|info| info.flags & flag::ENUM != 0)
            && let Some(written) = ctx.kid(call, "ClassType")
        {
            out.push(hit_with(written, &[replacement]));
        }
    }
}
