//! Rules about unused fields and parameters, and about concrete collection types in declarations.
use crate::java::pmd::coded::bestpractices::{explicitly_unused, never_used, read_usage};
use crate::java::pmd::coded::ctx::{Ctx, Hit, TYPE_DECLARATIONS};
use crate::java::pmd::coded::hit_with;
use crate::java::types::model::Type;

fn annotated(ctx: &Ctx, owner: u32, report_for: &[String]) -> bool {
    let declared: Vec<u32> = ctx
        .annotations(owner)
        .into_iter()
        .filter(|annotation| !ctx.type_is(*annotation, "java.lang.SuppressWarnings"))
        .collect();
    let reported = report_for.iter().any(|name| declared.iter().any(|annotation| ctx.type_is(*annotation, name)));
    !reported && !declared.is_empty()
}

pub fn unused_private_field(ctx: &Ctx, out: &mut Vec<Hit>) {
    let ignored = ctx.property_list("ignoredFieldNames", &["serialVersionUID", "serialPersistentFields"]);
    let report_for = ctx.property_list("reportForAnnotations", &[]);
    let mut types: Vec<u32> = TYPE_DECLARATIONS.iter().flat_map(|name| ctx.all(name).iter().copied()).collect();
    types.sort_unstable();
    for declaration in types {
        if annotated(ctx, declaration, &report_for) {
            continue;
        }
        for field in ctx.declarations(declaration, "FieldDeclaration") {
            let variables: Vec<u32> = ctx
                .kids_named(field, "VariableDeclarator")
                .filter_map(|declarator| ctx.kid(declarator, "VariableId"))
                .collect();
            let private = variables.first().is_some_and(|first| ctx.text(*first, "Visibility") == "private");
            let ok = variables.iter().any(|variable| ignored.contains(&ctx.text(*variable, "Name")));
            if !private || ok || annotated(ctx, field, &report_for) {
                continue;
            }
            for variable in variables {
                if never_used(ctx, variable) && !read_elsewhere(ctx, declaration, variable) {
                    out.push(hit_with(variable, &[&ctx.text(variable, "Name")]));
                }
            }
        }
    }
}

/// Whether a `FieldAccess` on something other than plain `this` reads the field.
fn read_elsewhere(ctx: &Ctx, declaration: u32, variable: u32) -> bool {
    let name = ctx.text(variable, "Name");
    let owner = ctx.text(declaration, "BinaryName");
    let index = ctx.machine.resolver.index;
    ctx.all("FieldAccess").iter().any(|&access| {
        ctx.text(access, "Name") == name
            && ctx.usages().declaration(access).is_none()
            && read_usage(ctx, access)
            && ctx.nth(access, 0).and_then(|on| ctx.type_of(on)).is_some_and(|on| {
                index.field(&on.erased().name(), &name).is_some_and(|(class, _)| class.name == owner)
            })
    })
}

fn read_object(ctx: &Ctx, method: u32) -> bool {
    let exactly = |list: Option<u32>, kind: &'static str, name: &str| {
        list.map(|list| ctx.kids_named(list, kind).collect::<Vec<_>>())
            .is_some_and(|all| matches!(all.as_slice(), [only] if ctx.type_is_exactly(*only, name)))
    };
    ctx.text(method, "Visibility") == "private"
        && ctx.text(method, "Name") == "readObject"
        && exactly(ctx.kid(method, "ThrowsList"), "ClassType", "java.io.InvalidObjectException")
        && exactly(ctx.kid(method, "FormalParameters"), "FormalParameter", "java.io.ObjectInputStream")
}

pub fn unused_formal_parameter(ctx: &Ctx, out: &mut Vec<Hit>) {
    let check_all = ctx.property_flag("checkAll", false);
    let mut executables = ctx.all("MethodDeclaration").to_vec();
    executables.extend_from_slice(ctx.all("ConstructorDeclaration"));
    executables.sort_unstable();
    for executable in executables {
        let method = ctx.is(executable, "MethodDeclaration");
        if method {
            if ctx.text(executable, "Visibility") != "private" && !check_all {
                continue;
            }
            let skipped = ctx.kid(executable, "Block").is_none()
                || ctx.has_modifier(executable, "default")
                || read_object(ctx, executable)
                || ctx.flag(executable, "Overridden");
            if skipped {
                continue;
            }
        }
        let Some(list) = ctx.kid(executable, "FormalParameters") else { continue };
        for formal in ctx.kids_named(list, "FormalParameter") {
            let Some(variable) = ctx.kid(formal, "VariableId") else { continue };
            let name = ctx.text(variable, "Name");
            if never_used(ctx, variable) && !explicitly_unused(&name) {
                let kind = if method { "method" } else { "constructor" };
                out.push(hit_with(variable, &[kind, &name]));
            }
        }
    }
}

const ALLOWED_PARENTS: &[&str] = &[
    "ConstructorCall",
    "TypeExpression",
    "CastExpression",
    "ClassLiteral",
    "ClassType",
    "ExtendsList",
    "ThisExpression",
    "SuperExpression",
    "ModuleProvidesDirective",
];

fn type_variable(ctx: &Ctx, written: u32) -> bool {
    if ctx.kids(written).iter().any(|kid| ctx.is(*kid, "ClassType")) {
        return false;
    }
    let name = ctx.text(written, "SimpleName");
    ctx.ancestors(written).any(|at| {
        ctx.kids(at).iter().filter(|kid| ctx.is(**kid, "TypeParameters")).any(|parameters| {
            ctx.kids(*parameters).iter().any(|kid| ctx.is(*kid, "TypeParameter") && ctx.text(*kid, "Name") == name)
        })
    })
}

pub fn loose_coupling(ctx: &Ctx, out: &mut Vec<Hit>) {
    let allowed = ctx.property_list("allowedTypes", &["java.util.Properties"]);
    let index = ctx.machine.resolver.index;
    for &written in ctx.all("ClassType") {
        let interface = |name: &str| index.get(name).is_some_and(|info| info.is_interface);
        let concrete = (ctx.type_is(written, "java.util.Collection") || ctx.type_is(written, "java.util.Map"))
            && !matches!(ctx.type_of(written), Some(Type::Class(ref name, _)) if interface(name));
        if !concrete {
            continue;
        }
        let overridden = ctx
            .ancestors(written)
            .find(|at| matches!(ctx.name(*at), "MethodDeclaration" | "Block"))
            .is_some_and(|at| ctx.is(at, "MethodDeclaration") && ctx.flag(at, "Overridden"));
        let parent = ctx.parent(written);
        let syntactic = parent.is_some_and(|parent| {
            ALLOWED_PARENTS.contains(&ctx.name(parent))
                || (ctx.is(parent, "ArrayType") && ctx.parent(parent).is_some_and(|up| ctx.is(up, "ArrayAllocation")))
        });
        let allowed_type = allowed.iter().any(|name| ctx.type_is(written, name));
        let variable = matches!(ctx.type_of(written), Some(Type::Variable(_))) || type_variable(ctx, written);
        if !overridden && !syntactic && !allowed_type && !variable {
            out.push(hit_with(written, &[&ctx.text(written, "SimpleName")]));
        }
    }
}
