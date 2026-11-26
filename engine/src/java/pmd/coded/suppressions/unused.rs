//! PMD's `JavaAnnotationSuppressor.hasUnusedWarning`: whether `@SuppressWarnings("unused")` on a declaration can
//! only be meant for PMD, because javac would find nothing unused there.
use crate::java::pmd::coded::ctx::Ctx;

/// True where PMD finds the declaration free of anything unused and the value unambiguous (`OptionalBool.NO`).
pub fn unambiguous(ctx: &Ctx, annotation: u32) -> bool {
    let Some(scope) = ctx
        .parent(annotation)
        .filter(|list| ctx.is(*list, "ModifierList"))
        .and_then(|list| ctx.parent(list))
    else {
        return false;
    };
    if unused_variables(ctx, scope) || unused_type_parameters(ctx, scope) {
        return false;
    }
    match ctx.name(scope) {
        "FieldDeclaration" => true,
        "ClassDeclaration" => private(ctx, scope) && used(ctx, scope),
        _ => false,
    }
}

fn unused_variables(ctx: &Ctx, scope: u32) -> bool {
    ctx.below(scope).filter(|at| ctx.is(*at, "VariableId")).any(|variable| {
        let usages = ctx.usages().of_variable(variable);
        usages.is_empty() || usages.iter().all(|usage| ctx.text(*usage, "AccessType") != "READ")
    })
}

fn outside_modifiers(ctx: &Ctx, scope: u32, id: u32) -> bool {
    !ctx.ancestors(id).take_while(|at| *at != scope).any(|at| ctx.is(at, "ModifierList"))
}

/// The type parameter a written type names, as the closest declaration with a type parameter of that name.
fn named_parameter(ctx: &Ctx, written: u32) -> Option<u32> {
    if ctx.kids(written).iter().any(|kid| ctx.is(*kid, "ClassType")) {
        return None;
    }
    let name = ctx.text(written, "SimpleName");
    ctx.ancestors(written).find_map(|owner| {
        let parameters = ctx.kid(owner, "TypeParameters")?;
        ctx.kids_named(parameters, "TypeParameter").find(|parameter| ctx.text(*parameter, "Name") == name)
    })
}

fn unused_type_parameters(ctx: &Ctx, scope: u32) -> bool {
    let seen: Vec<u32> = ctx.below(scope).filter(|at| outside_modifiers(ctx, scope, *at)).collect();
    let mut parameters: Vec<u32> = seen.iter().copied().filter(|at| ctx.is(*at, "TypeParameter")).collect();
    for &written in seen.iter().filter(|at| ctx.is(**at, "ClassType")) {
        if let Some(parameter) = named_parameter(ctx, written) {
            parameters.retain(|known| *known != parameter);
        }
    }
    !parameters.is_empty()
}

fn rank(visibility: &str) -> u8 {
    match visibility {
        "anonymous" => 0,
        "local" => 1,
        "private" => 2,
        "package" => 3,
        "protected" => 4,
        _ => 5,
    }
}

/// PMD `getEffectiveVisibility() == V_PRIVATE`: the narrowest visibility of the class and the types around it.
fn private(ctx: &Ctx, declaration: u32) -> bool {
    let types = std::iter::once(declaration).chain(
        ctx.ancestors(declaration)
            .filter(|at| crate::java::pmd::coded::ctx::TYPE_DECLARATIONS.contains(&ctx.name(*at))),
    );
    types.map(|at| rank(&ctx.text(at, "Visibility"))).min() == Some(2)
}

/// PMD looks for uses with `getRoot().descendants()`, which does not enter nested types or lambdas.
fn used(ctx: &Ctx, declaration: u32) -> bool {
    let Some(name) = ctx.class_name(declaration) else { return false };
    ctx.descendants(0)
        .into_iter()
        .filter(|at| ctx.is(*at, "ClassType"))
        .any(|written| ctx.type_of(written).is_some_and(|kind| kind.erased().name() == name))
}
