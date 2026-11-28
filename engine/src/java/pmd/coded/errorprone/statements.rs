//! Error prone rules about statements in loops and singleton getters.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::design::paths::{Symbol, local, symbol};
use crate::java::pmd::coded::hit;

fn nth_ancestor(ctx: &Ctx, id: u32, at: usize) -> Option<u32> {
    ctx.ancestors(id).nth(at)
}

fn branching_check(ctx: &Ctx, statement: u32, property: &str, out: &mut Vec<Hit>) {
    let kinds = ctx.property_list(property, &["for", "do", "while"]);
    let mut parent = ctx.parent(statement);
    if let Some(block) = parent.filter(|block| ctx.is(*block, "Block")) {
        parent = ctx.parent(block);
        if let Some(finally) = parent.filter(|finally| ctx.is(*finally, "FinallyClause")) {
            parent = nth_ancestor(ctx, finally, 2);
        }
    }
    let kind = match parent.map(|parent| ctx.name(parent)) {
        Some("ForStatement" | "ForeachStatement") => "for",
        Some("WhileStatement") => "while",
        Some("DoStatement") => "do",
        _ => return,
    };
    if kinds.iter().any(|written| written == kind) {
        out.push(hit(statement));
    }
}

pub fn avoid_branching_statement_as_last_in_loop(ctx: &Ctx, out: &mut Vec<Hit>) {
    let mut found = Vec::new();
    for (name, property) in [
        ("BreakStatement", "checkBreakLoopTypes"),
        ("ContinueStatement", "checkContinueLoopTypes"),
        ("ReturnStatement", "checkReturnLoopTypes"),
    ] {
        for &statement in ctx.all(name) {
            let in_switch = nth_ancestor(ctx, statement, 1).is_some_and(|at| ctx.is(at, "SwitchStatement"));
            if name == "BreakStatement" && in_switch {
                continue;
            }
            found.push((statement, property));
        }
    }
    found.sort_unstable();
    for (statement, property) in found {
        branching_check(ctx, statement, property, out);
    }
}

fn field_target(ctx: &Ctx, target: Option<u32>) -> bool {
    target.filter(|target| matches!(ctx.name(*target), "VariableAccess" | "FieldAccess")).is_some_and(|target| {
        match symbol(ctx, target) {
            Some(Symbol::Declared(variable)) => ctx.flag(variable, "Field"),
            Some(Symbol::Field(..)) => true,
            None => false,
        }
    })
}

fn next_sibling(ctx: &Ctx, id: u32) -> Option<u32> {
    let siblings = ctx.kids(ctx.parent(id)?);
    let at = siblings.iter().position(|kid| *kid == id)?;
    siblings.get(at + 1).copied()
}

fn chained_assignment(ctx: &Ctx, write: u32) -> bool {
    let Some(next) = next_sibling(ctx, write) else { return false };
    let parent = ctx.parent(write).filter(|parent| ctx.is(*parent, "AssignmentExpression"));
    if ctx.is(next, "ConstructorCall") {
        let Some(right) = parent else { return false };
        let Some(left) = ctx.parent(right).filter(|left| ctx.is(*left, "AssignmentExpression")) else {
            return false;
        };
        ctx.nth(right, 1).is_some_and(|value| ctx.is(value, "ConstructorCall"))
            && ctx.nth(left, 1) == Some(right)
            && field_target(ctx, ctx.nth(left, 0))
    } else if ctx.is(next, "AssignmentExpression") {
        let Some(left) = parent else { return false };
        ctx.nth(next, 1).is_some_and(|value| ctx.is(value, "ConstructorCall"))
            && ctx.nth(left, 1) == Some(next)
            && field_target(ctx, ctx.nth(next, 0))
    } else {
        false
    }
}

fn double_assignment(ctx: &Ctx, access: u32) -> bool {
    let Some(method) = ctx.enclosing(access, &["MethodDeclaration"]) else { return false };
    let target = symbol(ctx, access);
    ctx.descendants(method).into_iter().any(|other| {
        ctx.is(other, "VariableAccess")
            && ctx.text(other, "AccessType") == "WRITE"
            && ctx.text(other, "Name") == ctx.text(access, "Name")
            && target.is_some()
            && symbol(ctx, other) == target
            && chained_assignment(ctx, other)
    })
}

pub fn singleton_class_returning_new_instance(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &method in ctx.all("MethodDeclaration") {
        if ctx.is_void(method) || ctx.text(method, "Name") != "getInstance" {
            continue;
        }
        let returns: Vec<u32> =
            ctx.descendants(method).into_iter().filter(|at| ctx.is(*at, "ReturnStatement")).collect();
        let creates = returns
            .iter()
            .any(|statement| ctx.descendants(*statement).into_iter().any(|at| ctx.is(at, "ConstructorCall")));
        let locals = returns.iter().any(|statement| {
            ctx.kids_named(*statement, "VariableAccess")
                .any(|access| local(ctx, access) && !double_assignment(ctx, access))
        });
        if creates || locals {
            out.push(hit(method));
        }
    }
}
