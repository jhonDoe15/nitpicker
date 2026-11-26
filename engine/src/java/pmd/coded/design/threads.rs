//! Multithreading rules about shared fields.
use super::paths::{StablePath, Symbol, null_check, symbol};
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit;
use crate::java::types::model::flag;
use std::collections::HashSet;

fn named(ctx: &Ctx, id: u32) -> bool {
    matches!(ctx.name(id), "VariableAccess" | "FieldAccess")
}

fn field_symbol(ctx: &Ctx, found: &Option<Symbol>) -> bool {
    match found {
        Some(Symbol::Declared(variable)) => ctx.flag(*variable, "Field"),
        Some(Symbol::Field(..)) => true,
        None => false,
    }
}

pub fn non_thread_safe_singleton(ctx: &Ctx, out: &mut Vec<Hit>) {
    let non_static_methods = ctx.property_flag("checkNonStaticMethods", true);
    let non_static_fields = ctx.property_flag("checkNonStaticFields", false);
    let mut members = ctx.all("FieldDeclaration").to_vec();
    members.extend_from_slice(ctx.all("MethodDeclaration"));
    members.sort_unstable();
    let mut fields = HashSet::new();
    for member in members {
        if ctx.is(member, "FieldDeclaration") {
            if non_static_fields || ctx.has_modifier(member, "static") {
                for declarator in ctx.kids_named(member, "VariableDeclarator") {
                    ctx.kid(declarator, "VariableId").into_iter().for_each(|id| {
                        fields.insert(ctx.text(id, "Name"));
                    });
                }
            }
            continue;
        }
        let fixed = ctx.has_modifier(member, "static");
        if (non_static_methods && !fixed) || ctx.has_modifier(member, "synchronized") {
            continue;
        }
        for statement in ctx.descendants(member) {
            if !ctx.is(statement, "IfStatement") {
                continue;
            }
            let Some(condition) = ctx.nth(statement, 0) else { continue };
            let inside = ctx.descendants(condition);
            if !inside.iter().any(|at| ctx.is(*at, "NullLiteral")) {
                continue;
            }
            let first = inside.iter().copied().find(|at| named(ctx, *at));
            if !first.is_some_and(|first| fields.contains(&ctx.text(first, "Name"))) {
                continue;
            }
            let violation = ctx.descendants(statement).into_iter().any(|assignment| {
                ctx.is(assignment, "AssignmentExpression")
                    && ctx.enclosing(assignment, &["SynchronizedStatement"]).is_none()
                    && ctx.nth(assignment, 0).is_some_and(|left| {
                        named(ctx, left)
                            && field_symbol(ctx, &symbol(ctx, left))
                            && fields.contains(&ctx.text(left, "Name"))
                    })
            });
            if violation {
                out.push(hit(statement));
            }
        }
    }
}

fn volatile(ctx: &Ctx, found: &Option<Symbol>) -> bool {
    match found {
        Some(Symbol::Declared(variable)) => {
            ctx.flag(*variable, "Field")
                && ctx.parent(*variable).and_then(|declarator| ctx.parent(declarator)).is_some_and(|declaration| {
                    ctx.has_modifier(declaration, "volatile")
                })
        }
        Some(Symbol::Field(class, name)) => ctx
            .machine
            .resolver
            .index
            .field(class, name)
            .is_some_and(|(_, field)| field.flags & flag::VOLATILE != 0),
        None => false,
    }
}

fn volatile_reference(ctx: &Ctx, expression: Option<u32>) -> bool {
    expression.is_some_and(|at| named(ctx, at) && volatile(ctx, &symbol(ctx, at)))
}

fn refers_to(ctx: &Ctx, expression: Option<u32>, target: &Symbol) -> bool {
    expression.is_some_and(|at| named(ctx, at) && symbol(ctx, at).as_ref() == Some(target))
}

fn local_only_from_volatile(ctx: &Ctx, method: u32, local: &Symbol) -> bool {
    let Symbol::Declared(variable) = local else { return false };
    if ctx.flag(*variable, "Field") {
        return false;
    }
    let initializer = ctx
        .parent(*variable)
        .filter(|declarator| ctx.is(*declarator, "VariableDeclarator"))
        .and_then(|declarator| ctx.nth(declarator, 1));
    (initializer.is_none() || volatile_reference(ctx, initializer))
        && ctx.descendants(method).into_iter().all(|assignment| {
            !ctx.is(assignment, "AssignmentExpression")
                || !refers_to(ctx, ctx.nth(assignment, 0), local)
                || volatile_reference(ctx, ctx.nth(assignment, 1))
        })
}

pub fn double_checked_locking(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &method in ctx.all("MethodDeclaration") {
        let primitive = ctx.kid(method, "PrimitiveType").is_some();
        if ctx.is_void(method) || primitive || ctx.kid(method, "Block").is_none() {
            continue;
        }
        let inside = ctx.descendants(method);
        let returns: Vec<u32> = inside.iter().copied().filter(|at| ctx.is(*at, "ReturnStatement")).collect();
        let [statement] = returns.as_slice() else { continue };
        let Some(returned) = ctx.nth(*statement, 0).filter(|at| named(ctx, *at)) else { continue };
        let Some(variable) = symbol(ctx, returned) else { continue };
        let found = Some(variable.clone());
        if volatile(ctx, &found) || local_only_from_volatile(ctx, method, &variable) {
            continue;
        }
        let ifs: Vec<u32> = inside.iter().copied().filter(|at| ctx.is(*at, "IfStatement")).collect();
        let [outer, inner] = ifs.as_slice() else { continue };
        let path = StablePath::variable(variable.clone());
        if !null_check(ctx, ctx.nth(*outer, 0), &path) {
            continue;
        }
        let locks: Vec<u32> =
            ctx.descendants(*outer).into_iter().filter(|at| ctx.is(*at, "SynchronizedStatement")).collect();
        if locks.len() != 1 || !null_check(ctx, ctx.nth(*inner, 0), &path) {
            continue;
        }
        let assignments: Vec<u32> =
            ctx.descendants(*inner).into_iter().filter(|at| ctx.is(*at, "AssignmentExpression")).collect();
        if let [assignment] = assignments.as_slice()
            && refers_to(ctx, ctx.nth(*assignment, 0), &variable)
        {
            out.push(hit(method));
        }
    }
}
