//! PMD's CloseResourceRule: local resources that are neither closed in a `finally` block, nor declared in a
//! try-with-resources, nor returned.
use super::types::{
    Settings, allowed, initializer, instance_of_resource, resource_or_subtype, type_name, type_of_variable,
};
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use std::collections::HashSet;

const WRAPPING: &str = "it is recommended to wrap resource ''{0}'' in try-with-resource declaration directly";
const REASSIGNED: &str = "''{0}'' is reassigned, but the original instance is not closed";
const NOT_IN_FINALLY: &str =
    "''{0}'' is not closed within a finally block, thus might not be closed at all in case of exceptions";

fn saying(node: u32, pattern: &str, name: String) -> Hit {
    Hit { node, args: vec![name], message: Some(pattern.to_string()) }
}

pub fn close_resource(ctx: &Ctx, out: &mut Vec<Hit>) {
    let settings = Settings::of(ctx);
    let mut reported: HashSet<String> = HashSet::new();
    for id in 0..ctx.tree.nodes.len() as u32 {
        match ctx.name(id) {
            "MethodDeclaration" | "ConstructorDeclaration" => {
                reported.clear();
                if !check_method(ctx, &settings, id, &mut reported, out) {
                    return;
                }
            }
            "MethodCall" if settings.close_not_in_finally => {
                let Some(closed) = ctx.qualifier(id).filter(|at| ctx.is(*at, "VariableAccess")) else { continue };
                let name = ctx.text(closed, "Name");
                if close_target(ctx, &settings, id)
                    && ctx.enclosing(closed, &["FinallyClause"]).is_none()
                    && !reported.contains(&name)
                {
                    out.push(saying(closed, NOT_IN_FINALLY, name));
                }
            }
            _ => {}
        }
    }
}

/// Checks one method or constructor; false where PMD stops the rule on the file with an exception.
fn check_method(ctx: &Ctx, settings: &Settings, method: u32, reported: &mut HashSet<String>, out: &mut Vec<Hit>) -> bool {
    for variable in resource_variables(ctx, settings, method) {
        let runtime = type_of_variable(ctx, variable);
        let kind = wrapped_type(ctx, settings, variable).or(runtime);
        let name = ctx.text(variable, "Name");
        if wrapping_resource_in_try(ctx, variable) {
            reported.insert(name.clone());
            out.push(saying(variable, WRAPPING, name));
            continue;
        }
        let unclosed = if !allowed(ctx, settings, kind) && !wraps_parameter(ctx, settings, variable, method) {
            match closed(ctx, settings, variable) {
                Some(closed) => !closed,
                None => return false,
            }
        } else {
            false
        };
        if unclosed {
            reported.insert(name);
            let Some(printed) = type_name(ctx, variable, runtime) else { return false };
            out.push(Hit { node: variable, args: vec![printed], message: None });
        } else if !allowed(ctx, settings, kind)
            && let Some(statement) = super::reassign::reassigned_before_closed(ctx, settings, variable, method)
        {
            reported.insert(name.clone());
            out.push(saying(statement, REASSIGNED, name));
        }
    }
    true
}

pub(super) fn refers_to(ctx: &Ctx, expression: Option<u32>, variable: u32) -> bool {
    expression.is_some_and(|at| {
        matches!(ctx.name(at), "VariableAccess" | "FieldAccess") && ctx.usages().declaration(at) == Some(variable)
    })
}

fn resource_variables(ctx: &Ctx, settings: &Settings, method: u32) -> Vec<u32> {
    let Some(body) = ctx.kid(method, "Block") else { return Vec::new() };
    ctx.descendants(body)
        .into_iter()
        .filter(|at| ctx.is(*at, "VariableId"))
        .filter(|variable| {
            let parent = ctx.parent(*variable).map(|parent| ctx.name(parent)).unwrap_or_default();
            !matches!(parent, "FormalParameter" | "LambdaParameter" | "CatchParameter")
        })
        .filter(|variable| not_in_own_try_with_resources(ctx, *variable))
        .filter(|variable| {
            resource_or_subtype(ctx, settings, *variable)
                || instance_of_resource(ctx, settings, type_of_variable(ctx, *variable))
        })
        .filter(|variable| {
            !super::types::declaration(ctx, *variable)
                .is_some_and(|owner| ctx.annotation_present(owner, "lombok.Cleanup"))
        })
        .filter(|variable| {
            !initializer(ctx, *variable).is_some_and(|value| ctx.matches_sig(value, "java.nio.file.FileSystems#getDefault()"))
        })
        .collect()
}

fn not_in_own_try_with_resources(ctx: &Ctx, variable: u32) -> bool {
    let statement = ctx
        .ancestors(variable)
        .find(|at| ctx.is(*at, "TryStatement") && ctx.kid(*at, "ResourceList").is_some());
    statement.is_none_or(|statement| !specified_in_try(ctx, variable, statement))
}

/// PMD `isVariableSpecifiedInTryWithResource`.
fn specified_in_try(ctx: &Ctx, variable: u32, statement: u32) -> bool {
    let Some(resources) = ctx.kid(statement, "ResourceList") else { return false };
    let below = ctx.descendants(resources);
    if below.contains(&variable) {
        return true;
    }
    std::iter::once(resources)
        .chain(below)
        .any(|at| ctx.is(at, "VariableAccess") && refers_to(ctx, Some(at), variable))
}

fn try_with_resources_naming(ctx: &Ctx, statement: u32, variable: u32) -> bool {
    ctx.kid(statement, "ResourceList").is_some() && specified_in_try(ctx, variable, statement)
}

fn wrapped_type(ctx: &Ctx, settings: &Settings, variable: u32) -> Option<u32> {
    let value = initializer(ctx, variable)?;
    let allocation = std::iter::once(value)
        .chain(ctx.descendants(value))
        .filter(|at| ctx.is(*at, "ConstructorCall"))
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .find(|call| resource_or_subtype(ctx, settings, *call))?;
    let first = ctx.arguments(allocation).first().copied();
    Some(
        first
            .filter(|first| !ctx.is(*first, "MethodCall") && resource_or_subtype(ctx, settings, *first))
            .unwrap_or(allocation),
    )
}

/// PMD `getWrappedVariableName`: the first variable read in the value that is not the target of a call.
fn wrapped_variable(ctx: &Ctx, variable: u32) -> Option<u32> {
    let value = initializer(ctx, variable)?;
    std::iter::once(value).chain(ctx.descendants(value)).find(|at| {
        ctx.is(*at, "VariableAccess") && !ctx.parent(*at).is_some_and(|parent| ctx.is(parent, "MethodCall"))
    })
}

fn wrapping_resource_in_try(ctx: &Ctx, variable: u32) -> bool {
    let Some(wrapped) = wrapped_variable(ctx, variable) else { return false };
    let Some(declared) = ctx.usages().declaration(wrapped) else { return false };
    ctx.ancestors(declared)
        .filter(|at| ctx.is(*at, "TryStatement"))
        .collect::<Vec<_>>()
        .into_iter()
        .any(|statement| try_with_resources_naming(ctx, statement, declared))
}

fn wraps_parameter(ctx: &Ctx, settings: &Settings, variable: u32, method: u32) -> bool {
    let Some(wrapped) = wrapped_variable(ctx, variable) else { return false };
    let Some(parameters) = ctx.kid(method, "FormalParameters") else { return false };
    let mut used = ctx.parent(wrapped);
    if used.is_some_and(|at| ctx.is(at, "CastExpression")) {
        used = used.and_then(|at| ctx.parent(at));
    }
    let plain_use = used.is_some_and(|at| matches!(ctx.name(at), "VariableDeclarator" | "AssignmentExpression"));
    ctx.kids_named(parameters, "FormalParameter").any(|parameter| {
        let Some(id) = ctx.kid(parameter, "VariableId") else { return false };
        (resource_or_subtype(ctx, settings, parameter) || plain_use) && refers_to(ctx, Some(wrapped), id)
    })
}

/// Whether the variable is closed or returned; nothing where PMD fails on a `try` written before it on its line.
fn closed(ctx: &Ctx, settings: &Settings, variable: u32) -> Option<bool> {
    let Some(method) = ctx.ancestors(variable).find(|at| matches!(ctx.name(*at), "Block" | "ConstructorDeclaration"))
    else {
        return Some(false);
    };
    for statement in ctx.below(method).filter(|at| ctx.is(*at, "TryStatement")) {
        if try_closes(ctx, settings, statement, variable)? {
            return Some(true);
        }
    }
    Some(returned(ctx, variable, method))
}

fn line(ctx: &Ctx, id: u32) -> i64 {
    ctx.whole(id, "BeginLine").unwrap_or(0)
}

fn try_closes(ctx: &Ctx, settings: &Settings, statement: u32, variable: u32) -> Option<bool> {
    if line(ctx, statement) < line(ctx, variable) || critical_between(ctx, variable, statement)? {
        return Some(false);
    }
    if try_with_resources_naming(ctx, statement, variable) {
        return Some(true);
    }
    Some(match ctx.kid(statement, "FinallyClause").and_then(|finally| ctx.kid(finally, "Block")) {
        Some(block) => block_closes(ctx, settings, block, variable),
        None => false,
    })
}

fn statement(ctx: &Ctx, id: u32) -> bool {
    let name = ctx.name(id);
    name.ends_with("Statement") || matches!(name, "Block" | "LocalVariableDeclaration" | "ExplicitConstructorInvocation")
}

/// PMD `anyCriticalStatementBetween`; nothing where PMD's `subList` throws on a `try` before the declaration.
fn critical_between(ctx: &Ctx, variable: u32, statement_node: u32) -> Option<bool> {
    let Some(declared) = ctx.ancestors(variable).find(|at| statement(ctx, *at)) else { return Some(false) };
    if initializer(ctx, variable).is_some_and(|value| ctx.is(value, "NullLiteral"))
        || ctx.parent(declared) != ctx.parent(statement_node)
    {
        return Some(false);
    }
    let Some(parent) = ctx.parent(declared) else { return Some(false) };
    let siblings: Vec<u32> = ctx.kids(parent).iter().copied().filter(|at| statement(ctx, *at)).collect();
    let top = siblings.iter().position(|at| *at == declared).unwrap_or(0);
    let bottom = siblings.iter().position(|at| *at == statement_node).unwrap_or(0);
    let between = siblings.get(top + 1..bottom)?;
    Some(between.iter().any(|between| {
        !std::iter::once(*between)
            .chain(ctx.descendants(*between))
            .any(|at| matches!(ctx.name(at), "LocalVariableDeclaration" | "AssignmentExpression"))
    }))
}

fn block_closes(ctx: &Ctx, settings: &Settings, block: u32, variable: u32) -> bool {
    let unconditional = ctx.descendants(block).into_iter().any(|call| {
        ctx.is(call, "MethodCall")
            && refers_to(ctx, ctx.qualifier(call), variable)
            && close_target(ctx, settings, call)
            && not_conditional(ctx, block, call, variable)
    });
    unconditional || ctx.below(block).any(|call| closing_call(ctx, settings, call, variable))
}

fn not_conditional(ctx: &Ctx, block: u32, call: u32, variable: u32) -> bool {
    let Some(statement) = ctx.enclosing(call, &["IfStatement"]) else { return true };
    if !ctx.descendants(block).contains(&statement) {
        return true;
    }
    let condition = ctx.nth(statement, 0);
    if let Some(condition) = condition.filter(|at| ctx.is(*at, "InfixExpression") && ctx.text(*at, "Operator") == "!=") {
        let (left, right) = (ctx.nth(condition, 0), ctx.nth(condition, 1));
        let null = |side: Option<u32>| side.is_some_and(|at| ctx.is(at, "NullLiteral"));
        if (refers_to(ctx, left, variable) && null(right)) || (refers_to(ctx, right, variable) && null(left)) {
            return true;
        }
    }
    condition.is_some_and(|condition| {
        ctx.is(condition, "MethodCall")
            && ctx.matches_sig(condition, "java.util.Objects#nonNull(_)")
            && refers_to(ctx, ctx.arguments(condition).first().copied(), variable)
    })
}

fn close_target(ctx: &Ctx, settings: &Settings, call: u32) -> bool {
    let mut name = ctx.method_name(call);
    if let Some(qualifier) = ctx.qualifier(call).filter(|at| ctx.is(*at, "TypeExpression")) {
        name = format!("{}.{name}", ctx.source_text(qualifier));
    }
    settings.close_targets.contains(&name)
}

fn chained_close_target(ctx: &Ctx, settings: &Settings, call: u32) -> bool {
    let mut walker = Some(call);
    while let Some(at) = walker.filter(|at| ctx.is(*at, "MethodCall")) {
        if close_target(ctx, settings, at) {
            return true;
        }
        walker = ctx.qualifier(at);
    }
    false
}

pub(super) fn closing_call(ctx: &Ctx, settings: &Settings, call: u32, variable: u32) -> bool {
    if !ctx.is(call, "MethodCall") || !(close_target(ctx, settings, call) || chained_close_target(ctx, settings, call)) {
        return false;
    }
    let Some(arguments) = ctx.kid(call, "ArgumentList") else { return false };
    ctx.descendants(arguments).into_iter().any(|at| refers_to(ctx, Some(at), variable))
}

fn returned(ctx: &Ctx, variable: u32, method: u32) -> bool {
    ctx.below(method).filter(|at| ctx.is(*at, "ReturnStatement")).any(|statement| {
        ctx.descendants(statement).into_iter().any(|access| {
            ctx.is(access, "VariableAccess")
                && !ctx.parent(access).is_some_and(|parent| ctx.is(parent, "MethodCall"))
                && refers_to(ctx, Some(access), variable)
        })
    })
}
