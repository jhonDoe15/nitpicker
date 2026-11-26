//! Performance rules about strings.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit;
use crate::java::types::model::Type;

pub fn use_index_of_char(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &call in ctx.all("MethodCall") {
        if !matches!(ctx.method_name(call).as_str(), "indexOf" | "lastIndexOf") {
            continue;
        }
        if !ctx
            .qualifier(call)
            .is_some_and(|on| ctx.type_is(on, "java.lang.String"))
        {
            continue;
        }
        let first = ctx.arguments(call).first().copied();
        if first
            .and_then(|argument| ctx.string_value(argument))
            .is_some_and(|value| value.encode_utf16().count() == 1)
        {
            out.push(hit(call));
        }
    }
}

pub fn string_instantiation(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &call in ctx.all("ConstructorCall") {
        let arguments = ctx.arguments(call);
        let Some(written) = ctx.kid(call, "ClassType") else {
            continue;
        };
        if arguments.len() > 1 || !ctx.type_is_exactly(written, "java.lang.String") {
            continue;
        }
        if let Some(only) = arguments.first() {
            let unresolved = ctx.type_of(*only).is_none_or(
                |kind| matches!(kind, Type::Class(ref name, _) if ctx.machine.resolver.index.get(name).is_none()),
            );
            if ctx.type_is_exactly(*only, "byte[]") || ctx.type_is_exactly(*only, "char[]") || unresolved {
                continue;
            }
        }
        out.push(hit(call));
    }
}

fn plus_outside_annotation(ctx: &Ctx, id: u32) -> bool {
    ctx.is(id, "InfixExpression") && ctx.text(id, "Operator") == "+" && ctx.enclosing(id, &["Annotation"]).is_none()
}

pub fn add_empty_string(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &literal in ctx.all("StringLiteral") {
        if !ctx.flag(literal, "Empty") {
            continue;
        }
        let Some(parent) = ctx.parent(literal) else { continue };
        if plus_outside_annotation(ctx, parent) {
            out.push(hit(parent));
        }
        if !ctx.is(parent, "VariableDeclarator") {
            continue;
        }
        let Some(variable) = ctx
            .kid(parent, "VariableId")
            .filter(|variable| ctx.flag(*variable, "Final"))
        else {
            continue;
        };
        for usage in ctx.usages().of_variable(variable) {
            if let Some(outer) = ctx.parent(*usage).filter(|outer| plus_outside_annotation(ctx, *outer)) {
                out.push(hit(outer));
            }
        }
    }
}

pub fn append_character_with_char(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &literal in ctx.all("StringLiteral") {
        let Some(list) = ctx.parent(literal).filter(|list| ctx.is(*list, "ArgumentList")) else {
            continue;
        };
        if ctx.whole(literal, "Length") != Some(1) || ctx.kids(list).len() != 1 {
            continue;
        }
        let Some(call) = ctx.parent(list).filter(|call| ctx.is(*call, "MethodCall")) else {
            continue;
        };
        let declaring = ctx.declaring(call);
        if ctx.method_name(call) == "append"
            && matches!(
                declaring.as_deref(),
                Some("java.lang.StringBuilder" | "java.lang.StringBuffer")
            )
        {
            out.push(hit(literal));
        }
    }
}

fn value_of_argument(ctx: &Ctx, id: u32) -> Option<u32> {
    if !ctx.is(id, "MethodCall")
        || ctx.method_name(id) != "valueOf"
        || ctx.declaring(id).as_deref() != Some("java.lang.String")
    {
        return None;
    }
    let arguments = ctx.arguments(id);
    (arguments.len() == 1).then(|| arguments[0])
}

pub fn useless_string_value_of(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &call in ctx.all("MethodCall") {
        let Some(parent) = ctx.parent(call) else { continue };
        if !(ctx.is(parent, "InfixExpression")
            && ctx.text(parent, "Operator") == "+"
            && ctx.type_is(parent, "java.lang.String"))
        {
            continue;
        }
        let Some(argument) = value_of_argument(ctx, call) else {
            continue;
        };
        if ctx.type_is_exactly(argument, "java.lang.String") {
            out.push(hit(call));
            continue;
        }
        let at = ctx.kids(parent).iter().position(|kid| *kid == call).unwrap_or(0);
        let Some(sibling) = ctx.nth(parent, 1 - at.min(1)) else {
            continue;
        };
        let array = matches!(ctx.type_of(argument), Some(Type::Array(_)));
        if ctx.type_is_exactly(sibling, "java.lang.String")
            && !array
            && (value_of_argument(ctx, sibling).is_none() || at == 1)
        {
            out.push(hit(call));
        }
    }
}
