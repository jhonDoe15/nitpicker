//! Error prone rules about classes and their methods.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit;

pub fn single_method_singleton(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &class in ctx.all("ClassDeclaration") {
        let getters = ctx
            .descendants(class)
            .into_iter()
            .filter(|at| ctx.is(*at, "MethodDeclaration") && ctx.text(*at, "Name") == "getInstance")
            .count();
        if getters > 1 {
            out.push(hit(class));
        }
    }
}

pub fn junit_spelling(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &class in ctx.all("ClassDeclaration") {
        if !ctx.is_junit3_class(class) {
            continue;
        }
        for method in ctx.declarations(class, "MethodDeclaration") {
            let name = ctx.text(method, "Name");
            let misspelt = (name != "setUp" && name.eq_ignore_ascii_case("setup"))
                || (name != "tearDown" && name.eq_ignore_ascii_case("teardown"));
            if ctx.arity(method) == 0 && misspelt {
                out.push(hit(method));
            }
        }
    }
}

pub fn junit_static_suite(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &class in ctx.all("ClassDeclaration") {
        if !ctx.is_junit3_class(class) {
            continue;
        }
        let methods = ctx.declarations(class, "MethodDeclaration");
        let suite = methods
            .into_iter()
            .find(|method| ctx.text(*method, "Name") == "suite" && ctx.arity(*method) == 0);
        if let Some(suite) = suite
            && (!ctx.is_public(suite) || !ctx.has_modifier(suite, "static"))
        {
            out.push(hit(suite));
        }
    }
}

pub fn detached_test_case(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &class in ctx.all("ClassDeclaration") {
        let methods = ctx.declarations(class, "MethodDeclaration");
        if !methods.iter().any(|method| ctx.is_test_method(*method)) {
            continue;
        }
        for method in methods {
            let modifiers = ctx.modifiers(method, "EffectiveModifiers");
            let excluded = ["static", "private", "protected", "abstract"]
                .iter()
                .any(|name| modifiers.iter().any(|written| written == name));
            if ctx.arity(method) == 0 && ctx.is_void(method) && !excluded && ctx.annotations(method).is_empty() {
                out.push(hit(method));
            }
        }
    }
}

fn clone_method(ctx: &Ctx, method: u32) -> bool {
    ctx.text(method, "Name") == "clone" && ctx.arity(method) == 0 && !ctx.has_modifier(method, "static")
}

pub fn proper_clone_implementation(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &method in ctx.all("MethodDeclaration") {
        if !clone_method(ctx, method) || ctx.has_modifier(method, "abstract") {
            continue;
        }
        let Some(owner) = ctx.enclosing_type(method) else {
            continue;
        };
        if ctx.has_modifier(owner, "final") {
            continue;
        }
        let Some(own) = ctx.type_of(owner).map(|kind| kind.erased().name().to_string()) else {
            continue;
        };
        let allocates = ctx
            .descendants(method)
            .into_iter()
            .any(|at| ctx.is(at, "ConstructorCall") && ctx.type_of(at).is_some_and(|made| made.erased().name() == own));
        if allocates {
            out.push(hit(method));
        }
    }
}

pub fn clone_method_must_implement_cloneable(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &method in ctx.all("MethodDeclaration") {
        if !clone_method(ctx, method) {
            continue;
        }
        if let Some(body) = ctx.kid(method, "Block")
            && ctx.kids(body).len() == 1
            && ctx.kids(body).first().is_some_and(|only| {
                ctx.is(*only, "ThrowStatement")
                    && ctx
                        .nth(*only, 0)
                        .is_some_and(|thrown| ctx.type_is(thrown, "java.lang.CloneNotSupportedException"))
            })
        {
            continue;
        }
        let Some(owner) = ctx.enclosing_type(method) else {
            continue;
        };
        if ctx.is(owner, "ClassDeclaration") && !ctx.type_is(owner, "java.lang.Cloneable") {
            out.push(hit(method));
        }
    }
}

fn equals_method(ctx: &Ctx, method: u32) -> bool {
    let object_parameter = ctx
        .kid(method, "FormalParameters")
        .and_then(|list| ctx.kid(list, "FormalParameter"))
        .is_some_and(|parameter| ctx.type_is_exactly(parameter, "java.lang.Object"));
    ctx.text(method, "Name") == "equals"
        && ctx.arity(method) == 1
        && object_parameter
        && !ctx.has_modifier(method, "static")
}

fn hash_code_method(ctx: &Ctx, method: u32) -> bool {
    ctx.text(method, "Name") == "hashCode" && ctx.arity(method) == 0 && !ctx.has_modifier(method, "static")
}

pub fn override_both_equals_and_hashcode(ctx: &Ctx, out: &mut Vec<Hit>) {
    let mut types = Vec::new();
    for name in ["ClassDeclaration", "RecordDeclaration", "AnonymousClassDeclaration"] {
        types.extend(ctx.all(name).iter().copied().filter(|class| !ctx.flag(*class, "Interface")));
    }
    types.sort_unstable();
    for declaration in types {
        if ctx.type_is(declaration, "java.lang.Comparable") {
            continue;
        }
        let (mut equals, mut hash_code) = (None, None);
        for method in ctx.declarations(declaration, "MethodDeclaration") {
            if equals_method(ctx, method) {
                equals = Some(method);
                if hash_code.is_some() {
                    break;
                }
            } else if hash_code_method(ctx, method) {
                hash_code = Some(method);
                if equals.is_some() {
                    break;
                }
            }
        }
        if let (Some(method), None) | (None, Some(method)) = (equals, hash_code) {
            out.push(hit(method));
        }
    }
}
