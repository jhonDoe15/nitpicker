//! Rules about arrays kept in fields.
use super::paths::{Symbol, field_flags, field_of_this_instance, symbol};
use crate::java::pmd::coded::bestpractices::calls::literal_int;
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit_with;
use crate::java::types::model::Type;

pub fn array_is_stored_directly(ctx: &Ctx, out: &mut Vec<Hit>) {
    let allow_private = ctx.property_flag("allowPrivate", true);
    let mut methods = ctx.all("MethodDeclaration").to_vec();
    methods.extend_from_slice(ctx.all("ConstructorDeclaration"));
    methods.sort_unstable();
    for method in methods {
        let private = ctx.text(method, "Visibility") == "private";
        if (private && allow_private) || ctx.kid(method, "Block").is_none() {
            continue;
        }
        let Some(list) = ctx.kid(method, "FormalParameters") else { continue };
        for formal in ctx.kids_named(list, "FormalParameter") {
            if !matches!(ctx.type_of(formal), Some(Type::Array(_))) {
                continue;
            }
            let Some(variable) = ctx.kid(formal, "VariableId") else { continue };
            for &usage in ctx.usages().of_variable(variable) {
                if ctx.text(usage, "AccessType") == "WRITE" {
                    break;
                }
                let Some(assignment) = ctx.parent(usage).filter(|parent| ctx.is(*parent, "AssignmentExpression")) else {
                    continue;
                };
                if ctx.nth(assignment, 1) == Some(usage) && field_of_this_instance(ctx, ctx.nth(assignment, 0)) {
                    out.push(hit_with(assignment, &[&ctx.text(usage, "Name")]));
                }
            }
        }
    }
}

fn zero_length(ctx: &Ctx, expression: u32) -> bool {
    let initializer_length = |initializer: u32| ctx.kids(initializer).is_empty();
    match ctx.name(expression) {
        "ArrayInitializer" => initializer_length(expression),
        "ArrayAllocation" => match ctx.kid(expression, "ArrayInitializer") {
            Some(initializer) => initializer_length(initializer),
            None => {
                let dimensions = ctx.kid(expression, "ArrayType").and_then(|kind| ctx.kid(kind, "ArrayDimensions"));
                let last = dimensions.and_then(|dimensions| ctx.kids(dimensions).last().copied());
                last.filter(|last| ctx.is(*last, "ArrayDimExpr"))
                    .and_then(|last| ctx.kids(last).last().copied())
                    .is_some_and(|length| literal_int(ctx, length, 0))
            }
        },
        _ => false,
    }
}

fn empty_constant(ctx: &Ctx, access: u32) -> bool {
    let Some(Symbol::Declared(variable)) = symbol(ctx, access) else { return false };
    let initializer = ctx.parent(variable).and_then(|declarator| ctx.nth(declarator, 1));
    ctx.flag(variable, "Final") && initializer.is_some_and(|initializer| zero_length(ctx, initializer))
}

pub fn method_returns_internal_array(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &method in ctx.all("MethodDeclaration") {
        let array = ctx.kids(method).iter().any(|kid| ctx.is(*kid, "ArrayType"));
        if !array || ctx.text(method, "Visibility") == "private" {
            continue;
        }
        for statement in ctx.descendants(method) {
            if !ctx.is(statement, "ReturnStatement") {
                continue;
            }
            let named = |at: &u32| matches!(ctx.name(*at), "VariableAccess" | "FieldAccess");
            let Some(reference) = ctx.nth(statement, 0).filter(named) else {
                continue;
            };
            let name = ctx.text(reference, "Name");
            if field_of_this_instance(ctx, Some(reference)) {
                out.push(hit_with(statement, &[&name]));
            } else if field_flags(ctx, reference).is_some_and(|(fixed, public)| fixed && !public)
                && !empty_constant(ctx, reference)
            {
                out.push(hit_with(statement, &[&name]));
            }
        }
    }
}
