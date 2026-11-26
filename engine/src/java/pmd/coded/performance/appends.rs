//! Performance rules about appending to strings and string builders.
use super::builders::operands;
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit;

const LOOPS: &[&str] = &["ForStatement", "ForeachStatement", "WhileStatement", "DoStatement"];

fn in_loop(ctx: &Ctx, id: u32) -> bool {
    ctx.enclosing(id, LOOPS).is_some()
}

fn foreach_variable(ctx: &Ctx, variable: u32) -> bool {
    ctx.parent(variable)
        .and_then(|declarator| ctx.parent(declarator))
        .and_then(|declaration| ctx.parent(declaration))
        .is_some_and(|statement| ctx.is(statement, "ForeachStatement"))
}

fn references(ctx: &Ctx, access: u32, variable: u32) -> bool {
    matches!(ctx.name(access), "VariableAccess" | "FieldAccess") && ctx.usages().declaration(access) == Some(variable)
}

pub fn use_string_buffer_for_string_appends(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &variable in ctx.all("VariableId") {
        if !ctx.type_is(variable, "java.lang.String") || foreach_variable(ctx, variable) {
            continue;
        }
        let outside_only = ctx.flag(variable, "Field")
            || ctx.parent(variable).is_some_and(|parent| ctx.is(parent, "FormalParameter"));
        let mut counter = 0;
        let mut possible = Vec::new();
        for &usage in ctx.usages().of_variable(variable) {
            if outside_only && !in_loop(ctx, usage) {
                continue;
            }
            let mut simple = false;
            if let Some(assignment) = ctx.parent(usage).filter(|parent| ctx.is(*parent, "AssignmentExpression")) {
                let compound = ctx.flag(assignment, "Compound");
                if compound {
                    counter += 1;
                }
                let mut found = Vec::new();
                if let Some(right) = ctx.nth(assignment, 1) {
                    operands(ctx, right, &mut found);
                }
                let on_right = found.iter().filter(|operand| references(ctx, **operand, variable)).count();
                counter += on_right;
                simple = !compound && on_right == 0;
            }
            if ctx.text(usage, "AccessType") == "WRITE" && !simple {
                if in_loop(ctx, usage) {
                    out.push(hit(usage));
                } else {
                    possible.push(usage);
                }
            }
        }
        if counter > 1 {
            out.extend(possible.into_iter().map(hit));
        }
    }
}

fn builder_append(ctx: &Ctx, id: u32) -> bool {
    ctx.is(id, "MethodCall")
        && ctx.method_name(id) == "append"
        && matches!(
            ctx.declaring(id).as_deref(),
            Some("java.lang.StringBuilder" | "java.lang.StringBuffer")
        )
}

fn chain_qualifier(ctx: &Ctx, base: u32) -> Option<u32> {
    let mut at = Some(base);
    while let Some(call) = at.filter(|call| builder_append(ctx, *call)) {
        at = ctx.qualifier(call);
    }
    if at == Some(base) { None } else { at }
}

fn variable_of(ctx: &Ctx, access: Option<u32>) -> Option<u32> {
    let access = access.filter(|access| matches!(ctx.name(*access), "VariableAccess" | "FieldAccess"))?;
    ctx.usages().declaration(access)
}

fn appended(ctx: &Ctx, statement: u32) -> Option<u32> {
    let expression = ctx.nth(statement, 0)?;
    match ctx.name(expression) {
        "MethodCall" => variable_of(ctx, chain_qualifier(ctx, expression)),
        "AssignmentExpression" => {
            chain_qualifier(ctx, ctx.nth(expression, 1)?)?;
            variable_of(ctx, ctx.nth(expression, 0))
        }
        _ => None,
    }
}

fn next_sibling(ctx: &Ctx, id: u32) -> Option<u32> {
    let siblings = ctx.kids(ctx.parent(id)?);
    let at = siblings.iter().position(|kid| *kid == id)?;
    siblings.get(at + 1).copied()
}

pub fn consecutive_appends_should_reuse(ctx: &Ctx, out: &mut Vec<Hit>) {
    for name in ["ExpressionStatement", "LocalVariableDeclaration"] {
        for &statement in ctx.all(name) {
            let Some(next) = next_sibling(ctx, statement).filter(|next| ctx.is(*next, "ExpressionStatement")) else {
                continue;
            };
            let Some(variable) = appended(ctx, next) else { continue };
            let found = if name == "ExpressionStatement" {
                appended(ctx, statement) == Some(variable)
            } else {
                ctx.parent(variable).is_some_and(|declarator| {
                    ctx.parent(declarator) == Some(statement)
                        && ctx.nth(declarator, 1).is_some_and(|initializer| builder_append(ctx, initializer))
                })
            };
            if found {
                out.push(hit(statement));
            }
        }
    }
}
