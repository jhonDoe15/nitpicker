//! Rules about calls to varargs methods.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit;
use crate::java::types::model::Type;

/// The last formal of a varargs method a call reaches without spreading its arguments into the array.
fn array_passed(ctx: &Ctx, call: u32) -> Option<Type> {
    let (resolved, formals) = ctx.resolved(call)?;
    if !resolved.method.varargs {
        return None;
    }
    let last = if resolved.raw {
        formals.last()?.clone()
    } else {
        let source = ctx.tree.nodes[call as usize].source?;
        let map = ctx.machine.resolver.call_map(&resolved, source, true);
        let fitted = resolved.method.generic_parameters.last()?.substitute(&map);
        if fitted.open() {
            return None;
        }
        fitted
    };
    let arguments = ctx.arguments(call);
    if arguments.len() != formals.len() {
        return None;
    }
    let passed = ctx.type_of(*arguments.last()?)?;
    ctx.machine.resolver.assignable(&passed, &last, false).then_some(last)
}

fn subtype(ctx: &Ctx, passed: &Type, of: &Type) -> bool {
    let index = ctx.machine.resolver.index;
    match (passed, of) {
        (Type::Null, Type::Primitive(_)) => false,
        (Type::Null, _) => true,
        (Type::Class(name, _), Type::Class(target, _)) => index.is_subtype(name, target),
        (Type::Array(_), Type::Class(target, _)) => {
            matches!(target.as_str(), "java.lang.Object" | "java.lang.Cloneable" | "java.io.Serializable")
        }
        (Type::Array(one), Type::Array(other)) => match (one.as_ref(), other.as_ref()) {
            (Type::Primitive(_), _) | (_, Type::Primitive(_)) => one == other,
            (one, other) => subtype(ctx, one, other),
        },
        (one, other) => one == other,
    }
}

fn simple(kind: &Type, out: &mut String) {
    match kind {
        Type::Primitive(name) => out.push_str(name),
        Type::Class(name, arguments) => {
            out.push_str(name.rsplit(['.', '$']).next().unwrap_or(name));
            if !arguments.is_empty() {
                out.push('<');
                for (at, argument) in arguments.iter().enumerate() {
                    if at > 0 {
                        out.push_str(", ");
                    }
                    simple(argument, out);
                }
                out.push('>');
            }
        }
        Type::Array(component) => {
            simple(component, out);
            out.push_str("[]");
        }
        Type::Variable(name) => out.push_str(name),
        Type::Wildcard => out.push('?'),
        Type::Bounded(lower, bound) => {
            out.push_str(if *lower { "? super " } else { "? extends " });
            simple(bound, out);
        }
        Type::Null => out.push_str("null"),
    }
}

pub fn confusing_argument_to_varargs_method(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &list in ctx.all("ArgumentList") {
        let Some(last) = ctx.kids(list).last().copied() else { continue };
        let Some(call) = ctx.parent(list) else { continue };
        let Some(Type::Array(component)) = array_passed(ctx, call) else { continue };
        let Some(passed) = ctx.type_of(last) else { continue };
        if !subtype(ctx, &passed, &component) || passed == Type::Array(component.clone()) {
            continue;
        }
        let mut shown = String::new();
        simple(&component, &mut shown);
        let initialized = ctx.is(last, "ArrayAllocation") && ctx.kid(last, "ArrayInitializer").is_some();
        let advice = if initialized { ", or pass varargs parameters separately" } else { "" };
        let start = "Unclear if a varargs or non-varargs call is intended.";
        let pattern = format!("{start} Cast to {{0}} or {{0}}[]{advice} to clarify intent.");
        out.push(Hit { node: last, args: vec![shown], message: Some(pattern) });
    }
}

pub fn unnecessary_varargs_array_creation(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &array in ctx.all("ArrayAllocation") {
        if ctx.kid(array, "ArrayInitializer").is_none() {
            continue;
        }
        let Some(list) = ctx.parent(array).filter(|list| ctx.is(*list, "ArgumentList")) else { continue };
        if ctx.kids(list).last() != Some(&array) {
            continue;
        }
        let Some(last) = ctx.parent(list).and_then(|call| array_passed(ctx, call)) else { continue };
        if ctx.type_of(array) == Some(last) {
            out.push(hit(array));
        }
    }
}
